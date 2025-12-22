"""
SQLModel 数据模型
与 Rust migrations/*.sql 对应
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON, Index

#TODO:采用继承的方式创建DTO/数据库模型
class TaskStatus(str, Enum):
    TODO = "todo"
    DONE = "done"

class TaskPriority(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class FileType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"
    URL = "url"
    EPUB = "epub"
    OTHER = "other"

class SyncStatus(str, Enum):
    PENDING = "pending"
    SYNCED = "synced"
    DIRTY = "dirty"
    ERROR = "error"

class ProcessingStage(str, Enum):
    TODO = "todo"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    DONE = "done"

class ClassificationStatus(str, Enum):
    UNCLASSIFIED = "unclassified"
    SUGGESTED = "suggested"
    LINKED = "linked"
    IGNORED = "ignored"

class VisibilityScope(str, Enum):
    THIS = "this"
    SUBTREE = "subtree"
    GLOBAL = "global"

class SessionType(str, Enum):
    GLOBAL = "global"
    TASK = "task"

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class User(SQLModel, table=True):
    """用户表"""
    __tablename__ = "users"
    
    # 让Python在插入的时候可以不用填写user_id
    # 插入后数据库会自动补充user_id
    user_id: Optional[int] = Field(default=None, primary_key=True)
    user_name: str

class Task(SQLModel, table=True):
    """任务表"""
    __tablename__ = "tasks"
    
    task_id: Optional[int] = Field(default=None, primary_key=True)
    uuid: str = Field(unique=True)
    
    parent_task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id", index=True)
    root_task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id", index=True)
    
    # 基础内容
    title: Optional[str] = None
    description: Optional[str] = None
    
    # AI 推荐分解的子任务
    suggested_subtasks: Optional[List[Dict[str, Any]]] = Field(default=None, sa_column=Column(JSON))
    
    # 任务状态管理
    status: TaskStatus = Field(default=TaskStatus.TODO, index=True)
    done_date: Optional[datetime] = None
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    due_date: Optional[datetime] = Field(default=None, index=True)
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    user_updated_at: datetime = Field(default_factory=datetime.utcnow)
    system_updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_tasks_status_due", "status", "due_date"),
    )

class Resource(SQLModel, table=True):
    """资源表"""
    __tablename__ = "resources"
    
    resource_id: Optional[int] = Field(default=None, primary_key=True)
    uuid: str = Field(unique=True)
    source_meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    
    # 核心身份标识
    file_hash: str
    file_type: FileType = Field(default=FileType.OTHER)
    content: Optional[str] = None
    
    # 物理存储
    display_name: Optional[str] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    
    # 向量化状态 (针对资源本身)
    sync_status: SyncStatus = Field(default=SyncStatus.PENDING, index=True)
    indexed_hash: Optional[str] = None
    processing_hash: Optional[str] = None
    last_indexed_at: Optional[datetime] = None
    last_error: Optional[str] = None
    
    # 资源处理状态
    processing_stage: ProcessingStage = Field(default=ProcessingStage.TODO)
    
    # 分类状态
    classification_status: ClassificationStatus = Field(default=ClassificationStatus.UNCLASSIFIED)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_resources_hash_alive", "file_hash", "user_id", unique=True, where=text("is_deleted = 0")),
    )

class TaskResourceLink(SQLModel, table=True):
    """任务-资源关联表"""
    __tablename__ = "task_resource_link"
    
    task_id: int = Field(primary_key=True, foreign_key="tasks.task_id")
    resource_id: int = Field(primary_key=True, foreign_key="resources.resource_id")
    
    visibility_scope: VisibilityScope = Field(default=VisibilityScope.SUBTREE)
    local_alias: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ContextChunk(SQLModel, table=True):
    """上下文片段表"""
    __tablename__ = "context_chunks"
    
    chunk_id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resources.resource_id", schema_extra={"ondelete": "CASCADE"})
    
    chunk_text: str
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None
    bbox: Optional[str] = None
    
    qdrant_uuid: Optional[str] = Field(default=None, unique=True)
    embedding_hash: Optional[str] = Field(default=None, index=True)
    embedding_model: Optional[str] = None
    embedding_at: Optional[datetime] = None
    chunk_meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    token_count: Optional[int] = None

    __table_args__ = (
        Index("idx_chunks_resource_order", "resource_id", "chunk_index"),
    )


class ChatSession(SQLModel, table=True):
    """聊天会话表"""
    __tablename__ = "chat_sessions"
    
    session_id: Optional[int] = Field(default=None, primary_key=True)
    session_type: SessionType = Field(default=SessionType.TASK)
    task_id: Optional[int] = Field(default=None, foreign_key="tasks.task_id")
    
    title: Optional[str] = None
    summary: Optional[str] = None
    chat_model: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    user_id: int = Field(default=1, foreign_key="users.user_id")

    __table_args__ = (
        Index("idx_session_task_time", "task_id", "created_at"),
    )


class ChatMessage(SQLModel, table=True):
    """聊天消息表"""
    __tablename__ = "chat_messages"
    
    message_id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_sessions.session_id")
    
    role: MessageRole
    content: str
    
    ref_resource_id: Optional[int] = Field(default=None, foreign_key="resources.resource_id")
    ref_chunk_id: Optional[int] = Field(default=None, foreign_key="context_chunks.chunk_id")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
