"""
AI 非对话任务：摘要与主题分类
"""
from typing import Optional, Sequence, Tuple

from app.schemas import (
    SummaryTask,
    SummaryResponse,
    TopicCandidate,
    TopicClassifyTask,
    TopicClassifyResponse,
)
from app.services.llm_service import llm_service
from app.core.logging import get_logger

logger = get_logger("AgentService")


class AgentService:
    async def summarize(
        self,
        provider: str,
        model: str,
        content: str,
        user_note: Optional[str],
        max_length: int,
        file_path: Optional[str] = None,
        resource_subtype: Optional[str] = None,
    ) -> str:
        content = (content or "").strip()
        max_length = max(10, int(max_length or 100))

        task = SummaryTask(
            content=content,
            user_note=user_note,
            max_length=max_length,
            file_path=file_path,
            resource_subtype=resource_subtype,
        )

        if task.should_use_file:
            # 非文本类型：优先上传文件，失败时回退到 content
            try:
                logger.info(f"Using file upload mode for {resource_subtype}: {file_path}")
                result: SummaryResponse = await llm_service.structure_reply(
                    provider=provider,
                    model=model,
                    task=task,
                )
            except Exception as e:
                logger.warning(f"File upload failed for {file_path}, falling back to text mode: {e}")
                if not content:
                    raise ValueError(f"File upload failed and no content available: {e}")
                # 回退到纯文本模式
                fallback_task = SummaryTask(
                    content=content,
                    user_note=user_note,
                    max_length=max_length,
                )
                result = await llm_service.structure_reply(
                    provider=provider,
                    model=model,
                    task=fallback_task,
                )
        else:
            # 文本类型：使用 content
            if not content:
                return ""
            result = await llm_service.structure_reply(
                provider=provider,
                model=model,
                task=task,
            )

        summary = result.summary.strip()
        if len(summary) > max_length:
            summary = summary[:max_length]

        return summary

    async def classify_topic(
        self,
        provider: str,
        model: str,
        resource_summary: str,
        candidates: Sequence[TopicCandidate],
    ) -> Tuple[str, float]:
        summary = (resource_summary or "").strip()
        if not summary:
            return ("未分类", 0.0)

        task = TopicClassifyTask(
            resource_summary=summary,
            candidates=list(candidates),
        )

        result: TopicClassifyResponse = await llm_service.structure_reply(
            provider=provider,
            model=model,
            task=task,
        )

        return result.topic_name, max(0.0, min(1.0, result.confidence))


agent_service = AgentService()
