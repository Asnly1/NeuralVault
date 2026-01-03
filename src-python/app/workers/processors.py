"""
具体的消费者逻辑 (处理 Embedding、Task Routing)
Ingestion Worker 处理流程：
1. Fetch: 从 SQLite 读取 Resource（只读）
2. Parse: 调用 FileService 解析文件
3. Chunk: 调用 VectorService 切片
4. Embed: 调用 VectorService 生成向量
5. Upsert: 写入 Qdrant
6. Result: 通过 Stream 发送结果给 Rust，由 Rust 统一写入 SQLite
"""
from typing import Optional

from sqlalchemy import select

from app.core.db import DatabaseManager
from app.core.logging import get_logger
from app.models.sql_models import (
    Resource, SyncStatus, ProcessingStage, ChunkResult, IngestionResult
)
from app.services.file_service import file_service
from app.services.vector_service import vector_service
from app.workers.queue_manager import (
    IngestionJob, JobType, JobAction, ProgressCallback, progress_broadcaster
)

logger = get_logger("Processor")


async def process_ingestion_job(
    job: IngestionJob, 
    progress_callback: ProgressCallback
):
    """
    处理 Ingestion 任务
    
    Args:
        job: Ingestion 任务
        progress_callback: 进度回调函数
    """
    if job.job_type == JobType.INGEST_RESOURCE:
        await _process_resource_ingestion(job.source_id, job.action, progress_callback)
    elif job.job_type == JobType.DELETE_RESOURCE:
        await _process_resource_deletion(job.source_id)


async def _process_resource_ingestion(
    resource_id: int,
    action: JobAction,
    progress_callback: ProgressCallback
):
    """
    处理资源 Ingestion

    完整流程：Fetch -> Parse -> Chunk -> Embed -> Upsert to Qdrant -> Send Result to Rust

    注意：不再直接写入 SQLite，而是通过 Stream 发送结果给 Rust 统一写入
    """
    db_manager = await DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()

    async for session in db_manager.get_session():
        try:
            # 1. Fetch: 从 SQLite 读取 Resource（只读）
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            # 获取单个结果，如果不存在则返回 None
            # 如果存在多条结果，会抛出异常
            resource = result.scalar_one_or_none()

            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return

            file_hash = resource.file_hash
            await progress_callback(resource_id, ProcessingStage.chunking, 10)

            # 2. Parse: 获取文本内容
            text_parts: list[str] = []

            if resource.content:
                text_parts.append(resource.content)

            if resource.file_path:
                try:
                    file_text = await file_service.parse_file(
                        resource.file_path,
                        resource.file_type
                    )
                    if file_text and file_text.strip():
                        text_parts.append(file_text)
                except NotImplementedError as e:
                    logger.warning(f"Unsupported file type: {e}")
                    await progress_broadcaster.broadcast_result(IngestionResult(
                        resource_id=resource_id,
                        success=False,
                        error=str(e)
                    ))
                    return
                except FileNotFoundError as e:
                    logger.warning(f"File not found: {e}")
                    await progress_broadcaster.broadcast_result(IngestionResult(
                        resource_id=resource_id,
                        success=False,
                        error=str(e)
                    ))
                    return

            text_content: Optional[str] = "\n\n".join(text_parts) if text_parts else None

            # 无内容时发送空结果
            if not text_content or not text_content.strip():
                logger.info(f"No content to process for resource: {resource_id}")
                await progress_broadcaster.broadcast_result(IngestionResult(
                    resource_id=resource_id,
                    success=True,
                    chunks=[],
                    indexed_hash=file_hash
                ))
                return

            await progress_callback(resource_id, ProcessingStage.chunking, 30)

            # 3. Chunk: 切分文本
            chunks = vector_service.chunk_text(text_content)

            if not chunks:
                logger.info(f"No chunks generated for resource: {resource_id}")
                await progress_broadcaster.broadcast_result(IngestionResult(
                    resource_id=resource_id,
                    success=True,
                    chunks=[],
                    indexed_hash=file_hash
                ))
                return

            await progress_callback(resource_id, ProcessingStage.embedding, 50)

            # 4. 如果是更新，先删除 Qdrant 中的旧向量
            if action == JobAction.UPDATED:
                await vector_service.delete_by_resource(resource_id, qdrant_client)

            # 5. Embed + Upsert to Qdrant
            chunk_metadata = await vector_service.upsert_chunks(
                resource_id, chunks, qdrant_client
            )

            await progress_callback(resource_id, ProcessingStage.embedding, 80)

            # 6. 构建并发送结果给 Rust（不再写入 SQLite）
            embedding_model = vector_service._dense_model.model_name if vector_service._dense_model else None

            chunk_results = [
                ChunkResult(
                    chunk_text=meta["text"],
                    chunk_index=meta["chunk_index"],
                    page_number=meta["page_number"],
                    qdrant_uuid=meta["qdrant_uuid"],
                    embedding_hash=meta["embedding_hash"],
                    token_count=meta["token_count"]
                )
                for meta in chunk_metadata
            ]

            await progress_broadcaster.broadcast_result(IngestionResult(
                resource_id=resource_id,
                success=True,
                chunks=chunk_results,
                embedding_model=embedding_model,
                indexed_hash=file_hash
            ))

            logger.info(f"Resource {resource_id} ingestion completed: {len(chunks)} chunks")

        except Exception as e:
            logger.error(f"Resource {resource_id} ingestion failed: {e}")
            # 发送错误结果给 Rust
            await progress_broadcaster.broadcast_result(IngestionResult(
                resource_id=resource_id,
                success=False,
                error=str(e)
            ))
            raise


async def _process_resource_deletion(resource_id: int):
    """处理资源删除 - 清理 Qdrant 数据"""
    db_manager = await DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()
    
    await vector_service.delete_by_resource(resource_id, qdrant_client)
    logger.info(f"Resource {resource_id} vectors deleted from Qdrant")


async def rebuild_pending_queue():
    """
    重建待处理队列
    
    启动时扫描数据库，将 sync_status 为 pending/dirty/error 的资源加入队列
    """
    from app.workers.queue_manager import ingestion_queue, IngestionJob, JobType, JobAction
    
    db_manager = await DatabaseManager.get_instance()
    
    async for session in db_manager.get_session():
        # 查询需要处理的资源
        result = await session.execute(
            select(Resource.resource_id, Resource.sync_status).where(
                Resource.sync_status.in_([
                    SyncStatus.pending, 
                    SyncStatus.dirty, 
                    SyncStatus.error
                ]),
                Resource.is_deleted == False
            )
        )
        
        pending_resources = result.all()
        
        for resource_id, sync_status in pending_resources:
            action = JobAction.UPDATED if sync_status == SyncStatus.dirty else JobAction.CREATED
            job = IngestionJob(
                job_type=JobType.INGEST_RESOURCE,
                source_id=resource_id,
                action=action
            )
            await ingestion_queue.enqueue(job)
        
        if pending_resources:
            logger.info(f"Rebuilt queue with {len(pending_resources)} pending resources")