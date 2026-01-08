"""
封装 LLM 接口
"""
from __future__ import annotations

from dataclasses import dataclass
import asyncio
import os
from typing import Optional, AsyncIterator

import anthropic
import google.genai as genai
from google.genai import types as genai_types
import openai
from xai_sdk import AsyncClient as GrokClient
from xai_sdk.chat import system as grok_system, user as grok_user, assistant as grok_assistant, file as grok_file

from app.core.logging import get_logger
from app.schemas import ChatMessage, MessageRole

logger = get_logger("LLMService")

SYSTEM_PROMPTS: dict[str, str] = {
    "chat": "这是CHAT的Prompt, 临时占位符",
    "summary": "你是知识库助手，请根据用户提供的内容生成简洁摘要。",
    "topic_classify": "你是知识库主题分类助手，根据候选主题判断归属或创建新主题。",
}

TEXT_ONLY_PROVIDERS = {"deepseek", "qwen"}


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    base_url: Optional[str] = None


class LLMService:
    def __init__(self) -> None:
        self._configs: dict[str, ProviderConfig] = {}
        self._openai_clients: dict[str, openai.AsyncOpenAI] = {}
        self._anthropic_clients: dict[str, anthropic.AsyncAnthropic] = {}
        self._gemini_clients: dict[str, genai.Client] = {}
        self._grok_clients: dict[str, GrokClient] = {}
        self._lock = asyncio.Lock()

    async def set_provider_config(
        self,
        provider: str,
        api_key: str,
        base_url: Optional[str],
    ) -> None:
        async with self._lock:
            self._configs[provider] = ProviderConfig(api_key=api_key, base_url=base_url)
            self._openai_clients.pop(provider, None)
            self._anthropic_clients.pop(provider, None)
            self._gemini_clients.pop(provider, None)
            self._grok_clients.pop(provider, None)

    async def remove_provider_config(self, provider: str) -> None:
        async with self._lock:
            self._configs.pop(provider, None)
            self._openai_clients.pop(provider, None)
            self._anthropic_clients.pop(provider, None)
            self._gemini_clients.pop(provider, None)
            self._grok_clients.pop(provider, None)

    async def get_provider_config(self, provider: str) -> Optional[ProviderConfig]:
        async with self._lock:
            return self._configs.get(provider)

    async def stream_chat(
        self,
        provider: str,
        model: str,
        task_type: str,
        messages: list[ChatMessage],
        thinking_effort: Optional[str] = None,
    ) -> AsyncIterator[dict]:
        provider = provider.lower()
        system_prompt = SYSTEM_PROMPTS.get(task_type)

        if provider in TEXT_ONLY_PROVIDERS:
            self._ensure_text_only(provider, messages)
            async for event in self._stream_openai_compatible(
                provider,
                model,
                system_prompt,
                messages,
            ):
                yield event
            return

        if provider == "openai":
            async for event in self._stream_openai_responses(
                provider,
                model,
                system_prompt,
                messages,
                thinking_effort,
            ):
                yield event
            return

        if provider == "anthropic":
            async for event in self._stream_anthropic(
                provider,
                model,
                system_prompt,
                messages,
            ):
                yield event
            return

        if provider == "gemini":
            async for event in self._stream_gemini(
                provider,
                model,
                system_prompt,
                messages,
            ):
                yield event
            return

        if provider == "grok":
            async for event in self._stream_grok(
                provider,
                model,
                system_prompt,
                messages,
            ):
                yield event
            return

        raise ValueError(f"Unknown provider: {provider}")

    async def complete_text(
        self,
        provider: str,
        model: str,
        task_type: str,
        messages: list[ChatMessage],
        thinking_effort: Optional[str] = None,
    ) -> str:
        fragments: list[str] = []
        final_text: Optional[str] = None

        async for event in self.stream_chat(
            provider=provider,
            model=model,
            task_type=task_type,
            messages=messages,
            thinking_effort=thinking_effort,
        ):
            event_type = event.get("type")
            if event_type == "delta":
                delta = event.get("delta") or ""
                fragments.append(delta)
            elif event_type == "done_text":
                final_text = event.get("done_text") or ""

        if final_text is None:
            final_text = "".join(fragments)

        return final_text.strip()

    @staticmethod
    def _ensure_text_only(provider: str, messages: list[ChatMessage]) -> None:
        for message in messages:
            if message.images or message.files:
                raise ValueError(
                    f"{provider} does not support images/files yet (TODO)."
                )

    async def _get_openai_client(self, provider: str) -> openai.AsyncOpenAI:
        config = await self._require_config(provider)
        client = self._openai_clients.get(provider)
        if client is None:
            client = openai.AsyncOpenAI(
                api_key=config.api_key,
                base_url=config.base_url,
            )
            self._openai_clients[provider] = client
        return client

    async def _get_anthropic_client(self, provider: str) -> anthropic.AsyncAnthropic:
        config = await self._require_config(provider)
        client = self._anthropic_clients.get(provider)
        if client is None:
            client = anthropic.AsyncAnthropic(api_key=config.api_key)
            self._anthropic_clients[provider] = client
        return client

    async def _get_gemini_client(self, provider: str) -> genai.Client:
        config = await self._require_config(provider)
        client = self._gemini_clients.get(provider)
        if client is None:
            client = genai.Client(api_key=config.api_key)
            self._gemini_clients[provider] = client
        return client

    async def _get_grok_client(self, provider: str) -> GrokClient:
        config = await self._require_config(provider)
        client = self._grok_clients.get(provider)
        if client is None:
            client = GrokClient(api_key=config.api_key)
            self._grok_clients[provider] = client
        return client

    async def _require_config(self, provider: str) -> ProviderConfig:
        config = await self.get_provider_config(provider)
        if not config or not config.api_key:
            raise ValueError(f"Provider {provider} not configured")
        return config

    async def _stream_openai_responses(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
        thinking_effort: Optional[str],
    ) -> AsyncIterator[dict]:
        client = await self._get_openai_client(provider)
        input_items: list[dict] = []

        if system_prompt:
            input_items.append({"role": "developer", "content": system_prompt})

        for message in messages:
            content_items: list[dict] = []
            for image_path in message.images or []:
                file_id = await self._openai_upload_file(client, image_path)
                content_items.append({"type": "input_image", "file_id": file_id})

            for file_path in message.files or []:
                file_id = await self._openai_upload_file(client, file_path)
                content_items.append({"type": "input_file", "file_id": file_id})

            if message.content:
                content_items.append({"type": "input_text", "text": message.content})

            if not content_items:
                continue

            input_items.append(
                {
                    "role": message.role.value,
                    "content": content_items,
                }
            )

        payload: dict = {
            "model": model,
            "input": input_items if input_items else "",
            "stream": True,
        }
        if thinking_effort:
            payload["reasoning"] = {"effort": thinking_effort}

        stream = await client.responses.create(**payload)
        async for event in stream:
            event_type = event.type
            if event_type == "response.output_text.delta":
                delta = event.delta
                yield {"type": "delta", "delta": delta}
            elif event_type == "response.output_text.done":
                full_text = event.text
                yield {"type": "done_text", "done_text": full_text}
            elif event_type == "response.completed":
                response = event.response
                reasoning_tokens = getattr(
                    response.usage.output_tokens_details,
                    "reasoning_tokens",
                    0,
                )
                usage = {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "reasoning_tokens": reasoning_tokens,
                    "total_tokens": response.usage.total_tokens + reasoning_tokens,
                }
                yield {"type": "usage", "usage": usage}
            elif event_type == "response.failed":
                raise RuntimeError(event.response.error.message)
            elif event_type == "error":
                raise RuntimeError(event.message)
            else:
                continue

    async def _stream_openai_compatible(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_openai_client(provider)
        input_items: list[dict] = []

        if system_prompt:
            input_items.append({"role": "system", "content": system_prompt})

        for message in messages:
            if message.images or message.files:
                raise ValueError(
                    f"{provider} does not support images/files yet (TODO)."
                )
            input_items.append(
                {"role": message.role.value, "content": message.content or ""}
            )

        stream = await client.chat.completions.create(
            model=model,
            messages=input_items,
            stream=True,
            stream_options={"include_usage": True},
        )

        full_text = ""
        usage = None
        async for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_text += delta
                    yield {"type": "delta", "delta": delta}
            if chunk.usage:
                usage = {
                    "input_tokens": chunk.usage.prompt_tokens,
                    "output_tokens": chunk.usage.completion_tokens,
                    "total_tokens": chunk.usage.total_tokens,
                }
                
        yield {"type": "done_text", "done_text": full_text}
        if usage:
            yield {"type": "usage", "usage": usage}

    async def _stream_anthropic(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_anthropic_client(provider)
        self._ensure_text_only(provider, messages)

        anthropic_messages: list[dict] = []
        for message in messages:
            anthropic_messages.append(
                {"role": message.role.value, "content": message.content}
            )

        kwargs: dict = {
            "model": model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        with client.beta.messages.stream(**kwargs) as stream:
            async for event in stream:
                event_type = event.get("type")
                if event_type == "content_block_delta":
                    delta = event.get("delta", None).get("text", None)
                    if delta:
                        yield {"type": "delta", "delta": delta}
                elif event_type == "content_block_stop":
                    done_text = event.get("content_block", None).get("text", None)
                    if done_text:
                        yield {"type": "done_text", "done_text": done_text}
                elif event_type == "message_delta":
                    usage = event.get("usage", None)
                    usage_dict = {
                        "input_tokens": usage.input_tokens,
                        "output_tokens": usage.output_tokens,
                        "total_tokens": usage.input_tokens + usage.output_tokens,
                    }
                    if usage:
                        yield {"type": "usage", "usage": usage_dict}
                else:
                    raise ValueError(f"Unknown event type: {event_type}")

    async def _stream_gemini(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_gemini_client(provider)

        contents: list[genai_types.Content] = []
        for message in messages:
            role = "user" if message.role == MessageRole.user else "model"
            parts: list[object] = []

            for file_path in message.files or []:
                file_obj = await self._gemini_upload_file(client, file_path)
                parts.append(file_obj)

            for image_path in message.images or []:
                file_obj = await self._gemini_upload_file(client, image_path)
                parts.append(file_obj)

            if message.content:
                parts.append(genai_types.Part(text=message.content))

            if not parts:
                continue

            contents.append(genai_types.Content(role=role, parts=parts))

        kwargs: dict = {
            "model": model,
            "contents": contents if contents else "",
        }
        if system_prompt:
            kwargs["config"] = genai_types.GenerateContentConfig(
                system_instruction=system_prompt
            )

        stream = await client.aio.models.generate_content_stream(**kwargs)
        full_text = ""
        usage = None
        async for chunk in stream:
            if chunk.candidates[0].content.text:
                delta = chunk.candidates[0].content.text
                full_text += delta
                yield {"type": "delta", "delta": delta}
            if chunk.usage_metadata:
                usage = {
                    "input_tokens": chunk.usage_metadata.prompt_token_count,
                    "output_tokens": chunk.usage_metadata.candidates_token_count,
                    "total_tokens": chunk.usage_metadata.total_token_count,
                }
        yield {"type": "done_text", "done_text": full_text}
        if usage:
            yield {"type": "usage", "usage": usage}

    async def _stream_grok(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_grok_client(provider)

        chat = client.chat.create(model=model, store_messages=False)
        chat.append(grok_system(system_prompt))

        for message in messages:
            if message.role == MessageRole.system:
                continue

            if message.role == MessageRole.assistant:
                chat.append(grok_assistant(message.content))
                continue

            if message.role == MessageRole.user:
                file_parts = []
                for image_path in message.images or []:
                    file_obj = await self._grok_upload_file(client, image_path)
                    file_parts.append(grok_file(file_obj.id))

                for file_path in message.files or []:
                    file_obj = await self._grok_upload_file(client, file_path)
                    file_parts.append(grok_file(file_obj.id))

                if file_parts:
                    chat.append(grok_user(message.content, *file_parts))
                else:
                    chat.append(grok_user(message.content))
        
        full_text = ""
        final_response = None
        async for response, chunk in chat.stream():
            final_response = response
            if chunk.content:
                yield {"type": "delta", "delta": chunk.content}
                full_text += chunk.content
        
        yield {"type": "done_text", "done_text": full_text}
        usage = {
            "input_tokens": final_response.usage.prompt_tokens,
            "output_tokens": final_response.usage.completion_tokens,
            "resoning_tokens": final_response.usage.reasoning_tokens,
            "total_tokens": final_response.usage.total_tokens,
        }
        yield {"type": "usage", "usage": usage}

    async def _openai_upload_file(
        self,
        client: openai.AsyncOpenAI,
        file_path: str,
    ) -> str:
        with open(file_path, "rb") as f:
            result = await client.files.create(file=f, purpose="user_data")
        return result.id

    async def _anthropic_upload_file(
        self,
        client: anthropic.AsyncAnthropic,
        file_path: str,
    ) -> str:
        filename = os.path.basename(file_path)
        name, ext = os.path.splitext(filename)
        if ext == ".pdf":
            file_type_string = "application/pdf"
        elif ext == ".png":
            file_type_string = "image/png"
        elif ext == ".jpg":
            file_type_string = "image/jpeg"
        elif ext == ".jpeg":
            file_type_string = "image/jpeg"
        elif ext == ".webp":
            file_type_string = "image/webp"
        
        with open(file_path, "rb") as f:
            result = await client.beta.files.upload(file=(name, f, file_type_string))
        return result.id

    async def _gemini_upload_file(self, client: genai.Client, file_path: str) -> object:
        return await client.files.upload(file=file_path)

    async def _grok_upload_file(self, client: GrokClient, file_path: str) -> object:
        return await client.files.upload(file=file_path)


llm_service = LLMService()
