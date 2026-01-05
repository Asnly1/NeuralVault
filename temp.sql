-- ==========================================
-- 1. 会话表 (Session)
-- ==========================================
CREATE TABLE chat_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 任务依然保持 1:1，因为一个对话服务于一个目标是非常合理的
    task_id INTEGER, 
    
    title TEXT,
    summary TEXT,
    chat_model TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,
    
    user_id INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL -- 任务删了，会话可以保留作为历史记录
);

CREATE INDEX idx_session_task_created_at ON chat_sessions(task_id, created_at);
CREATE INDEX idx_session_task_updated_at ON chat_sessions(task_id, updated_at);

-- ==========================================
-- 2. 会话-基准资源关联表 (Session Context)
-- ==========================================
-- 解决了 "Chat with multiple docs" 的问题
-- 这是对话的 "默认检索范围"
CREATE TABLE session_context_resources (
    session_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    
    PRIMARY KEY (session_id, resource_id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- ==========================================
-- 3. 消息表 (Messages)
-- ==========================================
CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,

    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
);

-- ==========================================
-- 4. 消息附件表 (User Input Attachments)
-- ==========================================
-- 用户发送消息时带的文件 (临时上下文)
CREATE TABLE message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,

    FOREIGN KEY(message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- ==========================================
-- 5. 消息引用表 (AI Output Citations)
-- ==========================================
-- AI 回答时用到的 RAG 切片来源 (解决多引用问题)
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