"""
Shared schemas and enums for the Python service.
"""
from enum import Enum
from typing import Optional, List

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


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


class EmbeddingType(str, Enum):
    summary = "summary"
    content = "content"


class SummaryRequest(BaseModel):
    provider: str
    model: str
    content: str
    user_note: Optional[str] = None
    max_length: int = 100


class SummaryResponse(BaseModel):
    summary: str


class EmbedRequest(BaseModel):
    node_id: int
    text: str
    embedding_type: EmbeddingType = EmbeddingType.content
    replace: bool = True
    chunk: bool = True


class EmbedChunkResult(BaseModel):
    chunk_text: str
    chunk_index: int
    page_number: Optional[int] = None
    qdrant_uuid: str
    embedding_hash: str
    token_count: Optional[int] = None


class EmbedResponse(BaseModel):
    node_id: int
    embedding_type: EmbeddingType
    chunks: List[EmbedChunkResult] = Field(default_factory=list)
    embedding_model: Optional[str] = None


class DeleteEmbeddingRequest(BaseModel):
    node_id: int
    embedding_type: Optional[EmbeddingType] = None


class TopicCandidate(BaseModel):
    title: str
    summary: Optional[str] = None


class ClassifyTopicRequest(BaseModel):
    provider: str
    model: str
    resource_summary: str
    candidates: List[TopicCandidate] = Field(default_factory=list)


class ClassifyTopicResponse(BaseModel):
    topic_name: str
    confidence: float


# ==========================================
# Search Schemas
# ==========================================

class SearchRequest(BaseModel):
    query: str
    node_ids: Optional[List[int]] = None  # Scope: Local 限定
    embedding_type: EmbeddingType = EmbeddingType.content
    limit: int = 20


class SearchResultItem(BaseModel):
    node_id: int
    chunk_index: int
    chunk_text: str
    score: float
    page_number: Optional[int] = None


class SearchResponse(BaseModel):
    results: List[SearchResultItem] = Field(default_factory=list)
