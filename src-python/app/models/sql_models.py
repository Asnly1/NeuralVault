"""
SQLModel 数据模型
与 Rust migrations/*.sql 对应

架构说明：
- Base类（DTO）：用于 API 交互，只包含业务字段
- DB类（数据库模型）：继承 Base 类，添加数据库特有字段（如 is_deleted、时间戳等）
"""
from datetime import datetime, timezone


def utc_now() -> datetime:
    """返回当前 UTC 时间（带时区信息）"""
    return datetime.now(timezone.utc)


def generate_uuid() -> str:
    """生成 UUID v4 字符串"""
    import uuid
    return str(uuid.uuid4())
from enum import Enum
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel as PydanticBaseModel
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON, Index, text


# ============================================================
# 枚举类型 (Enums)
# ============================================================

# 注意: 枚举名称必须与数据库存储值一致，SQLAlchemy 用 .name 匹配
class TaskStatus(str, Enum):
    todo = "todo"
    done = "done"

class TaskPriority(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"

class FileType(str, Enum):
    text = "text"
    image = "image"
    pdf = "pdf"
    url = "url"
    epub = "epub"
    other = "other"

class SyncStatus(str, Enum):
    pending = "pending"
    synced = "synced"
    dirty = "dirty"
    error = "error"

class ProcessingStage(str, Enum):
    todo = "todo"
    chunking = "chunking"
    embedding = "embedding"
    done = "done"

class ClassificationStatus(str, Enum):
    unclassified = "unclassified"
    suggested = "suggested"
    linked = "linked"
    ignored = "ignored"

class VisibilityScope(str, Enum):
    this = "this"
    subtree = "subtree"
    global_ = "global"  # global 是 Python 保留字，用 global_

class SessionType(str, Enum):
    global_ = "global"  # global 是 Python 保留字
    task = "task"

class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"

# ============================================================
# 用户 (User)
# ============================================================

class UserBase(PydanticBaseModel):
    """用户基础 DTO"""
    user_name: str

class User(SQLModel, table=True):
    """用户数据库模型"""
    __tablename__ = "users"
    
    user_id: Optional[int] = Field(default=None, primary_key=True)
    user_name: str

# ============================================================
# 任务 (Task)
# ============================================================

class TaskBase(PydanticBaseModel):
    """任务基础 DTO - 用于 API 交互"""
    uuid: Optional[str] = None
    parent_task_id: Optional[int] = None
    root_task_id: Optional[int] = None
    
    # 基础内容
    title: Optional[str] = None
    description: Optional[str] = None
    
    # AI 推荐分解的子任务
    suggested_subtasks: Optional[List[Dict[str, Any]]] = None
    
    # 任务状态管理
    status: TaskStatus = TaskStatus.todo
    done_date: Optional[datetime] = None
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[datetime] = None


class TaskCreate(TaskBase):
    """创建任务的请求 DTO"""
    title: str  # 创建时 title 必填

class TaskUpdate(PydanticBaseModel):
    """更新任务的请求 DTO - 所有字段可选"""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None

class TaskRead(TaskBase):
    """读取任务的响应 DTO"""
    task_id: int
    uuid: str
    created_at: datetime
    user_updated_at: datetime

class Task(SQLModel, table=True):
    """任务数据库模型"""
    __tablename__ = "tasks"
    
    task_id: Optional[int] = Field(default=None, primary_key=True)
    uuid: str = Field(default_factory=generate_uuid, unique=True)
    
    parent_task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id", index=True)
    root_task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id", index=True)
    
    # 基础内容
    title: Optional[str] = None
    description: Optional[str] = None
    
    # AI 推荐分解的子任务
    suggested_subtasks: Optional[List[Dict[str, Any]]] = Field(default=None, sa_column=Column(JSON))
    
    # 任务状态管理
    status: TaskStatus = Field(default=TaskStatus.todo, index=True)
    done_date: Optional[datetime] = None
    priority: TaskPriority = Field(default=TaskPriority.medium)
    due_date: Optional[datetime] = Field(default=None, index=True)
    
    # 时间戳 (数据库专属)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    user_updated_at: datetime = Field(default_factory=utc_now)
    system_updated_at: datetime = Field(default_factory=utc_now)
    
    # 软删除 (数据库专属)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_tasks_status_due", "status", "due_date"),
    )
    
    def to_read(self) -> TaskRead:
        """转换为读取 DTO"""
        return TaskRead(
            task_id=self.task_id,
            uuid=self.uuid,
            parent_task_id=self.parent_task_id,
            root_task_id=self.root_task_id,
            title=self.title,
            description=self.description,
            suggested_subtasks=self.suggested_subtasks,
            status=self.status,
            done_date=self.done_date,
            priority=self.priority,
            due_date=self.due_date,
            created_at=self.created_at,
            user_updated_at=self.user_updated_at,
        )

