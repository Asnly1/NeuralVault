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

    -- 全部在 Rust 端维护
    parent_task_id INTEGER,
    root_task_id INTEGER,   -- 顶层任务指向自己，子任务指向顶层
    -- 使用 RCTE 实时计算深度，不再记录 depth

    -- 基础内容
    title TEXT,
    description TEXT,

    -- AI 推荐分解的子任务
    suggested_subtasks JSON,

    -- 任务状态管理
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo','done')),
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
    due_date DATETIME,

    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 在业务层修改
    system_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 在业务层修改

    is_deleted BOOLEAN DEFAULT 0, -- 用户是否删除（前端展示与否）
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, -- 预留 user_id

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY(parent_task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(root_task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_status_due ON tasks(status, due_date);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_root ON tasks(root_task_id);

-- ==========================================
-- 资源表 (独立于任务)
-- ==========================================
CREATE TABLE resources (
    resource_id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE, -- 方便前端路由和唯一标识
    source_meta JSON,  -- 存 { url, window_title, chat_title, sender, etc. }

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

    -- Page A 的分类状态
    classification_status TEXT DEFAULT 'unclassified' CHECK (classification_status IN ('unclassified','suggested','linked','ignored')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_resources_sync_status ON resources(sync_status);
CREATE UNIQUE INDEX idx_resources_hash_alive ON resources(file_hash, user_id) WHERE is_deleted = 0;

-- ==========================================
-- 关联表 (多对多映射)
-- ==========================================
CREATE TABLE task_resource_link (
    task_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,

    visibility_scope TEXT DEFAULT 'subtree' CHECK (visibility_scope IN ('this', 'subtree', 'global')),
    local_alias TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (task_id, resource_id),
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
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
    metadata JSON,
    token_count INTEGER,

    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

CREATE INDEX idx_context_chunks_qdrant ON context_chunks(qdrant_uuid);
CREATE INDEX idx_chunks_resource_order ON context_chunks(resource_id, chunk_index);
CREATE INDEX idx_chunks_embedding_hash ON context_chunks(embedding_hash);

-- ==========================================
-- 聊天记录表
-- ==========================================
CREATE TABLE chat_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_type TEXT DEFAULT 'task' CHECK (session_type IN ('global', 'task')),
    task_id INTEGER,

    title TEXT,
    summary TEXT,
    chat_model TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_task_time ON chat_sessions(task_id, created_at);

CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,

    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    ref_resource_id INTEGER,
    ref_chunk_id INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY(ref_resource_id) REFERENCES resources(resource_id) ON DELETE SET NULL,
    FOREIGN KEY(ref_chunk_id) REFERENCES context_chunks(chunk_id) ON DELETE SET NULL
);
