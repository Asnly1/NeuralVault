"""
封装 LLM 接口
目前只实现 Gemini，保留多厂商架构以便未来扩展
"""
from __future__ import annotations

from dataclasses import dataclass
import asyncio
from typing import Optional, AsyncIterator

import google.genai as genai
from google.genai import types as genai_types
from pydantic import BaseModel

from app.core.logging import get_logger
from app.schemas import (
    ChatMessage,
    MessageRole,
    BaseLLMTask,
)

logger = get_logger("LLMService")

CHAT_PROMPT = "You are a helpful assistant."


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    base_url: Optional[str] = None


class LLMService:
    def __init__(self) -> None:
        self._gemini_config: Optional[ProviderConfig] = None
        self._gemini_client: Optional[genai.Client] = None
        self._lock = asyncio.Lock()

    async def set_gemini_config(self, api_key: str) -> None:
        async with self._lock:
            self._gemini_config = ProviderConfig(api_key=api_key)
            self._gemini_client = None  # 重置 client，下次使用时重建

    async def remove_gemini_config(self) -> None:
        async with self._lock:
            self._gemini_config = None
            self._gemini_client = None

    # ==========================================
    # 公开接口
    # ==========================================

    async def stream_chat(
        self,
        provider: str,
        model: str,
        messages: list[ChatMessage],
        thinking_effort: Optional[str] = None,
    ) -> AsyncIterator[dict]:
        """
        流式对话接口，每次发送完整历史
        """
        provider = provider.lower()

        if provider == "gemini":
            async for event in self._stream_gemini(model, messages, thinking_effort):
                yield event
            return

        # 未来可添加其他 provider
        raise NotImplementedError(f"Provider {provider} not implemented yet")

    async def structure_reply(
        self,
        provider: str,
        model: str,
        task: BaseLLMTask,
        thinking_effort: Optional[str] = None,
    ) -> BaseModel:
        """
        结构化输出接口，返回 Pydantic 模型实例
        task 自包含输入参数、输出 schema 和 prompt 构建逻辑
        """
        provider = provider.lower()

        if provider == "gemini":
            return await self._structure_reply_gemini(model, task, thinking_effort)

        # 未来可添加其他 provider
        raise NotImplementedError(f"Provider {provider} not implemented yet")

    # ==========================================
    # Gemini 实现
    # ==========================================

    async def _get_gemini_client(self) -> genai.Client:
        async with self._lock:
            if not self._gemini_config or not self._gemini_config.api_key:
                raise ValueError("Gemini not configured")
            if self._gemini_client is None:
                self._gemini_client = genai.Client(api_key=self._gemini_config.api_key)
            return self._gemini_client

    async def _gemini_upload_file(self, client: genai.Client, file_path: str) -> object:
        return await client.aio.files.upload(file=file_path)

    async def _wait_for_file_active(self, client: genai.Client, file_obj) -> None:
        """等待文件处理完成（PDF/视频需要）"""
        while True:
            remote_file = await client.aio.files.get(name=file_obj.name)
            if remote_file.state == "ACTIVE":
                break
            elif remote_file.state == "FAILED":
                raise ValueError(f"File {remote_file.name} failed to process")
            await asyncio.sleep(0.5)

    async def _stream_gemini(
        self,
        model: str,
        messages: list[ChatMessage],
        thinking_effort: Optional[str] = None,
    ) -> AsyncIterator[dict]:
        """
        Gemini 流式对话实现
        """
        client = await self._get_gemini_client()

        # 构建 contents
        contents: list[genai_types.Content] = []
        for message in messages:
            role = "user" if message.role == MessageRole.user else "model"
            parts: list = []

            # 处理文件上传
            for file_path in message.files or []:
                file_obj = await self._gemini_upload_file(client, file_path)
                await self._wait_for_file_active(client, file_obj)
                parts.append(
                    genai_types.Part(
                        file_data=genai_types.FileData(
                            file_uri=file_obj.uri, mime_type=file_obj.mime_type
                        )
                    )
                )

            for image_path in message.images or []:
                file_obj = await self._gemini_upload_file(client, image_path)
                await self._wait_for_file_active(client, file_obj)
                parts.append(
                    genai_types.Part(
                        file_data=genai_types.FileData(
                            file_uri=file_obj.uri, mime_type=file_obj.mime_type
                        )
                    )
                )

            if message.content:
                parts.append(genai_types.Part(text=message.content))

            if parts:
                contents.append(genai_types.Content(role=role, parts=parts))

        # 构建配置
        system_prompt = CHAT_PROMPT
        config_kwargs: dict = {}
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        if thinking_effort:
            config_kwargs["thinking_config"] = genai_types.ThinkingConfig(
                thinking_level=thinking_effort, include_thoughts=True
            )

        config = genai_types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

        # 流式生成
        kwargs: dict = {"model": model, "contents": contents}
        if config:
            kwargs["config"] = config

        stream = await client.aio.models.generate_content_stream(**kwargs)

        answer_text = ""
        thinking_text = ""
        usage = None
        final_chunk = None
        async for chunk in stream:
            final_chunk = chunk
            if chunk.candidates and chunk.candidates[0].content:
                for part in chunk.candidates[0].content.parts:
                    if not part.text:
                        continue
                    if getattr(part, "thought", False):
                        thinking_text += part.text
                        yield {"type": "thinking_delta", "delta": part.text}
                        continue
                    else:
                        answer_text += part.text
                        yield {"type": "answer_delta", "delta": part.text}

        if final_chunk:
            usage = {
                "input_tokens": final_chunk.usage_metadata.prompt_token_count,
                "output_tokens": final_chunk.usage_metadata.candidates_token_count,
                "reasoning_tokens": final_chunk.usage_metadata.thoughts_token_count,
                "total_tokens": final_chunk.usage_metadata.total_token_count,
            }

        yield {"type": "answer_full_text", "full_text": answer_text}
        if thinking_text:
            yield {"type": "thinking_full_text", "full_text": thinking_text}
        if usage:
            yield {"type": "usage", "usage": usage}

    async def _structure_reply_gemini(
        self,
        model: str,
        task: BaseLLMTask,
        thinking_effort: Optional[str] = None,
    ) -> BaseModel:
        """
        Gemini 结构化输出实现
        """
        client = await self._get_gemini_client()

        # 从 task 获取 prompt 和 output schema
        prompt = task.build_prompt()
        output_schema = task.output_schema

        contents = [
            genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])
        ]

        # 构建配置
        config_kwargs: dict = {
            "response_mime_type": "application/json",
            "response_schema": output_schema.model_json_schema(),
        }
        if thinking_effort:
            config_kwargs["thinking_config"] = genai_types.ThinkingConfig(
                thinking_level=thinking_effort
            )

        # TODO: Summary直接使用图片/文件
        config = genai_types.GenerateContentConfig(**config_kwargs)

        response = await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        # 解析并验证输出
        return output_schema.model_validate_json(response.text)


llm_service = LLMService()
