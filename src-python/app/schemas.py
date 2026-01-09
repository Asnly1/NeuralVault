"""
Shared schemas and enums for the Python service.
"""
from enum import Enum
from typing import Optional, List, TypeVar, Generic, Type

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


# ==========================================
# LLM Task Schemas (结构化输出)
# ==========================================

T = TypeVar("T", bound=BaseModel)


class BaseLLMTask(BaseModel, Generic[T]):
    """所有 LLM 任务的基类，包含输入参数和预期的输出结构"""

    @property
    def output_schema(self) -> Type[T]:
        """返回输出的 Pydantic 类型"""
        raise NotImplementedError

    def build_prompt(self) -> str:
        """构建完整的提示词"""
        raise NotImplementedError


# ---------- Summary Task ----------

class SummaryResponse(BaseModel):
    summary: str = Field(description="生成的摘要文本")


class SummaryTask(BaseLLMTask[SummaryResponse]):
    content: str
    max_length: int = 100
    user_note: Optional[str] = None

    @property
    def output_schema(self) -> Type[SummaryResponse]:
        return SummaryResponse

    def build_prompt(self) -> str:
        lines = [
            "你是知识库助手，请根据用户提供的内容生成简洁摘要。",
            "",
            f"请生成不超过 {self.max_length} 字的中文摘要。",
        ]
        if self.user_note:
            lines.append(f"注意：必须围绕用户备注的意图来总结。用户备注：{self.user_note}")
        lines.append(f"内容：{self.content}")
        return "\n".join(lines)


# ---------- Topic Classify Task ----------

class TopicClassifyResponse(BaseModel):
    topic_name: str = Field(description="分类的主题名称")
    confidence: float = Field(description="置信度 0.0-1.0")


class TopicClassifyTask(BaseLLMTask[TopicClassifyResponse]):
    resource_summary: str
    candidates: List["TopicCandidate"]

    @property
    def output_schema(self) -> Type[TopicClassifyResponse]:
        return TopicClassifyResponse

    def build_prompt(self) -> str:
        lines = [
            "你是知识库主题分类助手，根据候选主题判断归属或创建新主题。",
            "",
            f'新资源摘要: "{self.resource_summary}"',
            "",
            "候选主题:",
        ]
        if self.candidates:
            for idx, c in enumerate(self.candidates, 1):
                lines.append(f"{idx}. {c.title}: {c.summary or ''}")
        else:
            lines.append("（无）")
        lines.append("")
        lines.append("任务：判断资源属于上述哪个主题；如果都不合适，请创建新主题名。")
        return "\n".join(lines)


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    images: Optional[List[str]] = None
    files: Optional[List[str]] = None


class ChatRequest(BaseModel):
    provider: str
    model: str
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
    qdrant_uuid: str
    embedding_hash: str
    token_count: Optional[int] = None


class EmbedResponse(BaseModel):
    node_id: int
    embedding_type: EmbeddingType
    chunks: List[EmbedChunkResult] = Field(default_factory=list)
    dense_embedding_model: Optional[str] = None
    sparse_embedding_model: Optional[str] = None


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


class SearchResponse(BaseModel):
    results: List[SearchResultItem] = Field(default_factory=list)


# 解决前向引用
TopicClassifyTask.model_rebuild()
