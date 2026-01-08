"""
混合检索接口

POST /search/hybrid: 执行混合检索（dense + sparse）
"""
from fastapi import APIRouter

from app.core.db import DatabaseManager
from app.schemas import SearchRequest, SearchResponse, SearchResultItem
from app.services.vector_service import vector_service

router = APIRouter()


@router.post("/hybrid", response_model=SearchResponse)
async def search_hybrid(req: SearchRequest) -> SearchResponse:
    """
    混合检索：dense + sparse 向量（RRF 融合）

    - query: 搜索查询
    - node_ids: 可选，限定搜索的 node_id 列表（Local scope）
    - embedding_type: summary / content
    - limit: 返回结果数量

    返回匹配的 chunk 列表，按相关性排序
    """
    db_manager = DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()

    results = await vector_service.search_hybrid(
        query=req.query,
        qdrant_client=qdrant_client,
        node_ids=req.node_ids,
        embedding_type=req.embedding_type.value,
        limit=req.limit,
    )

    return SearchResponse(
        results=[
            SearchResultItem(
                node_id=r["node_id"],
                chunk_index=r["chunk_index"],
                chunk_text=r["chunk_text"],
                score=r["score"],
                page_number=r["page_number"],
            )
            for r in results
            if r["node_id"] is not None
        ]
    )
