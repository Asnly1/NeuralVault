"""
聊天对话接口
API Key 由 Rust 在请求中传入，Python 不持久化存储 TODO：Rust在启动时传入Key，Python中持久化存储（llm.service)
POST: /chat/responses 发送消息并获取回复。
    1. Request:
        ```json
        {
        "provider": "openai",
        "model": "gpt-4o",
        "messages": [
            // --- 历史记录 ---
            {
            "role": "system",
            "content": "你是一个有用的助手。"
            },
            {
            "role": "user",
            "content": "帮我分析一下这个文档",
            "files": ["/abs/path/to/history_file.pdf"]
            },
            {
            "role": "assistant",
            "content": "好的，文档指出了..."
            },
            
            // --- 当前新消息 (Rust 传入路径) ---
            {
            "role": "user",
            "content": "那这个图片里是什么？",
            "images": ["/abs/path/to/new_image.jpg"],
            "files": ["/abs/path/to/new_spec.pdf"]
            }
        ]
        }
        ```
    2. Response:
        ```json
        {
        data: {"type": "content", "delta": "这"}
        data: {"type": "content", "delta": "是"}
        data: {"type": "content", "delta": "一"}
        data: {"type": "content", "delta": "张"}
        data: {"type": "usage", "usage": {"prompt_tokens": 50, "completion_tokens": 4}}
        data: [DONE]
        "usage": {"prompt_tokens": 10, "completion_tokens": 20}
        }
        ```
    3. Provider 路由：
        - openai/deepseek/qwen: 使用 OpenAI SDK（兼容 API）
        - anthropic: 使用 Anthropic SDK
        - gemini: 使用 Google GenAI SDK
        - grok: 使用 Grok SDK
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncIterator
import json
import openai
import anthropic
import google.genai as genai
from google.genai import types
from app.schemas import MessageRole, ChatMessage, ChatRequest, ChatResponse

router = APIRouter()

def _split_system_messages(
    messages: list[ChatMessage],
) -> tuple[list[str], list[ChatMessage]]:
    system_parts = [m.content for m in messages if m.role == MessageRole.system]
    non_system = [m for m in messages if m.role != MessageRole.system]
    return system_parts, non_system


def _build_openai_response_input(
    messages: list[ChatMessage],
) -> tuple[Optional[str], list[dict]]:
    system_parts, conversation = _split_system_messages(messages)
    instructions = "\n\n".join(system_parts) if system_parts else None
    input_items = [
        {
            "role": m.role.value,
            "content": [{"type": "input_text", "text": m.content}],
        }
        for m in conversation
    ]
    return instructions, input_items


def _build_gemini_request(
    messages: list[ChatMessage],
) -> tuple[Optional[str], list[dict]]:
    system_parts, conversation = _split_system_messages(messages)
    system_instruction = "\n\n".join(system_parts) if system_parts else None
    contents = []
    for m in conversation:
        role = "user" if m.role == MessageRole.user else "model"
        contents.append({"role": role, "parts": [{"text": m.content}]})
    return system_instruction, contents


def _build_anthropic_request(messages: list[ChatMessage]) -> tuple[Optional[str], list[dict]]:
    system_parts, conversation = _split_system_messages(messages)
    system_msg = "\n\n".join(system_parts) if system_parts else None
    user_messages = [
        {"role": m.role.value, "content": m.content} for m in conversation
    ]
    return system_msg, user_messages


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/completions")
async def chat_completions(request: ChatRequest):
    """
    调用 LLM 生成回复
    支持的 provider:
    - openai: ChatGPT (Responses API)
    - anthropic: Claude
    - gemini: Google Gemini
    - grok: xAI Grok (OpenAI 兼容)
    - deepseek: Deepseek (OpenAI 兼容)
    - qwen: 通义千问 (OpenAI 兼容)
    """
    if request.stream:
        return StreamingResponse(
            _stream_chat_completions(request),
            media_type="text/event-stream",
        )

    try:
        if request.provider == "openai":
            return await _call_openai_responses(request)
        elif request.provider in ("deepseek", "qwen", "grok"):
            return await _call_openai_compatible(request)
        elif request.provider == "anthropic":
            return await _call_anthropic(request)
        elif request.provider == "gemini":
            return await _call_gemini(request)
        else:
            raise HTTPException(400, f"Unknown provider: {request.provider}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


async def _stream_chat_completions(request: ChatRequest) -> AsyncIterator[str]:
    text_parts: list[str] = []
    try:
        async for delta in _stream_provider(request):
            if not delta:
                continue
            text_parts.append(delta)
            yield _sse_event({"type": "delta", "content": delta})
        yield _sse_event({"type": "done", "content": "".join(text_parts)})
    except Exception as e:
        yield _sse_event({"type": "error", "message": str(e)})


async def _stream_provider(request: ChatRequest) -> AsyncIterator[str]:
    if request.provider == "openai":
        async for delta in _stream_openai_responses(request):
            yield delta
    elif request.provider in ("deepseek", "qwen", "grok"):
        async for delta in _stream_openai_compatible(request):
            yield delta
    elif request.provider == "anthropic":
        async for delta in _stream_anthropic(request):
            yield delta
    elif request.provider == "gemini":
        async for delta in _stream_gemini(request):
            yield delta
    else:
        raise HTTPException(400, f"Unknown provider: {request.provider}")


async def _call_openai_responses(request: ChatRequest) -> ChatResponse:
    """调用 OpenAI Responses API"""
    client = openai.AsyncOpenAI(api_key=request.api_key, base_url=request.base_url)

    instructions, input_items = _build_openai_response_input(request.messages)
    payload = {
        "model": request.model,
        "input": input_items if input_items else "",
    }
    if instructions:
        payload["instructions"] = instructions

    response = await client.responses.create(**payload)

    return ChatResponse(
        content=response.output_text or "",
        usage=response.usage.model_dump() if response.usage else None,
    )


async def _call_openai_compatible(request: ChatRequest) -> ChatResponse:
    """调用 OpenAI 兼容接口 (Deepseek, Qwen, Grok)"""
    client = openai.AsyncOpenAI(api_key=request.api_key, base_url=request.base_url)

    messages = [
        {"role": m.role.value, "content": m.content} for m in request.messages
    ]

    response = await client.chat.completions.create(
        model=request.model,
        messages=messages,
    )

    return ChatResponse(
        content=response.choices[0].message.content or "",
        usage=response.usage.model_dump() if response.usage else None,
    )


async def _call_anthropic(request: ChatRequest) -> ChatResponse:
    """调用 Anthropic Claude"""
    client = anthropic.AsyncAnthropic(api_key=request.api_key)

    system_msg, user_messages = _build_anthropic_request(request.messages)
    kwargs = {
        "model": request.model,
        "max_tokens": 4096,
        "messages": user_messages,
    }
    if system_msg:
        kwargs["system"] = system_msg

    response = await client.messages.create(**kwargs)

    content_parts = []
    if response.content:
        for block in response.content:
            text = getattr(block, "text", None)
            if text:
                content_parts.append(text)
    content = "".join(content_parts)

    return ChatResponse(
        content=content,
        usage={
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
    )


async def _call_gemini(request: ChatRequest) -> ChatResponse:
    """调用 Google Gemini"""
    client = genai.Client(api_key=request.api_key)

    system_instruction, contents = _build_gemini_request(request.messages)
    kwargs = {
        "model": request.model,
        "contents": contents if contents else "",
    }
    if system_instruction:
        kwargs["config"] = types.GenerateContentConfig(
            system_instruction=system_instruction
        )

    response = await client.aio.models.generate_content(**kwargs)

    return ChatResponse(
        content=response.text or "",
        usage=None,
    )


def _extract_openai_response_delta(event: object) -> Optional[str]:
    event_type = getattr(event, "type", None)
    if event_type is None and isinstance(event, dict):
        event_type = event.get("type")
    if event_type != "response.output_text.delta":
        return None
    delta = getattr(event, "delta", None)
    if delta is None and isinstance(event, dict):
        delta = event.get("delta")
    return delta


async def _stream_openai_responses(request: ChatRequest) -> AsyncIterator[str]:
    client = openai.AsyncOpenAI(api_key=request.api_key, base_url=request.base_url)

    instructions, input_items = _build_openai_response_input(request.messages)
    payload = {
        "model": request.model,
        "input": input_items if input_items else "",
        "stream": True,
    }
    if instructions:
        payload["instructions"] = instructions

    stream = await client.responses.create(**payload)
    async for event in stream:
        delta = _extract_openai_response_delta(event)
        if delta:
            yield delta


async def _stream_openai_compatible(request: ChatRequest) -> AsyncIterator[str]:
    client = openai.AsyncOpenAI(api_key=request.api_key, base_url=request.base_url)

    messages = [
        {"role": m.role.value, "content": m.content} for m in request.messages
    ]
    stream = await client.chat.completions.create(
        model=request.model,
        messages=messages,
        stream=True,
    )

    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def _extract_anthropic_text_delta(event: object) -> Optional[str]:
    event_type = getattr(event, "type", None)
    if event_type is None and isinstance(event, dict):
        event_type = event.get("type")
    if event_type != "content_block_delta":
        return None

    delta = getattr(event, "delta", None)
    if delta is None and isinstance(event, dict):
        delta = event.get("delta")
    if delta is None:
        return None

    delta_type = getattr(delta, "type", None)
    if delta_type is None and isinstance(delta, dict):
        delta_type = delta.get("type")
    if delta_type != "text_delta":
        return None

    if isinstance(delta, dict):
        return delta.get("text")
    return getattr(delta, "text", None)


async def _stream_anthropic(request: ChatRequest) -> AsyncIterator[str]:
    client = anthropic.AsyncAnthropic(api_key=request.api_key)

    system_msg, user_messages = _build_anthropic_request(request.messages)
    kwargs = {
        "model": request.model,
        "max_tokens": 4096,
        "messages": user_messages,
        "stream": True,
    }
    if system_msg:
        kwargs["system"] = system_msg

    stream = await client.messages.create(**kwargs)
    async for event in stream:
        delta = _extract_anthropic_text_delta(event)
        if delta:
            yield delta


async def _stream_gemini(request: ChatRequest) -> AsyncIterator[str]:
    client = genai.Client(api_key=request.api_key)

    system_instruction, contents = _build_gemini_request(request.messages)
    kwargs = {
        "model": request.model,
        "contents": contents if contents else "",
    }
    if system_instruction:
        kwargs["config"] = types.GenerateContentConfig(
            system_instruction=system_instruction
        )

    stream = await client.aio.models.generate_content_stream(**kwargs)
    async for chunk in stream:
        if chunk.text:
            yield chunk.text
