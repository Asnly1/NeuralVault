"""
Provider config endpoints for LLM service.
"""
from fastapi import APIRouter
from app.schemas import ProviderConfigRequest
from app.services.llm_service import llm_service

router = APIRouter(prefix="/providers")


@router.put("/{provider}")
async def set_provider_config(provider: str, payload: ProviderConfigRequest):
    await llm_service.set_provider_config(
        provider=provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
    )
    return {"status": "ok"}


@router.delete("/{provider}")
async def remove_provider_config(provider: str):
    await llm_service.remove_provider_config(provider)
    return {"status": "ok"}
