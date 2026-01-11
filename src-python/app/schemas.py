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
    file_path: Optional[str] = None
    resource_subtype: Optional[str] = None

    @property
    def output_schema(self) -> Type[SummaryResponse]:
        return SummaryResponse

    @property
    def should_use_file(self) -> bool:
        """判断是否应该使用文件上传模式"""
        return bool(self.file_path and self.resource_subtype != "text")

    def build_prompt(self) -> str:
        lines = [
            "你是知识库助手，请根据用户提供的内容生成简洁摘要。",
            "",
            f"请生成不超过 {self.max_length} 字的中文摘要。",
        ]
        if self.user_note:
            lines.append(f"注意：必须围绕用户备注的意图来总结。用户备注：{self.user_note}")
        # 文件上传模式时不需要在 prompt 中包含 content
        if not self.should_use_file and self.content:
            lines.append(f"内容：{self.content}")
        return "\n".join(lines)


# ---------- Topic Classify Task ----------

class ParentTopicCandidate(BaseModel):
    node_id: int = Field(description="父级主题的 node_id")
    title: str = Field(description="父级主题标题")
    summary: Optional[str] = Field(default=None, description="父级主题摘要")


class TopicCandidate(BaseModel):
    node_id: int = Field(description="主题 node_id")
    title: str = Field(description="主题标题")
    summary: Optional[str] = Field(default=None, description="主题摘要")
    parents: List[ParentTopicCandidate] = Field(default_factory=list)


class NewTopicPayload(BaseModel):
    title: str = Field(description="新主题标题")
    summary: Optional[str] = Field(default=None, description="新主题摘要")


class TopicRevisionPayload(BaseModel):
    topic_id: int = Field(description="需要修改的主题 node_id")
    new_title: Optional[str] = Field(default=None, description="新标题")
    new_summary: Optional[str] = Field(default=None, description="新摘要")


class AssignPayload(BaseModel):
    target_topic_id: int = Field(description="现有主题 node_id")


class CreateNewPayload(BaseModel):
    new_topic: NewTopicPayload
    parent_topic_id: Optional[int] = Field(default=None, description="可选的父主题 node_id")


class RestructurePayload(BaseModel):
    topics_to_revise: List[TopicRevisionPayload] = Field(default_factory=list)
    new_parent_topic: Optional[NewTopicPayload] = Field(default=None)
    reparent_target_ids: List[int] = Field(default_factory=list)
    assign_current_resource_to_parent: Optional[bool] = Field(default=None)


class ClassifyAction(str, Enum):
    assign = "assign"
    create_new = "create_new"
    restructure = "restructure"


class ClassifyTopicResponse(BaseModel):
    action: ClassifyAction
    payload: dict
    confidence_score: float


class TopicClassifyTask(BaseLLMTask[ClassifyTopicResponse]):
    resource_summary: str
    candidates: List[TopicCandidate]

    @property
    def output_schema(self) -> Type[ClassifyTopicResponse]:
        return ClassifyTopicResponse

    def build_prompt(self) -> str:
        lines = [
            "你是知识库主题分类助手，根据候选主题判断归属或创建新主题，必要时重构层级。",
            "",
            f'新资源摘要: "{self.resource_summary}"',
            "",
            "候选主题 (node_id, title, summary, parents):",
        ]
        if self.candidates:
            for idx, c in enumerate(self.candidates, 1):
                parent_info = ", ".join(
                    [f'{p.node_id}:{p.title}' for p in c.parents]
                ) or "None"
                lines.append(
                    f"{idx}. [{c.node_id}] {c.title} - {c.summary or ''} | parents: {parent_info}"
                )
        else:
            lines.append("（无）")
        lines.append("")
        lines.append(
            "任务：选择一种 action 并返回结构化 JSON："
        )
        lines.append(
            "1) assign: 资源属于现有主题，payload.target_topic_id 为 node_id。"
        )
        lines.append(
            "2) create_new: 现有主题都不合适，payload.new_topic 填写 title/summary，可选 parent_topic_id。"
        )
        lines.append(
            "3) restructure: 需要重构层级，可修改已有主题，创建新父主题，并 reparent。"
        )
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
    file_path: Optional[str] = None
    resource_subtype: Optional[str] = None


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


class ClassifyTopicRequest(BaseModel):
    provider: str
    model: str
    resource_summary: str
    candidates: List[TopicCandidate] = Field(default_factory=list)


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