# ============================================================
# 资源 (Resource)
# ============================================================

class ResourceBase(PydanticBaseModel):
    """资源基础 DTO - 用于 API 交互"""
    uuid: Optional[str] = None
    source_meta: Optional[Dict[str, Any]] = None
    
    # 核心身份标识
    file_hash: Optional[str] = None
    file_type: FileType = FileType.other
    content: Optional[str] = None
    
    # 物理存储
    display_name: Optional[str] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None

class ResourceCreate(ResourceBase):
    """创建资源的请求 DTO"""
    file_hash: str  # 创建时 file_hash 必填

class ResourceUpdate(PydanticBaseModel):
    """更新资源的请求 DTO - 所有字段可选"""
    content: Optional[str] = None
    display_name: Optional[str] = None

class ResourceRead(ResourceBase):
    """读取资源的响应 DTO"""
    resource_id: int
    uuid: str
    file_hash: str
    
    # 向量化状态
    sync_status: SyncStatus = SyncStatus.pending
    processing_stage: ProcessingStage = ProcessingStage.todo
    classification_status: ClassificationStatus = ClassificationStatus.unclassified
    
    created_at: datetime

class Resource(SQLModel, table=True):
    """资源数据库模型"""
    __tablename__ = "resources"
    
    resource_id: Optional[int] = Field(default=None, primary_key=True)
    uuid: str = Field(default_factory=generate_uuid, unique=True)
    source_meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    
    # 核心身份标识
    file_hash: str
    file_type: FileType = Field(default=FileType.other)
    content: Optional[str] = None
    
    # 物理存储
    display_name: Optional[str] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    
    # 向量化状态 (Python 专属写入)
    sync_status: SyncStatus = Field(default=SyncStatus.pending, index=True)
    indexed_hash: Optional[str] = None
    processing_hash: Optional[str] = None
    last_indexed_at: Optional[datetime] = None
    last_error: Optional[str] = None
    
    # 资源处理状态
    processing_stage: ProcessingStage = Field(default=ProcessingStage.todo)
    
    # 分类状态
    classification_status: ClassificationStatus = Field(default=ClassificationStatus.unclassified)
    
    # 时间戳 (数据库专属)
    created_at: datetime = Field(default_factory=utc_now)
    
    # 软删除 (数据库专属)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_resources_hash_alive", "file_hash", "user_id", unique=True, sqlite_where=text("is_deleted = 0")),
    )
    
    def to_read(self) -> ResourceRead:
        """转换为读取 DTO"""
        return ResourceRead(
            resource_id=self.resource_id,
            uuid=self.uuid,
            source_meta=self.source_meta,
            file_hash=self.file_hash,
            file_type=self.file_type,
            content=self.content,
            display_name=self.display_name,
            file_path=self.file_path,
            file_size_bytes=self.file_size_bytes,
            sync_status=self.sync_status,
            processing_stage=self.processing_stage,
            classification_status=self.classification_status,
            created_at=self.created_at,
        )

# ============================================================
# 任务-资源关联 (TaskResourceLink)
# ============================================================

class TaskResourceLinkBase(PydanticBaseModel):
    """任务-资源关联基础 DTO"""
    task_id: int
    resource_id: int
    visibility_scope: VisibilityScope = VisibilityScope.subtree
    local_alias: Optional[str] = None

class TaskResourceLinkCreate(TaskResourceLinkBase):
    """创建任务-资源关联的请求 DTO"""
    pass

