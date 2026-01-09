"""
Provider config endpoints for LLM service.
目前只支持 Gemini。
"""
from fastapi import APIRouter, HTTPException
from app.schemas import ProviderConfigRequest
from app.services.llm_service import llm_service

router = APIRouter(prefix="/providers")


@router.put("/{provider}")
async def set_provider_config(provider: str, payload: ProviderConfigRequest):
    if provider.lower() != "gemini":
        raise HTTPException(status_code=400, detail=f"Provider {provider} not supported")
    await llm_service.set_gemini_config(api_key=payload.api_key)
    return {"status": "ok"}


@router.delete("/{provider}")
async def remove_provider_config(provider: str):
    if provider.lower() != "gemini":
        raise HTTPException(status_code=400, detail=f"Provider {provider} not supported")
    await llm_service.remove_gemini_config()
    return {"status": "ok"}
