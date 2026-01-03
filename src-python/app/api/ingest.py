"""
接收 Rust 的"新文件/新任务"通知
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.sql_models import (
    Resource, ProcessingStage,
    IngestRequest, IngestResponse, IngestStatusResponse
)
from app.workers.queue_manager import (
    ingestion_queue, IngestionJob, JobType, JobAction,
    progress_broadcaster
)

router = APIRouter()


@router.post("/", response_model=IngestResponse)
async def ingestion(request: IngestRequest):
    """
    接收 Rust 发来的数据变更通知
    
    立即返回 200 OK，使用后台任务队列处理
    """
    # 确定任务类型
    if request.action == "deleted":
        job_type = JobType.DELETE_RESOURCE
    else:
        job_type = JobType.INGEST_RESOURCE
    
    # 确定动作类型
    action_map = {
        "created": JobAction.CREATED,
        "updated": JobAction.UPDATED,
        "deleted": JobAction.DELETED
    }
    action = action_map.get(request.action, JobAction.CREATED)
    
    # 创建并入队任务
    job = IngestionJob(
        job_type=job_type,
        source_id=request.id,
        action=action
    )
    
    await ingestion_queue.enqueue(job)
    
    return IngestResponse(
        status="accepted",
        message=f"Job {job_type.value} for {request.id} queued"
    )


@router.get("/status/{resource_id}", response_model=IngestStatusResponse)
async def get_ingestion_status(
    resource_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    查询某个资源的 AI 处理状态
    """
    result = await db.execute(
        select(Resource.processing_stage, Resource.last_error)
        .where(Resource.resource_id == resource_id)
    )
    row = result.one_or_none()
    
    if not row:
        return IngestStatusResponse(
            resource_id=resource_id,
            status=ProcessingStage.todo,
            error="Resource not found"
        )
    
    processing_stage, last_error = row
    
    return IngestStatusResponse(
        resource_id=resource_id,
        status=processing_stage,
        error=last_error
    )


@router.get("/stream")
async def stream_progress():
    """
    全局进度流端点

    返回一个 NDJSON 流，实时推送所有资源的处理进度。
    Rust 端会建立一个持久连接来读取这个流，并通过 Tauri Events 转发给前端。

    响应格式 (每行一个 JSON 对象):
        {"type": "progress", "resource_id": 1, "stage": "chunking", "percentage": 30}
        {"type": "progress", "resource_id": 1, "stage": "embedding", "percentage": 80}
        {"type": "progress", "resource_id": 1, "stage": "done", "percentage": 100}

    使用方式:
        curl -N http://localhost:PORT/ingest/stream
    """
    return StreamingResponse(
        progress_broadcaster.subscribe(),
        media_type="application/x-ndjson",
        headers={
            # 禁用缓存，确保实时推送
            "Cache-Control": "no-cache",
            # 保持连接
            "Connection": "keep-alive",
            # 禁用 nginx 等代理的缓冲
            "X-Accel-Buffering": "no",
        }
    )