class TaskResourceLinkRead(TaskResourceLinkBase):
    """读取任务-资源关联的响应 DTO"""
    created_at: datetime

class TaskResourceLink(SQLModel, table=True):
    """任务-资源关联数据库模型"""
    __tablename__ = "task_resource_link"
    
    task_id: int = Field(primary_key=True, foreign_key="tasks.task_id")
    resource_id: int = Field(primary_key=True, foreign_key="resources.resource_id")
    
    visibility_scope: VisibilityScope = Field(default=VisibilityScope.subtree)
    local_alias: Optional[str] = None
    
    created_at: datetime = Field(default_factory=utc_now)
    
    def to_read(self) -> TaskResourceLinkRead:
        """转换为读取 DTO"""
        return TaskResourceLinkRead(
            task_id=self.task_id,
            resource_id=self.resource_id,
            visibility_scope=self.visibility_scope,
            local_alias=self.local_alias,
            created_at=self.created_at,
        )

# ============================================================
# 上下文片段 (ContextChunk)
# ============================================================

class ContextChunkBase(PydanticBaseModel):
    """上下文片段基础 DTO"""
    resource_id: int
    chunk_text: str
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None
    bbox: Optional[str] = None
    token_count: Optional[int] = None

class ContextChunkCreate(ContextChunkBase):
    """创建上下文片段的请求 DTO"""
    pass

class ContextChunkRead(ContextChunkBase):
    """读取上下文片段的响应 DTO"""
    chunk_id: int
    qdrant_uuid: Optional[str] = None
    embedding_hash: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_at: Optional[datetime] = None
    chunk_meta: Optional[Dict[str, Any]] = None

class ContextChunk(SQLModel, table=True):
    """上下文片段数据库模型"""
    __tablename__ = "context_chunks"
    
    chunk_id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resources.resource_id")
    
    chunk_text: str
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None
    bbox: Optional[str] = None
    
    # Embedding 相关
    qdrant_uuid: Optional[str] = Field(default=None, unique=True)
    embedding_hash: Optional[str] = Field(default=None, index=True)
    embedding_model: Optional[str] = None
    embedding_at: Optional[datetime] = None
    chunk_meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    token_count: Optional[int] = None

    __table_args__ = (
        Index("idx_chunks_resource_order", "resource_id", "chunk_index"),
    )
    
    def to_read(self) -> ContextChunkRead:
        """转换为读取 DTO"""
        return ContextChunkRead(
            chunk_id=self.chunk_id,
            resource_id=self.resource_id,
            chunk_text=self.chunk_text,
            chunk_index=self.chunk_index,
            page_number=self.page_number,
            bbox=self.bbox,
            qdrant_uuid=self.qdrant_uuid,
            embedding_hash=self.embedding_hash,
            embedding_model=self.embedding_model,
            embedding_at=self.embedding_at,
            chunk_meta=self.chunk_meta,
            token_count=self.token_count,
        )

# ============================================================
# 聊天会话 (ChatSession)
# ============================================================

class ChatSessionBase(PydanticBaseModel):
    """聊天会话基础 DTO"""
    session_type: SessionType = SessionType.task
    task_id: Optional[int] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    chat_model: Optional[str] = None

class ChatSessionCreate(ChatSessionBase):
    """创建聊天会话的请求 DTO"""
    pass

class ChatSessionUpdate(PydanticBaseModel):
    """更新聊天会话的请求 DTO - 所有字段可选"""
    title: Optional[str] = None
    summary: Optional[str] = None

class ChatSessionRead(ChatSessionBase):
    """读取聊天会话的响应 DTO"""
    session_id: int
    created_at: datetime

class ChatSession(SQLModel, table=True):
    """聊天会话数据库模型"""
    __tablename__ = "chat_sessions"
    
    session_id: Optional[int] = Field(default=None, primary_key=True)
    session_type: SessionType = Field(default=SessionType.task)
    task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id")
    
    title: Optional[str] = None
    summary: Optional[str] = None
    chat_model: Optional[str] = None
    
    # 时间戳 (数据库专属)
    created_at: datetime = Field(default_factory=utc_now)
    
    # 软删除 (数据库专属)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_session_task_time", "task_id", "created_at"),
    )
    
    def to_read(self) -> ChatSessionRead:
        """转换为读取 DTO"""
        return ChatSessionRead(
            session_id=self.session_id,
            session_type=self.session_type,
            task_id=self.task_id,
            title=self.title,
            summary=self.summary,
            chat_model=self.chat_model,
            created_at=self.created_at,
        )

