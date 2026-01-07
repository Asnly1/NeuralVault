-- Initial schema aligned with docs/database.sql
PRAGMA foreign_keys = ON;

-- ==========================================
-- Users 表，预留多用户
-- ==========================================
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL
);

-- ==========================================
-- 核心存储表：Tasks
-- ==========================================
CREATE TABLE tasks (
    task_id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE, -- 方便前端路由和唯一标识

    -- 基础内容
    title TEXT,
    description TEXT,
    summary TEXT,

    -- 任务状态管理
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo','done')),
    done_date DATETIME,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
    due_date DATETIME,

    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0, -- 用户是否删除（前端展示与否）
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, -- 预留 user_id

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_status_due ON tasks(status, due_date);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC);

-- ==========================================
-- Topics 表
-- ==========================================
CREATE TABLE topics (
    topic_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL UNIQUE, -- Topic 名称应当唯一，方便精准匹配
    summary TEXT,               -- AI 生成的 Topic Summary (不断迭代)
    
    is_system_default BOOLEAN DEFAULT 0, -- 用于标记 "Unsorted/Inbox" 这种特殊 Topic
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Summary 更新时修改此时间
    
    user_id INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 索引：经常需要根据名字查找（为了防止重复创建）
CREATE INDEX idx_topics_title ON topics(title);
CREATE INDEX idx_topics_updated_at ON topics(updated_at DESC);

-- ==========================================
-- 资源表 (独立于任务)
-- ==========================================
CREATE TABLE resources (
    resource_id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE, -- 方便前端路由和唯一标识
    source_meta JSON,  -- 存 { url, window_title, chat_title, sender, etc. }
    summary TEXT, -- AI 生成的 Resource Summary

    -- 核心身份标识
    file_hash TEXT NOT NULL, -- SHA-256，防止重复存储
    file_type TEXT NOT NULL CHECK (file_type IN ('text', 'image','pdf','url','epub','other')),
    content TEXT, -- 如果是 text 直接存

    -- 物理存储
    display_name TEXT,   -- UI 显示的名称，如 "需求文档.pdf"
    file_path TEXT,      -- ./assets/{uuid}.pdf
    file_size_bytes INTEGER,

    -- 向量化状态 (针对资源本身)
    indexed_hash TEXT,
    processing_hash TEXT,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'dirty', 'error')),
    last_indexed_at DATETIME,
    last_error TEXT,

    -- 资源处理状态（暴露给后端 API）
    processing_stage TEXT DEFAULT 'todo' CHECK(processing_stage IN ('todo','chunking','embedding','done')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_resources_sync_status ON resources(sync_status);
CREATE UNIQUE INDEX idx_resources_hash_alive ON resources(file_hash, user_id) WHERE is_deleted = 0;
CREATE INDEX idx_resources_updated_at ON resources(updated_at DESC);

-- ==========================================
-- Task <-> Resource 关联表 (多对多映射)
-- ==========================================
CREATE TABLE task_resource_link (
    task_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (task_id, resource_id),
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- ==========================================
-- Resource <-> Topic 关联表 (核心分类逻辑)
-- ==========================================
CREATE TABLE topic_resource_link (
    topic_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    
    -- AI 分类逻辑
    confidence_score REAL DEFAULT 0.0, -- 0.0 - 1.0，用于 UI 排序和过滤
    is_auto_generated BOOLEAN DEFAULT 0, -- 区分是 AI 猜的还是用户拖拽的
    
    -- 园丁模式状态机
    -- 'pending': AI 建议放入此 Topic，等待用户确认 (Confidence < 0.9 or explicit gardener mode)
    -- 'approved': 用户已确认 (或者 Confidence 极高自动确认)
    -- 'rejected': 用户拒绝了 AI 的这个建议 (防止 AI 反复推荐同一个错的)
    review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (topic_id, resource_id),
    FOREIGN KEY(topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- 索引：查找某个 Topic 下的所有 Approved 资源用于 RAG
CREATE INDEX idx_topic_res_rag ON topic_resource_link(topic_id, review_status);

-- 索引：查找某个 Resource 下的所有 Topic
CREATE INDEX idx_topic_res_reverse ON topic_resource_link(resource_id, topic_id);

-- ==========================================
-- Task <-> Topic 关联表
-- ==========================================
CREATE TABLE task_topic_link (
    task_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (task_id, topic_id),
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE
);

-- ==========================================
-- Context Chunks (向量子表)
-- ==========================================
CREATE TABLE context_chunks (
    chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,

    chunk_text TEXT NOT NULL,
    chunk_index INTEGER,
    page_number INTEGER,
    bbox TEXT,

    qdrant_uuid TEXT UNIQUE,
    embedding_hash TEXT,
    embedding_model TEXT,
    embedding_at DATETIME,
    chunk_meta JSON,
    token_count INTEGER,

    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_resource_order ON context_chunks(resource_id, chunk_index);
CREATE INDEX idx_chunks_embedding_hash ON context_chunks(embedding_hash);

-- ==========================================
-- 聊天记录表
-- ==========================================
CREATE TABLE chat_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER, -- 任务可以为空或者对应单一任务
    topic_id INTEGER, -- Topic可以为空或者对应单一Topic

    title TEXT,
    summary TEXT,
    chat_model TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL,
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE SET NULL
);

CREATE INDEX idx_session_task_created_at ON chat_sessions(task_id, created_at);
CREATE INDEX idx_session_task_updated_at ON chat_sessions(task_id, updated_at);

CREATE TABLE session_context_resources (
    session_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,

    PRIMARY KEY (session_id, resource_id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,

    user_content TEXT NOT NULL,
    assistant_content TEXT,

    input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_tokens INTEGER,
    total_tokens INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,

    FOREIGN KEY(message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

CREATE TABLE message_citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,       -- 关联到 AI 的那条回复
    resource_id INTEGER NOT NULL,      -- 引用的资源
    chunk_id INTEGER,                  -- 引用的具体切片
    score REAL,                        -- 可选：存相似度分数

    FOREIGN KEY(message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY(chunk_id) REFERENCES context_chunks(chunk_id) ON DELETE SET NULL
);
