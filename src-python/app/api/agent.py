"""
不是对话的 AI 任务处理 (标签等)
1. POST: /agent/tag 自动打标。分析 Resource 内容，建议 Tags。存到 suggested_tags 里面
    1. Request: { "model": "gpt-4o-mini", "resource_id": 1, "chunk_id_list": ["1", "2", "5"] }
"""
from fastapi import APIRouter

router = APIRouter()
