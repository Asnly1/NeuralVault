"""
Shared schemas and enums for the Python service.
"""
from enum import Enum
from typing import Optional, List, Literal, Callable, Awaitable

from pydantic import BaseModel


class FileType(str, Enum):
    text = "text"
    image = "image"
    pdf = "pdf"
    url = "url"
    epub = "epub"
    other = "other"


class ProcessingStage(str, Enum):
    todo = "todo"
    chunking = "chunking"
    embedding = "embedding"
    done = "done"


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


# 进度回调类型
# 函数类型，接受参数：int, ProcessingStage, Optional[int]，返回值为 Awaitable[None]
ProgressCallback = Callable[[int, ProcessingStage, Optional[int]], Awaitable[None]]


class JobType(str, Enum):
    """任务类型"""
    INGEST_RESOURCE = "ingest_resource"
    DELETE_RESOURCE = "delete_resource"


class JobAction(str, Enum):
    """触发动作"""
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


class IngestionJob(BaseModel):
    job_type: JobType
    source_id: int  # resource_id
    action: JobAction
    file_hash: str
    file_type: FileType
    content: Optional[str] = None
    file_path: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3


class IngestRequest(BaseModel):
    resource_id: int
    action: Literal["created", "updated", "deleted"]
    file_hash: str
    file_type: FileType
    content: Optional[str] = None
    file_path: Optional[str] = None


class IngestResponse(BaseModel):
    status: Literal["accepted", "rejected"]
    message: Optional[str] = None


class IngestProgress(BaseModel):
    type: Literal["progress"] = "progress"
    resource_id: int
    status: ProcessingStage
    percentage: Optional[int] = None
    error: Optional[str] = None


class ChunkResult(BaseModel):
    chunk_text: str
    chunk_index: int
    page_number: Optional[int] = None
    qdrant_uuid: str
    embedding_hash: str
    token_count: Optional[int] = None


class IngestionResult(BaseModel):
    type: Literal["result"] = "result"
    resource_id: int
    success: bool
    chunks: Optional[List["ChunkResult"]] = None
    embedding_model: Optional[str] = None
    indexed_hash: Optional[str] = None
    error: Optional[str] = None


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    images: Optional[List[str]] = None
    files: Optional[List[str]] = None


class ChatRequest(BaseModel):
    provider: str
    model: str
    task_type: str
    messages: list[ChatMessage]
    stream: bool = True
    thinking_effort: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    usage: Optional[dict] = None

class ProviderConfigRequest(BaseModel):
    api_key: str
    base_url: Optional[str] = None