# ============================================================
# 聊天消息 (ChatMessage)
# ============================================================

class ChatMessageBase(PydanticBaseModel):
    """聊天消息基础 DTO"""
    session_id: int
    role: MessageRole
    content: str
    ref_resource_id: Optional[int] = None
    ref_chunk_id: Optional[int] = None

class ChatMessageCreate(ChatMessageBase):
    """创建聊天消息的请求 DTO"""
    pass

class ChatMessageRead(ChatMessageBase):
    """读取聊天消息的响应 DTO"""
    message_id: int
    created_at: datetime

class ChatMessage(SQLModel, table=True):
    """聊天消息数据库模型"""
    __tablename__ = "chat_messages"
    
    message_id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_sessions.session_id")
    
    role: MessageRole
    content: str
    
    ref_resource_id: Optional[int] = Field(default=None, foreign_key="resources.resource_id")
    ref_chunk_id: Optional[int] = Field(default=None, foreign_key="context_chunks.chunk_id")
    
    created_at: datetime = Field(default_factory=utc_now)
    
    def to_read(self) -> ChatMessageRead:
        """转换为读取 DTO"""
        return ChatMessageRead(
            message_id=self.message_id,
            session_id=self.session_id,
            role=self.role,
            content=self.content,
            ref_resource_id=self.ref_resource_id,
            ref_chunk_id=self.ref_chunk_id,
            created_at=self.created_at,
        )

# ============================================================
# 聊天消息附件 (ChatMessageAttachment)
# ============================================================

class ChatMessageAttachmentBase(PydanticBaseModel):
    """聊天消息附件基础 DTO"""
    message_id: int
    resource_id: int

class ChatMessageAttachmentCreate(ChatMessageAttachmentBase):
    """创建聊天消息附件的请求 DTO"""
    pass

class ChatMessageAttachmentRead(ChatMessageAttachmentBase):
    """读取聊天消息附件的响应 DTO"""
    attachment_id: int

class ChatMessageAttachment(SQLModel, table=True):
    """聊天消息附件数据库模型"""
    __tablename__ = "message_attachments"
    
    attachment_id: Optional[int] = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="chat_messages.message_id")
    resource_id: int = Field(foreign_key="resources.resource_id")
    
    def to_read(self) -> ChatMessageAttachmentRead:
        """转换为读取 DTO"""
        return ChatMessageAttachmentRead(
            attachment_id=self.attachment_id,
            message_id=self.message_id,
            resource_id=self.resource_id,
        )

# ============================================================
# API DTO (请求/响应)
# ============================================================

class IngestRequest(PydanticBaseModel):
    """Ingest 通知请求"""
    id: int
    action: Literal["created", "updated", "deleted"]


class IngestResponse(PydanticBaseModel):
    """Ingest 通知响应"""
    status: Literal["accepted", "rejected"]
    message: Optional[str] = None


class IngestStatusResponse(PydanticBaseModel):
    """Ingest 状态响应"""
    resource_id: int
    status: ProcessingStage
    error: Optional[str] = None


class IngestProgress(PydanticBaseModel):
    """Ingest 消息"""
    type: Literal["progress"] = "progress"
    resource_id: int
    status: ProcessingStage
    percentage: Optional[int] = None
    error: Optional[str] = None


class ChunkResult(PydanticBaseModel):
    """单个 chunk 的处理结果"""
    chunk_text: str
    chunk_index: int
    page_number: Optional[int] = None
    qdrant_uuid: str
    embedding_hash: str
    token_count: Optional[int] = None


class IngestionResult(PydanticBaseModel):
    """Ingestion 结果消息（返回给 Rust）"""
    type: Literal["result"] = "result"
    resource_id: int
    success: bool
    chunks: Optional[List["ChunkResult"]] = None
    embedding_model: Optional[str] = None
    indexed_hash: Optional[str] = None
    error: Optional[str] = None
