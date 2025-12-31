"""
聊天对话接口
API Key 由 Rust 在请求中传入，Python 不持久化存储
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import openai
import anthropic
import google.genai as genai
from app.models.sql_models import MessageRole

router = APIRouter()


class ChatMessage(BaseModel):
    role: MessageRole
    content: str


class ChatRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    base_url: Optional[str] = None
    messages: list[ChatMessage]
    context_resource_ids: Optional[list[int]] = None


class ChatResponse(BaseModel):
    content: str
    usage: Optional[dict] = None


@router.post("/completions")
async def chat_completions(request: ChatRequest) -> ChatResponse:
    """
    调用 LLM 生成回复
    支持的 provider:
    - openai: ChatGPT
    - anthropic: Claude
    - gemini: Google Gemini
    - grok: xAI Grok (OpenAI 兼容)
    - deepseek: Deepseek (OpenAI 兼容)
    - qwen: 通义千问 (OpenAI 兼容)
    """
    try:
        if request.provider in ("openai", "deepseek", "qwen", "grok"):
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


async def _call_openai_compatible(request: ChatRequest) -> ChatResponse:
    """调用 OpenAI 兼容接口 (OpenAI, Deepseek, Qwen, Grok)"""
    client = openai.AsyncOpenAI(
        api_key=request.api_key,
        base_url=request.base_url
    )

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    response = await client.chat.completions.create(
        model=request.model,
        messages=messages,
    )

    return ChatResponse(
        content=response.choices[0].message.content or "",
        usage=response.usage.model_dump() if response.usage else None
    )


async def _call_anthropic(request: ChatRequest) -> ChatResponse:
    """调用 Anthropic Claude"""
    client = anthropic.AsyncAnthropic(api_key=request.api_key)

    # Anthropic 格式：需要分离 system 消息
    system_msg = None
    user_messages = []
    for m in request.messages:
        if m.role == MessageRole.SYSTEM:
            system_msg = m.content
        else:
            user_messages.append({"role": m.role, "content": m.content})

    kwargs = {
        "model": request.model,
        "max_tokens": 4096,
        "messages": user_messages,
    }
    if system_msg:
        kwargs["system"] = system_msg

    response = await client.messages.create(**kwargs)

    content = ""
    if response.content:
        content = response.content[0].text

    return ChatResponse(
        content=content,
        usage={
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }
    )


async def _call_gemini(request: ChatRequest) -> ChatResponse:
    """调用 Google Gemini"""
    client = genai.Client(api_key=request.api_key)

    # 转换消息格式为 Gemini 格式
    contents = []
    for m in request.messages:
        role = "user" if m.role == MessageRole.USER else "model"
        contents.append({
            "role": role,
            "parts": [{"text": m.content}]
        })

    response = await client.aio.models.generate_content(
        model=request.model,
        contents=contents,
    )

    content = ""
    if response.text:
        content = response.text

    return ChatResponse(
        content=content,
        usage=None  # Gemini usage 格式不同，暂时忽略
    )
