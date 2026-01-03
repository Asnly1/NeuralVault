"""
接收 Rust 的"资源变更"通知
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas import IngestRequest, IngestResponse, JobType, JobAction, IngestionJob
from app.workers.queue_manager import ingestion_queue, progress_broadcaster

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
        source_id=request.resource_id,
        action=action,
        file_hash=request.file_hash,
        file_type=request.file_type,
        content=request.content,
        file_path=request.file_path
    )
    
    await ingestion_queue.enqueue(job)
    
    return IngestResponse(
        status="accepted",
        message=f"Job {job_type.value} for {request.resource_id} queued"
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
