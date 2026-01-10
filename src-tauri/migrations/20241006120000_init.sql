PRAGMA foreign_keys = ON;

-- ==========================================
-- Users 表，预留多用户
-- ==========================================
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL
);

-- ==========================================
-- 核心表：Nodes (万物皆节点)
-- ==========================================
CREATE TABLE nodes (
    node_id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL DEFAULT 1, -- 预留 user_id

    -- 1. 基础属性 (所有节点都有)
    title TEXT NOT NULL,         -- 标题 / 文件名 / 任务名
    summary TEXT,                -- Topic/Task/Resource Summary
    
    -- 2. 类型标识 (用于 UI 渲染区分，但支持流转)
    -- 'topic': 概念, 容器
    -- 'task': 待办
    -- 'resource': 文件, 链接
    node_type TEXT NOT NULL CHECK (node_type IN ('topic', 'task', 'resource')),

    -- 3. 任务组件 (Task Component) - 仅 node_type='task' 时有值，但允许赋予任何节点
    task_status TEXT DEFAULT 'todo' CHECK (task_status IN ('todo', 'done', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    due_date DATETIME,
    done_date DATETIME,

    -- 4. 资源组件 (Resource Component) - 仅 node_type='resource' 时有值
    file_hash TEXT,              -- SHA-256
    file_path TEXT,              -- 本地存储路径
    file_content TEXT,           -- 文件内容(文字/图片OCR/PDF解析)
    user_note TEXT,              -- 用户备注(仅在上传非文本时保存)
    resource_subtype TEXT CHECK (resource_subtype IN ('text', 'pdf', 'image', 'url', 'epub', 'other')),
    source_meta JSON,            -- { url, window_title, process_name, captured_at }

    -- 向量化状态 (针对资源本身)
    embedded_hash TEXT,
    processing_hash TEXT,
    embedding_status TEXT DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'synced', 'dirty', 'error')),
    last_embedding_at DATETIME,
    last_embedding_error TEXT,
    
    -- 资源处理状态 (Rust 后台使用)
    processing_stage TEXT DEFAULT 'todo' CHECK(processing_stage IN ('todo', 'embedding','done')),
    -- 用户侧的状态 (Inbox 功能核心)
    -- 'unreviewed': AI 处理完毕，在 Inbox 等待确认
    -- 'reviewed': 用户已确认/已归档
    -- 'rejected': 用户认为无效
    review_status TEXT DEFAULT 'reviewed'
        CHECK (
            (node_type = 'resource' AND review_status IN ('unreviewed', 'reviewed', 'rejected'))
            OR (node_type != 'resource' AND review_status = 'reviewed')
        ),

    -- 5. 系统/管理属性
    is_pinned BOOLEAN DEFAULT 0, -- 是否出现在Sidebar的收藏
    pinned_at DATETIME, -- 收藏时间,用来排序

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX idx_nodes_type ON nodes(node_type);
CREATE INDEX idx_nodes_uuid ON nodes(uuid);
CREATE INDEX idx_nodes_task_status ON nodes(task_status) WHERE task_status IS NOT NULL; -- 快速查任务
CREATE INDEX idx_nodes_file_hash ON nodes(file_hash) WHERE file_hash IS NOT NULL; -- 资源去重
CREATE INDEX idx_nodes_title ON nodes(title); -- 简单的标题搜索
CREATE INDEX idx_nodes_user_note ON nodes(user_note);
CREATE INDEX idx_nodes_due_date ON nodes(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_nodes_review_status ON nodes(review_status);
CREATE UNIQUE INDEX idx_nodes_topic_title_unique ON nodes(user_id, title)
    WHERE node_type = 'topic' AND is_deleted = 0;

-- ==========================================
-- 统一关联表：Edges (图关系)
-- 替代所有 _link 表
-- ==========================================
CREATE TABLE edges (
    edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_node_id INTEGER NOT NULL,
    target_node_id INTEGER NOT NULL,

    -- 关系类型
    -- contains: Source (Parent) -> Target (Child)
        -- topic -> resource
        -- topic -> topic
        -- task -> resource
        -- task -> task
        -- 用于构建目录树
    -- related_to: Source <-> Target
        -- topic <-> topic
        -- resource <-> resource
        -- 用于构建知识图谱
    relation_type TEXT NOT NULL CHECK (relation_type IN ('contains', 'related_to')),

    -- AI 辅助元数据
    confidence_score REAL DEFAULT 1.0, -- AI 自动关联的置信度
    is_manual BOOLEAN DEFAULT 1,       -- 是否人工确认过
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    FOREIGN KEY (source_node_id) REFERENCES nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(node_id) ON DELETE CASCADE,
    CHECK (relation_type != 'related_to' OR source_node_id < target_node_id),
    UNIQUE(source_node_id, target_node_id, relation_type) -- 防止重复连线
);

CREATE INDEX idx_edges_source ON edges(source_node_id);
CREATE INDEX idx_edges_target ON edges(target_node_id);
CREATE INDEX idx_edges_relation_type ON edges(relation_type);

-- ==========================================
-- 向量切片 (Context Chunks)
-- 只需要把 resource_id 改成 node_id
-- ==========================================
CREATE TABLE context_chunks (
    chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL, -- 指向 nodes 表 (通常是 type='resource' 的节点)
    embedding_type TEXT NOT NULL CHECK (embedding_type IN ('summary', 'content')),

    chunk_text TEXT NOT NULL,
    chunk_index INTEGER,
    token_count INTEGER,
    qdrant_uuid TEXT UNIQUE,
    embedding_hash TEXT,

    dense_embedding_model TEXT,
    sparse_embedding_model TEXT,
    embedding_at DATETIME,
    chunk_meta JSON,

    FOREIGN KEY(node_id) REFERENCES nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX idx_context_chunks_node_type ON context_chunks(node_id, embedding_type);

-- ==========================================
-- 聊天记录 (Chats)
-- session 可以关联到 nodes (Context)
-- ==========================================
CREATE TABLE chat_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT,
    summary TEXT,
    chat_model TEXT,

    -- 生命周期状态
    -- 'temporary': HUD/Dashboard 临时上传，尚未归档。用户可以自行删除
    -- 'persistent': 正式资源（在Workspace中创建的）。
    session_type TEXT NOT NULL CHECK (session_type IN ('temporary', 'persistent')),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ==========================================
-- 会话上下文绑定表 (Many-to-Many)
-- ==========================================
CREATE TABLE session_bindings (
    session_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL, -- 这一场对话关联了哪些 Node (Topic/Task/Resource)
    
    -- 绑定类型
    -- 'primary': 用户明确选中的
    -- 'implicit': AI 自动搜索出来的相关上下文
    binding_type TEXT DEFAULT 'primary' CHECK (binding_type IN ('primary', 'implicit')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (session_id, node_id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_bindings_node ON session_bindings(node_id);

-- ==========================================
-- 聊天消息 (Messages)
-- ==========================================
CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,

    user_content TEXT NOT NULL,
    thinking_summary TEXT,
    assistant_content TEXT,

    thinking_effort TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_tokens INTEGER,
    total_tokens INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE message_attachments (
    attachment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,

    FOREIGN KEY(message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY(node_id) REFERENCES nodes(node_id) ON DELETE CASCADE
);

CREATE TABLE message_citations (
    citation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,       -- 关联到 AI 的那条回复
    node_id INTEGER NOT NULL,          -- 引用的资源
    chunk_id INTEGER,                  -- 引用的具体切片
    score REAL,                        -- 可选：存相似度分数

    FOREIGN KEY(message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY(node_id) REFERENCES nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY(chunk_id) REFERENCES context_chunks(chunk_id) ON DELETE SET NULL
);
