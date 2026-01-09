"""
非对话 AI 任务接口（摘要/Embedding/主题分类）
"""
from fastapi import APIRouter

from app.core.db import DatabaseManager
from app.schemas import (
    ClassifyTopicRequest,
    ClassifyTopicResponse,
    DeleteEmbeddingRequest,
    EmbedChunkResult,
    EmbedRequest,
    EmbedResponse,
    EmbeddingType,
    SummaryRequest,
    SummaryResponse,
)
from app.services.agent_service import agent_service
from app.services.vector_service import TextChunk, vector_service

router = APIRouter()


def _single_chunk(text: str) -> list[TextChunk]:
    """创建单段 TextChunk（用于 summary 或不切分的 content）"""
    return [TextChunk(text=text, chunk_index=0, page_number=None, token_count=len(text.split()))]


@router.post("/summary", response_model=SummaryResponse)
async def summarize(request: SummaryRequest):
    summary = await agent_service.summarize(
        provider=request.provider,
        model=request.model,
        content=request.content,
        user_note=request.user_note,
        max_length=request.max_length,
    )
    return SummaryResponse(summary=summary)


@router.post("/embedding", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    text = (request.text or "").strip()
    if not text:
        return EmbedResponse(
            node_id=request.node_id,
            embedding_type=request.embedding_type,
            chunks=[],
            embedding_model=vector_service.get_dense_model_name(),
        )

    db_manager = await DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()

    embedding_type = request.embedding_type.value
    if request.replace:
        await vector_service.delete_by_node(
            node_id=request.node_id,
            qdrant_client=qdrant_client,
            embedding_type=embedding_type,
        )

    if request.embedding_type == EmbeddingType.summary:
        chunks = _single_chunk(text)
    else:
        if request.chunk:
            chunks = vector_service.chunk_text(text)
        else:
            chunks = _single_chunk(text)

    chunk_metadata = await vector_service.upsert_chunks(
        node_id=request.node_id,
        chunks=chunks,
        qdrant_client=qdrant_client,
        embedding_type=embedding_type,
    )

    results = [
        EmbedChunkResult(
            chunk_text=meta["text"],
            chunk_index=meta["chunk_index"],
            page_number=meta["page_number"],
            qdrant_uuid=meta["qdrant_uuid"],
            embedding_hash=meta["embedding_hash"],
            token_count=meta["token_count"],
        )
        for meta in chunk_metadata
    ]

    return EmbedResponse(
        node_id=request.node_id,
        embedding_type=request.embedding_type,
        chunks=results,
        embedding_model=vector_service.get_dense_model_name(),
    )


@router.post("/embedding/delete")
async def delete_embedding(request: DeleteEmbeddingRequest):
    db_manager = await DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()
    embedding_type = request.embedding_type.value if request.embedding_type else None
    await vector_service.delete_by_node(
        node_id=request.node_id,
        qdrant_client=qdrant_client,
        embedding_type=embedding_type,
    )
    return {"status": "ok"}


@router.post("/classify", response_model=ClassifyTopicResponse)
async def classify_topic(request: ClassifyTopicRequest):
    topic_name, confidence = await agent_service.classify_topic(
        provider=request.provider,
        model=request.model,
        resource_summary=request.resource_summary,
        candidates=request.candidates,
    )
    return ClassifyTopicResponse(topic_name=topic_name, confidence=confidence)
