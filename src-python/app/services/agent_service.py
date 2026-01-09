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


class AgentService:
    async def summarize(
        self,
        provider: str,
        model: str,
        content: str,
        user_note: Optional[str],
        max_length: int,
    ) -> str:
        content = (content or "").strip()
        if not content:
            return ""

        max_length = max(10, int(max_length or 100))

        task = SummaryTask(
            content=content,
            user_note=user_note,
            max_length=max_length,
        )

        result: SummaryResponse = await llm_service.structure_reply(
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
