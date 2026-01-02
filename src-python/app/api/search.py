"""
混合检索接口
1. POST: /search/hybrid: 执行混合检索。同时查询 Qdrant 和 SQLite FTS。MVP 先暂时使用 语义+FTS5 去重，不使用 RRF
    1. Request: { "query": "深度学习", "top_k": 20, "filters": { "task_id": 5, "file_type": "pdf" } }
2. （预留）POST: /search/rerank 对检索结果进行重排序。
"""
from fastapi import APIRouter

router = APIRouter()