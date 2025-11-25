-- ==========================================
-- Users表，暂时放着，防止后面需要扩展为多用户
-- ==========================================
-- MVP时候初始化时插入user_id == 1
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
    
    -- 全部在Rust端维护
    parent_task_id INTEGER,
    root_task_id INTEGER,   -- 顶层任务指向自己，子任务指向顶层
    -- 使用RCTE实时计算深度，不再记录depth

    -- 基础内容
    title TEXT,
    description TEXT,
    
    --AI推荐分解的子任务
    suggested_subtasks JSON,
    
    -- 任务状态管理
    status TEXT DEFAULT 'inbox' CHECK (status IN ('inbox','todo','doing','blocked','done','archived')),
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
    due_date DATETIME,
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, --在业务层修改
    system_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, --在业务层修改

    is_deleted BOOLEAN DEFAULT 0, --用户是否删除（前端展示与否），防止用户误删除
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1 , --预留user_id，但是先不用

    -- 所有删除分为两级：
    -- 1. 用户先软删除
    -- 2. 放到回收站后，如果用户选择彻底删除，那就硬删除
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
-- 资源表 (独立于任务，代表"知识库")
-- ==========================================
CREATE TABLE resources (
    resource_id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE, -- 方便前端路由和唯一标识
    source_meta JSON,  -- 存 { url, window_title, chat_title, sender, etc. }
    
    -- 核心身份标识
    file_hash TEXT NOT NULL, -- SHA-256，防止重复存储
    -- MVP暂时只支持text，先不管pdf等
    file_type TEXT NOT NULL CHECK (file_type IN ('text', 'image','pdf','url','epub','other')),
    content TEXT, -- 如果是text这种能直接存的，就直接放到里面
    
    -- 物理存储
    display_name TEXT,   -- UI显示的名称，如 "需求文档.pdf"
    -- 用户上传小文件(<50MB)时，直接复制一份到 App 的私有目录（./assets)，脱离原始路径的控制。
    -- 用户删除 resources 后删除 ./assets 下的文件
    file_path TEXT,      -- ./assets/{uuid}.pdf
    file_size_bytes INTEGER,
    
    -- 向量化状态 (只针对资源本身，与任务无关)
    -- 引入防抖机制，避免无效embedding
    indexed_hash TEXT, -- 记录上一次成功切片时的 Hash
    processing_hash TEXT, -- 记录开始切片时的 Hash。处理完写回时对比：如果 current_hash != processing_hash，说明文件变了，丢弃本次结果，标记为 dirty，重新入队
    -- 流程：取任务 → 设置 processing_hash → 真正处理 → 最后一次性写 indexed_hash/sync_status/last_indexed_at/processing_stage； 错误时写last_error
    -- 数据库内部用，和chroma保持一致，不暴露给后端API
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'dirty', 'error')),
    last_indexed_at DATETIME,
    last_error TEXT, --存储上次失败的信息
    
    -- 资源处理状态（暴露给后端API）
    -- UI 层展示processing_stage。如果 Chroma 没同步完，给出警告。
    processing_stage TEXT DEFAULT 'todo' CHECK(processing_stage IN ('todo','chunking','embedding','done')),

    -- Page A 的分类状态
    classification_status TEXT DEFAULT 'unclassified' CHECK (classification_status IN ('unclassified','suggested','linked','ignored')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0, --用户是否删除（前端展示与否），防止用户误删除
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, --预留user_id，但是先不用

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
    
    -- 允许针对特定任务重命名 (可选，例如在任务A叫"参考图"，在任务B叫"背景图")
    local_alias TEXT, 
    -- 资源可见性：仅在当前任务层级可见/对于子任务可见/全局可见
    visibility_scope TEXT DEFAULT 'subtree' CHECK (visibility_scope IN ('this', 'subtree', 'global')),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (task_id, resource_id),
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- ==========================================
-- Context Chunks (向量子表 - 给 AI 看的)
-- ==========================================
CREATE TABLE context_chunks (
    chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL, -- 关联回父资源
    
    chunk_text TEXT NOT NULL,    -- 切片后的实际文本内容
    chunk_index INTEGER,         -- 在原文件中的顺序 (第几段)
    page_number INTEGER,         -- (可选) 如果是PDF，记录页码，方便引用跳转
    bbox TEXT,                   -- (可选) 预留给 PDF 高亮坐标 JSON
    
    -- 向量数据库关联
    chroma_uuid TEXT UNIQUE,     -- 指向 ChromaDB 的 ID
    embedding_hash TEXT,         -- 校验向量是否过期
    embedding_model TEXT,
    embedding_at DATETIME,
    metadata JSON,
    token_count INTEGER,
    
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

CREATE INDEX idx_context_chunks_chroma ON context_chunks(chroma_uuid);
CREATE INDEX idx_chunks_resource_order ON context_chunks(resource_id, chunk_index);
CREATE INDEX idx_chunks_embedding_hash ON context_chunks(embedding_hash);

-- ==========================================
-- 聊天记录表
-- ==========================================
CREATE TABLE chat_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_type TEXT DEFAULT 'task' CHECK (session_type IN ('global', 'task')),
     --当session_type == 'global' 时，允许用户不基于task，在全局进行对话
    task_id INTEGER,

    title TEXT, -- 由AI生成的标题
    summary TEXT, -- 由AI生成的总结
    chat_model TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0, --用户是否删除（前端展示与否），防止用户误删除
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, --预留user_id，但是先不用

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_task_time ON chat_sessions(task_id, created_at);

CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- 如果某条消息引用了特定的 resource，可以在此关联
    ref_resource_id INTEGER, 
    -- 引用现在可以精确到具体的 chunk，实现“点击引用跳转到PDF第几页”
    ref_chunk_id INTEGER,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY(ref_resource_id) REFERENCES resources(resource_id) ON DELETE SET NULL,
    FOREIGN KEY(ref_chunk_id) REFERENCES context_chunks(chunk_id) ON DELETE SET NULL
);

CREATE INDEX idx_chat_session_id ON chat_messages(session_id);

-- ==========================================
-- Page C 的脉搏/报告表
-- ==========================================
CREATE TABLE reports (
    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT CHECK (report_type IN ('daily', 'weekly')),
    report_date DATE, -- 报告针对的日期 (如 2025-11-20)

    report_content TEXT, -- AI 生成的总结 Markdown

    -- 用户对报告进行批注
    -- 形式：{content: {用户高亮的内容}, comment: {用户批注的内容}} 
    user_comments JSON,

    -- 用户的笔记
    user_notes TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0, --用户是否删除（前端展示与否），防止用户误删除
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, --预留user_id，但是先不用

    UNIQUE(report_type, report_date, user_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_reports_date ON reports(report_date);
CREATE INDEX idx_reports_date_user ON reports(report_date, user_id);

CREATE TABLE report_refs_tasks (
    report_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    PRIMARY KEY (report_id, task_id),
    FOREIGN KEY(report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE report_refs_resources (
    report_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    PRIMARY KEY (report_id, resource_id),
    FOREIGN KEY(report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- ==========================================
-- 标签系统
-- ==========================================
CREATE TABLE tags (
    tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tag_type TEXT DEFAULT "system" CHECK (tag_type IN ("system", "user")), -- 区分是系统推荐的还是用户自己写的
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    is_deleted BOOLEAN DEFAULT 0, 
    deleted_at DATETIME,

    user_id INTEGER NOT NULL DEFAULT 1, --预留user_id，但是先不用

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_tags_name_alive ON tags(name, user_id) WHERE is_deleted = 0;

CREATE TABLE task_tags (
    task_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, tag_id),
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);

CREATE TABLE resource_tags (
    resource_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (resource_id, tag_id),
    FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

CREATE INDEX idx_resource_tags_tag ON resource_tags(tag_id);

-- 还没被用户确认的AI建议标签，等被用户确认后，再写入tags和task_tags/resource_tags表
CREATE TABLE suggested_tags (
  suggested_tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  resource_id INTEGER,
  name TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 1,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (
  (task_id IS NOT NULL AND resource_id IS NULL) OR
  (task_id IS NULL AND resource_id IS NOT NULL)
  ),

  FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id) REFERENCES resources(resource_id) ON DELETE CASCADE
);

-- 只对 task 作用的唯一约束
CREATE UNIQUE INDEX idx_suggested_tags_task ON suggested_tags(name, user_id, task_id)
WHERE task_id IS NOT NULL;

-- 只对 resource 作用的唯一约束
CREATE UNIQUE INDEX idx_suggested_tags_res ON suggested_tags(name, user_id, resource_id)
WHERE resource_id IS NOT NULL;

-- ==========================================
-- 设置模块
-- ==========================================
CREATE TABLE settings (
    key TEXT PRIMARY KEY,       -- 例如 'llm_model_path', 'theme_mode', 'shortcut_capture'
    value TEXT,                 -- JSON 字符串或纯文本
    description TEXT,           -- 设置项的说明（给前端展示用）
    user_id INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
);

-- 初始化默认值
INSERT INTO settings (key, value) VALUES ('llm_provider', 'ollama');
INSERT INTO settings (key, value) VALUES ('ollama_url', 'http://localhost:11434');

-- ==========================================
-- 全文检索 (FTS5) 模块
-- ==========================================
-- 定义虚拟表，content 和 title 用于检索
-- source_row_id 和 source_type 用于反向查找到原始记录
-- user_id 设为 UNINDEXED，既能用于过滤（WHERE user_id = ?），又不参与分词索引，减小体积
CREATE VIRTUAL TABLE search_index USING fts5(
    source_row_id UNINDEXED,     -- 原始表的 ID
    source_type UNINDEXED,       -- 来源类型: 'task', 'resource', 'chunk', 'tag', 'chat_message', 'chat_session', 'report'
    user_id UNINDEXED,           -- 用户ID，用于隔离搜索
    title,                       -- 标题
    content,                     -- 内容
    tokenize='trigram'
);

-- ==========================================
-- 触发器
-- ==========================================

-- ------------------------------------------
-- 1. Tasks 表触发器
-- ------------------------------------------

-- Insert Task -> Index (仅当未标记为删除时索引)
CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks 
WHEN NEW.is_deleted = 0
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  VALUES (NEW.task_id, 'task', NEW.user_id, NEW.title, COALESCE(NEW.description, ''));
END;

-- Update Task
CREATE TRIGGER tasks_fts_update AFTER UPDATE OF title, description, is_deleted ON tasks
BEGIN
  -- 1. 先清理旧索引
  DELETE FROM search_index WHERE source_row_id = OLD.task_id AND source_type = 'task';
  
  -- 2. 仅当任务处于“有效”状态时，才重新插入索引
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT NEW.task_id, 'task', NEW.user_id, NEW.title, COALESCE(NEW.description, '')
  WHERE NEW.is_deleted = 0;
END;

-- Delete Task
CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks 
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.task_id AND source_type = 'task';
END;

-- ------------------------------------------
-- 2. Resources 表触发器
-- ------------------------------------------

-- Insert Resource -> Index
CREATE TRIGGER resources_fts_insert AFTER INSERT ON resources 
WHEN NEW.is_deleted = 0
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  VALUES (
      NEW.resource_id, 
      'resource', 
      NEW.user_id,
      NEW.display_name, 
      COALESCE(NEW.content, '') 
  );
END;

-- Update Resource
CREATE TRIGGER resources_fts_update AFTER UPDATE OF display_name, content, is_deleted ON resources
BEGIN
  -- A. 处理 Resource 本身
  DELETE FROM search_index WHERE source_row_id = OLD.resource_id AND source_type = 'resource';
  
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT NEW.resource_id, 'resource', NEW.user_id, NEW.display_name, COALESCE(NEW.content, '')
  WHERE NEW.is_deleted = 0;

  -- B. 级联处理 Chunks
  -- 1. 只要 Resource 变动，先清除该 Resource 下所有 Chunk 的索引
  DELETE FROM search_index 
  WHERE source_type = 'chunk' 
  AND source_row_id IN (SELECT chunk_id FROM context_chunks WHERE resource_id = OLD.resource_id);

  -- 2. 如果 Resource 有效，加回 Chunks 索引
  -- 注意：Chunks 表没有 user_id，需要使用 NEW.user_id (即 Resource 的 user_id)
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  SELECT 
      chunk_id, 
      'chunk', 
      NEW.user_id,
      NEW.display_name, -- Chunk 借用 Resource 的新名字
      chunk_text
  FROM context_chunks
  WHERE resource_id = NEW.resource_id AND NEW.is_deleted = 0;
END;

-- Delete Resource
CREATE TRIGGER resources_fts_delete AFTER DELETE ON resources 
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.resource_id AND source_type = 'resource';
  
  DELETE FROM search_index 
  WHERE source_type = 'chunk' 
  AND source_row_id IN (SELECT chunk_id FROM context_chunks WHERE resource_id = OLD.resource_id);
END;

-- ------------------------------------------
-- 3. Context Chunks 表触发器
-- ------------------------------------------

-- Insert Chunk -> Index
-- 需要联表查询 user_id 和 display_name，并检查父资源状态
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON context_chunks 
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT 
      NEW.chunk_id, 
      'chunk', 
      r.user_id,
      r.display_name, 
      NEW.chunk_text
  FROM resources r
  WHERE r.resource_id = NEW.resource_id AND r.is_deleted = 0; 
END;

-- 对于Chunk，不进行更新。需要更新就删除后重建

-- Delete Chunk -> Remove Index (硬删除)
CREATE TRIGGER chunks_fts_delete AFTER DELETE ON context_chunks 
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.chunk_id AND source_type = 'chunk';
END;

-- ------------------------------------------
-- 4. Tags 表触发器
-- ------------------------------------------

-- Insert Tag
CREATE TRIGGER tags_fts_insert AFTER INSERT ON tags
WHEN NEW.is_deleted = 0
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  VALUES (NEW.tag_id, 'tag', NEW.user_id, NEW.name, NEW.tag_type);
END;

-- Update Tag
CREATE TRIGGER tags_fts_update AFTER UPDATE OF name, tag_type, is_deleted ON tags
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.tag_id AND source_type = 'tag';
  
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  SELECT NEW.tag_id, 'tag', NEW.user_id, NEW.name, NEW.tag_type
  WHERE NEW.is_deleted = 0;
END;

-- Delete Tag
CREATE TRIGGER tags_fts_delete AFTER DELETE ON tags
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.tag_id AND source_type = 'tag';
END;

-- ------------------------------------------
-- 5. chat_message 表触发器
-- ------------------------------------------

-- Insert Message
-- 注意：这里做了一个子查询来获取 Session 的标题，提升搜索结果的可读性
CREATE TRIGGER chat_messages_fts_insert AFTER INSERT ON chat_messages
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT 
    NEW.message_id, 
    'chat_message', 
    cs.user_id,
    COALESCE(cs.title, 'New Chat') || ' (' || NEW.role || ')',
    NEW.content
  FROM chat_sessions cs
  WHERE cs.session_id = NEW.session_id AND cs.is_deleted = 0; 
END;

-- Update Message (虽然消息很少改，但为了完整性)
CREATE TRIGGER chat_messages_fts_update AFTER UPDATE ON chat_messages
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.message_id AND source_type = 'chat_message';
  
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT 
    NEW.message_id, 
    'chat_message', 
    cs.user_id,
    COALESCE(cs.title, 'New Chat') || ' (' || NEW.role || ')',
    NEW.content
  FROM chat_sessions cs
  WHERE cs.session_id = NEW.session_id AND cs.is_deleted = 0;
END;

-- Delete Message (物理删除)
CREATE TRIGGER chat_messages_fts_delete AFTER DELETE ON chat_messages
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.message_id AND source_type = 'chat_message';
END;

-- ------------------------------------------
-- 6. chat_session 表触发器
-- ------------------------------------------

-- Insert Session
CREATE TRIGGER chat_session_fts_insert AFTER INSERT ON chat_sessions
WHEN NEW.is_deleted = 0
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  VALUES (NEW.session_id, 'chat_session', NEW.user_id, COALESCE(NEW.title, 'New Chat'), COALESCE(NEW.summary, ''));
END;

-- Update Session
-- 逻辑：
-- Session 变动不仅影响自己，也影响其下 Message 的索引 (因为 Message 的 title 依赖 Session title)
CREATE TRIGGER chat_session_fts_update AFTER UPDATE ON chat_sessions
BEGIN
  -- A. 处理 Session 自身
  DELETE FROM search_index WHERE source_row_id = OLD.session_id AND source_type = 'chat_session';
  
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  SELECT NEW.session_id, 'chat_session', NEW.user_id, COALESCE(NEW.title, 'New Chat'), COALESCE(NEW.summary, '')
  WHERE NEW.is_deleted = 0;

  -- B. 级联更新 Messages
  -- 1. 清理该 Session 下所有 Message 的旧索引
  DELETE FROM search_index 
  WHERE source_type = 'chat_message' 
  AND source_row_id IN (SELECT message_id FROM chat_messages WHERE session_id = OLD.session_id);

  -- 2. 如果 Session 有效，重新插入 Messages 索引 (此时会读取 Session 的新 Title)
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content)
  SELECT 
      m.message_id, 
      'chat_message', 
      NEW.user_id,
      COALESCE(NEW.title, 'New Chat') || ' (' || m.role || ')', 
      m.content
  FROM chat_messages m
  WHERE m.session_id = NEW.session_id 
    AND NEW.is_deleted = 0;
END;

-- Delete Message (物理删除)
CREATE TRIGGER chat_session_fts_delete AFTER DELETE ON chat_sessions
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.session_id AND source_type = 'chat_session';
  -- 级联删除消息索引 (可选，因为通常物理删除是级联的，但显式写更安全)
  DELETE FROM search_index 
  WHERE source_type = 'chat_message' 
  AND source_row_id IN (SELECT message_id FROM chat_messages WHERE session_id = OLD.session_id);
END;

-- ------------------------------------------
-- 7. Reports 表触发器
-- ------------------------------------------

-- Insert Report
CREATE TRIGGER reports_fts_insert AFTER INSERT ON reports 
WHEN NEW.is_deleted = 0
BEGIN
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  VALUES (
      NEW.report_id, 
      'report', 
      NEW.user_id,
      NEW.report_type || ' Report (' || NEW.report_date || ')', -- 标题: Daily Report (2025-11-23)
      -- 聚合内容：AI总结 + 用户笔记 + 用户评论(JSON转字符串)
      COALESCE(NEW.report_content, '') || ' ' || 
      COALESCE(NEW.user_notes, '') || ' ' || 
      COALESCE(NEW.user_comments, '')
  );
END;

-- Update Report
CREATE TRIGGER reports_fts_update AFTER UPDATE ON reports 
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.report_id AND source_type = 'report';
  
  INSERT INTO search_index(source_row_id, source_type, user_id, title, content) 
  SELECT 
      NEW.report_id, 
      'report', 
      NEW.user_id,
      NEW.report_type || ' Report (' || NEW.report_date || ')',
      COALESCE(NEW.report_content, '') || ' ' || 
      COALESCE(NEW.user_notes, '') || ' ' || 
      COALESCE(NEW.user_comments, '')
  WHERE NEW.is_deleted = 0;
END;

-- Delete Report
CREATE TRIGGER reports_fts_delete AFTER DELETE ON reports 
BEGIN
  DELETE FROM search_index WHERE source_row_id = OLD.report_id AND source_type = 'report';
END;