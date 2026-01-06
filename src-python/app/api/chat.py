"""
聊天对话接口 (流式)
POST: /chat/completions
    Request:
        ```json
        {
          "provider": "openai",
          "model": "gpt-4o",
          "task_type": "chat",
          "messages": [
            {
              "role": "user",
              "content": "帮我分析一下这个文档",
              "files": ["/abs/path/to/history_file.pdf"]
            },
            {
              "role": "assistant",
              "content": "好的，文档指出了..."
            },
            {
              "role": "user",
              "content": "那这个图片里是什么？",
              "images": ["/abs/path/to/new_image.jpg"],
              "files": ["/abs/path/to/new_spec.pdf"]
            }
          ]
        }
        ```
    Response (SSE):
        data: {"type":"delta","delta":"这"}
        data: {"type":"delta","delta":"是"}
        data: {"type":"done_text","done_text":"这是"}
        data: {"type":"usage","usage":{"input_tokens":50,"output_tokens":4,"total_tokens":54}}
        data: {"type":"done","done":true}
"""
from typing import AsyncIterator
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas import ChatRequest
from app.services.llm_service import llm_service

router = APIRouter()


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/completions")
async def chat_completions(request: ChatRequest):
    return StreamingResponse(
        _stream_chat_completions(request),
        media_type="text/event-stream",
    )


async def _stream_chat_completions(request: ChatRequest) -> AsyncIterator[str]:
    try:
        async for event in llm_service.stream_chat(
            provider=request.provider,
            model=request.model,
            task_type=request.task_type,
            messages=request.messages,
            thinking_effort=request.thinking_effort,
        ):
            yield _sse_event(event)
        yield _sse_event({"type": "done", "done": True})
    except Exception as exc:
        yield _sse_event({"type": "error", "message": str(exc)})
