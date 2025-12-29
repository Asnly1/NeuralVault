"""
接收 Rust 的"新文件/新任务"通知
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.sql_models import (
    Resource, ProcessingStage,
    IngestNotifyRequest, IngestNotifyResponse, IngestStatusResponse
)
from app.workers.queue_manager import (
    ingestion_queue, IngestionJob, JobType, JobAction
)

router = APIRouter()


@router.post("/notify", response_model=IngestNotifyResponse)
async def notify_ingestion(request: IngestNotifyRequest):
    """
    接收 Rust 发来的数据变更通知
    
    立即返回 200 OK，使用后台任务队列处理
    """
    # 确定任务类型
    if request.source_type == "resource":
        if request.action == "deleted":
            job_type = JobType.DELETE_RESOURCE
        else:
            job_type = JobType.INGEST_RESOURCE
    else:
        job_type = JobType.INGEST_TASK
    
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
    
    return IngestNotifyResponse(
        status="accepted",
        message=f"Job {job_type.value} for {request.source_type} {request.id} queued"
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
            status=ProcessingStage.TODO,
            error="Resource not found"
        )
    
    processing_stage, last_error = row
    
    return IngestStatusResponse(
        resource_id=resource_id,
        status=processing_stage,
        error=last_error
    )