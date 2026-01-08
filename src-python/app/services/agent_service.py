"""
AI 非对话任务：摘要与主题分类
"""
import json
import re
from typing import Optional, Sequence, Tuple

from app.schemas import ChatMessage, MessageRole, TopicCandidate
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

        prompt_lines = [
            f"请生成不超过 {max_length} 字的中文摘要。",
            "要求：只输出摘要，不要解释，不要添加标题。",
        ]
        if user_note and user_note.strip():
            prompt_lines.append("注意：必须围绕用户备注的意图来总结。")
            prompt_lines.append(f"用户备注：{user_note.strip()}")
        prompt_lines.append(f"内容：{content}")

        text = await llm_service.complete_text(
            provider=provider,
            model=model,
            task_type="summary",
            messages=[ChatMessage(role=MessageRole.user, content="\n".join(prompt_lines))],
        )

        summary = text.strip().strip('"')
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

        prompt_lines = [
            f'新资源摘要: "{summary}"',
            "",
            "候选主题:",
        ]
        if candidates:
            for idx, candidate in enumerate(candidates, start=1):
                candidate_summary = candidate.summary or ""
                prompt_lines.append(f"{idx}. {candidate.title}: {candidate_summary}")
        else:
            prompt_lines.append("（无）")

        prompt_lines.extend(
            [
                "",
                "任务：判断资源属于上述哪个主题；如果都不合适，请创建新主题名。",
                '仅输出 JSON，如 {"topic_name": "...", "confidence": 0.0}。',
            ]
        )

        raw = await llm_service.complete_text(
            provider=provider,
            model=model,
            task_type="topic_classify",
            messages=[ChatMessage(role=MessageRole.user, content="\n".join(prompt_lines))],
        )

        topic_name, confidence = self._parse_topic_response(raw, candidates)
        return topic_name, confidence

    @staticmethod
    def _parse_topic_response(
        raw: str,
        candidates: Sequence[TopicCandidate],
    ) -> Tuple[str, float]:
        text = (raw or "").strip()
        data = None

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.S)
            if match:
                try:
                    data = json.loads(match.group(0))
                except json.JSONDecodeError:
                    data = None

        if isinstance(data, dict):
            topic_name = (
                data.get("topic_name")
                or data.get("topic")
                or data.get("name")
            )
            confidence_raw = data.get("confidence", 0.5)
            try:
                confidence = float(confidence_raw)
            except (TypeError, ValueError):
                confidence = 0.5

            confidence = max(0.0, min(1.0, confidence))
            if topic_name:
                return topic_name, confidence

        if candidates:
            return candidates[0].title, 0.0

        return ("未分类", 0.0)


agent_service = AgentService()
