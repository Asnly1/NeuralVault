"""
封装 LLM 接口
"""
from __future__ import annotations

from dataclasses import dataclass
import asyncio
import mimetypes
import os
import threading
from typing import Optional, AsyncIterator

import anthropic
import google.genai as genai
from google.genai import types as genai_types
import openai
from xai_sdk import Client as GrokClient

from app.core.logging import get_logger
from app.schemas import ChatMessage, MessageRole

logger = get_logger("LLMService")

SYSTEM_PROMPTS: dict[str, str] = {
    "chat": "这是CHAT的Prompt, 临时占位符",
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
    ) -> AsyncIterator[dict]:
        provider = provider.lower()
        system_prompt, conversation = self._split_system_messages(messages, task_type)

        if provider in TEXT_ONLY_PROVIDERS:
            self._ensure_text_only(provider, conversation)
            async for event in self._stream_openai_compatible(
                provider,
                model,
                system_prompt,
                conversation,
            ):
                yield event
            return

        if provider == "openai":
            async for event in self._stream_openai_responses(
                provider,
                model,
                system_prompt,
                conversation,
            ):
                yield event
            return

        if provider == "anthropic":
            async for event in self._stream_anthropic(
                provider,
                model,
                system_prompt,
                conversation,
            ):
                yield event
            return

        if provider == "gemini":
            async for event in self._stream_gemini(
                provider,
                model,
                system_prompt,
                conversation,
            ):
                yield event
            return

        if provider == "grok":
            async for event in self._stream_grok(
                provider,
                model,
                system_prompt,
                conversation,
            ):
                yield event
            return

        raise ValueError(f"Unknown provider: {provider}")

    @staticmethod
    def get_system_prompt(task_type: str) -> Optional[str]:
        return SYSTEM_PROMPTS.get(task_type)

    def _split_system_messages(
        self,
        messages: list[ChatMessage],
        task_type: str,
    ) -> tuple[Optional[str], list[ChatMessage]]:
        system_parts: list[str] = []
        task_prompt = self.get_system_prompt(task_type)
        if task_prompt:
            system_parts.append(task_prompt)

        conversation: list[ChatMessage] = []
        for message in messages:
            if message.role == MessageRole.system:
                if message.content:
                    system_parts.append(message.content)
            else:
                conversation.append(message)

        system_prompt = "\n\n".join(system_parts) if system_parts else None
        return system_prompt, conversation

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
    ) -> AsyncIterator[dict]:
        client = await self._get_openai_client(provider)
        input_items: list[dict] = []

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
        if system_prompt:
            payload["instructions"] = system_prompt

        stream = await client.responses.create(**payload)
        saw_delta = False
        usage_emitted = False
        async for event in stream:
            delta = self._extract_response_delta(event)
            if delta:
                saw_delta = True
                yield {"type": "delta", "delta": delta}
                continue

            done_text = self._extract_response_done_text(event)
            if done_text and not saw_delta:
                saw_delta = True
                yield {"type": "delta", "delta": done_text}

            usage = self._extract_response_usage(event)
            if usage and not usage_emitted:
                usage_emitted = True
                yield {"type": "usage", "usage": usage}

        if not usage_emitted:
            usage = await self._extract_openai_usage(stream)
            if usage:
                yield {"type": "usage", "usage": usage}

    async def _stream_openai_compatible(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_openai_client(provider)
        openai_messages: list[dict] = []

        if system_prompt:
            openai_messages.append({"role": "system", "content": system_prompt})

        for message in messages:
            if message.images or message.files:
                raise ValueError(
                    f"{provider} does not support images/files yet (TODO)."
                )
            openai_messages.append(
                {"role": message.role.value, "content": message.content or ""}
            )

        stream = await client.chat.completions.create(
            model=model,
            messages=openai_messages,
            stream=True,
            stream_options={"include_usage": True},
        )

        async for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield {"type": "delta", "delta": delta}
            if chunk.usage:
                usage = chunk.usage.model_dump()
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
                {"role": message.role.value, "content": message.content or ""}
            )

        kwargs: dict = {
            "model": model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
            "stream": True,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        stream = await client.messages.create(**kwargs)
        usage_emitted = False
        async for event in stream:
            delta = self._extract_anthropic_text_delta(event)
            if delta:
                yield {"type": "delta", "delta": delta}
            usage = self._extract_anthropic_usage(event)
            if usage and not usage_emitted:
                usage_emitted = True
                yield {"type": "usage", "usage": usage}

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

            if message.content:
                parts.append(genai_types.Part.from_text(text=message.content))

            for file_path in message.files or []:
                file_obj = await self._gemini_upload_file(client, file_path)
                parts.append(file_obj)

            for image_path in message.images or []:
                file_obj = await self._gemini_upload_file(client, image_path)
                parts.append(file_obj)

            if not parts:
                parts.append(genai_types.Part.from_text(text=""))

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
        usage_emitted = False
        last_usage: Optional[dict] = None
        async for chunk in stream:
            delta = self._extract_gemini_delta(chunk)
            if delta:
                yield {"type": "delta", "delta": delta}

            usage = self._extract_gemini_usage(chunk)
            if usage:
                last_usage = usage
                if self._is_gemini_final(chunk) and not usage_emitted:
                    usage_emitted = True
                    yield {"type": "usage", "usage": usage}

        if last_usage and not usage_emitted:
            yield {"type": "usage", "usage": last_usage}

    async def _stream_grok(
        self,
        provider: str,
        model: str,
        system_prompt: Optional[str],
        messages: list[ChatMessage],
    ) -> AsyncIterator[dict]:
        client = await self._get_grok_client(provider)
        input_messages: list[dict] = []

        if system_prompt:
            input_messages.append(
                {
                    "role": "developer",
                    "content": system_prompt,
                }
            )

        for message in messages:
            if message.role == MessageRole.system:
                continue

            if message.role == MessageRole.assistant:
                input_messages.append(
                    {"role": "assistant", "content": message.content or ""}
                )
                continue

            content_items: list[dict] = []
            if message.content:
                content_items.append(
                    {"type": "input_text", "text": message.content}
                )

            for file_path in message.files or []:
                file_obj = await asyncio.to_thread(client.files.upload, file_path)
                content_items.append(
                    {"type": "input_file", "file_id": file_obj.id}
                )

            for image_path in message.images or []:
                file_obj = await asyncio.to_thread(client.files.upload, image_path)
                content_items.append(
                    {"type": "input_image", "file_id": file_obj.id}
                )

            if not content_items:
                content_items.append({"type": "input_text", "text": ""})

            input_messages.append(
                {
                    "role": "user",
                    "content": content_items,
                }
            )

        queue: asyncio.Queue[object] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def run_stream() -> None:
            try:
                stream = client.chat.create(
                    model=model,
                    input=input_messages,
                    store_messages=False,
                    stream=True,
                )
                saw_delta = False
                for chunk in stream:
                    delta = self._extract_grok_delta(chunk)
                    if delta:
                        saw_delta = True
                        asyncio.run_coroutine_threadsafe(
                            queue.put({"type": "delta", "delta": delta}),
                            loop,
                        )
                    else:
                        done_text = self._extract_response_done_text(chunk)
                        if done_text and not saw_delta:
                            saw_delta = True
                            asyncio.run_coroutine_threadsafe(
                                queue.put({"type": "delta", "delta": done_text}),
                                loop,
                            )
                    usage = self._extract_grok_usage(chunk)
                    if usage:
                        asyncio.run_coroutine_threadsafe(
                            queue.put({"type": "usage", "usage": usage}),
                            loop,
                        )
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(queue.put(exc), loop)
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        thread = threading.Thread(target=run_stream, daemon=True)
        thread.start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            if isinstance(item, dict):
                yield item

    @staticmethod
    def _event_type(event: object) -> Optional[str]:
        if isinstance(event, dict):
            return event.get("type")
        return getattr(event, "type", None)

    @staticmethod
    def _event_attr(event: object, name: str) -> Optional[object]:
        if isinstance(event, dict):
            return event.get(name)
        return getattr(event, name, None)

    @staticmethod
    def _dump_model(value: object) -> object:
        if value is None:
            return None
        return value.model_dump() if hasattr(value, "model_dump") else value

    @staticmethod
    def _extract_response_delta(event: object) -> Optional[str]:
        event_type = LLMService._event_type(event)
        if event_type != "response.output_text.delta":
            return None
        delta = LLMService._event_attr(event, "delta")
        if isinstance(delta, dict):
            return delta.get("text")
        return delta

    @staticmethod
    def _extract_response_done_text(event: object) -> Optional[str]:
        event_type = LLMService._event_type(event)
        if event_type != "response.output_text.done":
            return None
        text = LLMService._event_attr(event, "text")
        return text

    @staticmethod
    def _extract_response_usage(event: object) -> Optional[dict]:
        event_type = LLMService._event_type(event)
        if event_type != "response.completed":
            return None
        response = LLMService._event_attr(event, "response")
        if response is None:
            return None
        if isinstance(response, dict):
            usage = response.get("usage")
        else:
            usage = getattr(response, "usage", None)
        if usage is None:
            return None
        return LLMService._dump_model(usage)

    async def _extract_openai_usage(self, stream: object) -> Optional[dict]:
        get_final = getattr(stream, "get_final_response", None)
        if not callable(get_final):
            return None
        try:
            final = await get_final()
        except Exception:
            return None
        usage = getattr(final, "usage", None)
        if usage is None:
            return None
        return LLMService._dump_model(usage)

    @staticmethod
    def _extract_anthropic_text_delta(event: object) -> Optional[str]:
        event_type = LLMService._event_type(event)
        if event_type == "text":
            text = LLMService._event_attr(event, "text")
            if isinstance(text, str):
                return text
        if event_type != "content_block_delta":
            return None

        delta = LLMService._event_attr(event, "delta")
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

    @staticmethod
    def _extract_anthropic_usage(event: object) -> Optional[dict]:
        event_type = LLMService._event_type(event)
        if event_type != "message_delta":
            return None
        usage = LLMService._event_attr(event, "usage")
        if usage is None:
            return None
        return LLMService._dump_model(usage)

    async def _openai_upload_file(
        self,
        client: openai.AsyncOpenAI,
        file_path: str,
    ) -> str:
        with open(file_path, "rb") as handle:
            result = await client.files.create(file=handle, purpose="user_data")
        return result.id

    async def _anthropic_upload_file(
        self,
        client: anthropic.AsyncAnthropic,
        file_path: str,
    ) -> str:
        filename = os.path.basename(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "application/octet-stream"
        with open(file_path, "rb") as handle:
            result = await client.beta.files.upload(
                file=(filename, handle, mime_type),
                betas=["files-api-2025-04-14"],
            )
        return result.id

    async def _gemini_upload_file(self, client: genai.Client, file_path: str) -> object:
        return await asyncio.to_thread(client.files.upload, file=file_path)

    @staticmethod
    def _extract_gemini_delta(chunk: object) -> Optional[str]:
        text = getattr(chunk, "text", None)
        if isinstance(text, str) and text:
            return text

        if isinstance(chunk, dict):
            candidates = chunk.get("candidates")
        else:
            candidates = getattr(chunk, "candidates", None)
        if not candidates:
            return None

        candidate = candidates[0] if isinstance(candidates, list) else None
        if candidate is None:
            return None
        content = candidate.get("content") if isinstance(candidate, dict) else getattr(candidate, "content", None)
        if content is None:
            return None
        parts = content.get("parts") if isinstance(content, dict) else getattr(content, "parts", None)
        if not parts:
            return None

        texts: list[str] = []
        for part in parts:
            part_text = part.get("text") if isinstance(part, dict) else getattr(part, "text", None)
            if part_text:
                texts.append(part_text)
        if texts:
            return "".join(texts)
        return None

    @staticmethod
    def _extract_gemini_usage(chunk: object) -> Optional[dict]:
        usage = getattr(chunk, "usage_metadata", None)
        if usage is None and isinstance(chunk, dict):
            usage = chunk.get("usage_metadata")
        if usage is None:
            return None
        return LLMService._dump_model(usage)

    @staticmethod
    def _is_gemini_final(chunk: object) -> bool:
        if isinstance(chunk, dict):
            candidates = chunk.get("candidates")
        else:
            candidates = getattr(chunk, "candidates", None)
        if not candidates:
            return False
        if not isinstance(candidates, list):
            candidates = [candidates]
        for candidate in candidates:
            finish_reason = (
                candidate.get("finish_reason")
                if isinstance(candidate, dict)
                else getattr(candidate, "finish_reason", None)
            )
            if finish_reason:
                return True
        return False

    @staticmethod
    def _extract_grok_delta(chunk: object) -> Optional[str]:
        if chunk is None:
            return None
        delta = LLMService._extract_response_delta(chunk)
        if delta:
            return delta
        if isinstance(chunk, dict):
            choices = chunk.get("choices")
            if choices:
                delta = choices[0].get("delta", {}).get("content")
                if delta:
                    return delta
        choices = getattr(chunk, "choices", None)
        if choices:
            delta = getattr(choices[0], "delta", None)
            if delta is None and isinstance(choices[0], dict):
                delta = choices[0].get("delta")
            if isinstance(delta, dict):
                return delta.get("content")
            return getattr(delta, "content", None)
        return None

    @staticmethod
    def _extract_grok_usage(chunk: object) -> Optional[dict]:
        if chunk is None:
            return None
        usage = LLMService._extract_response_usage(chunk)
        if usage:
            return usage
        if isinstance(chunk, dict):
            usage = chunk.get("usage")
            if usage:
                return usage
        usage = getattr(chunk, "usage", None)
        if usage is None:
            return None
        return LLMService._dump_model(usage)


llm_service = LLMService()
