"""
具体的消费者逻辑 (处理 Embedding、Task Routing)
Ingestion Worker 处理流程：
1. Fetch: 从 SQLite 读取 Resource
2. Parse: 调用 FileService 解析文件
3. Chunk: 调用 VectorService 切片
4. Embed: 调用 VectorService 生成向量
5. Upsert: 写入 Qdrant + SQLite (context_chunks)
6. Update: 更新 sync_status 和 processing_stage
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, delete

from app.core.db import DatabaseManager
from app.core.logging import get_logger
from app.models.sql_models import (
    Resource, ContextChunk, SyncStatus, ProcessingStage
)
from app.services.file_service import file_service
from app.services.vector_service import vector_service
from app.workers.queue_manager import (
    IngestionJob, JobType, JobAction, ProgressCallback
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
    # TODO: 处理 Task 相关的 ingestion


async def _process_resource_ingestion(
    resource_id: int,
    action: JobAction,
    progress_callback: ProgressCallback
):
    """
    处理资源 Ingestion
    
    完整流程：Fetch -> Parse -> Chunk -> Embed -> Upsert -> Update
    """
    db_manager = await DatabaseManager.get_instance()
    qdrant_client = db_manager.get_qdrant()
    
    async for session in db_manager.get_session():
        try:
            # 1. Fetch: 从 SQLite 读取 Resource
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            # 获取单个结果，如果不存在则返回 None
            # 如果存在多条结果，会抛出异常
            resource = result.scalar_one_or_none()
            
            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return
            
            # 更新状态为 chunking
            resource.processing_stage = ProcessingStage.chunking
            resource.processing_hash = resource.file_hash
            await session.commit()
            await progress_callback(resource_id, ProcessingStage.chunking, 10)
            
            # 2. Parse: 获取文本内容
            text_content: Optional[str] = None
            
            if resource.content:
                # 如果已有 content（如文本资源），直接使用
                text_content = resource.content
            elif resource.file_path:
                # 否则解析文件
                try:
                    text_content = await file_service.parse_file(
                        resource.file_path, 
                        resource.file_type
                    )
                except NotImplementedError as e:
                    logger.warning(f"Unsupported file type: {e}")
                    resource.sync_status = SyncStatus.error
                    resource.last_error = str(e)
                    await session.commit()
                    return
                except FileNotFoundError as e:
                    logger.warning(f"File not found: {e}")
                    resource.sync_status = SyncStatus.error
                    resource.last_error = str(e)
                    await session.commit()
                    return
            
            if not text_content or not text_content.strip():
                logger.info(f"No content to process for resource: {resource_id}")
                resource.sync_status = SyncStatus.synced
                resource.processing_stage = ProcessingStage.done
                resource.indexed_hash = resource.file_hash
                resource.last_indexed_at = datetime.now(timezone.utc)
                await session.commit()
                await progress_callback(resource_id, ProcessingStage.done, 100)
                return
            
            await progress_callback(resource_id, ProcessingStage.chunking, 30)
            
            # 3. Chunk: 切分文本
            chunks = vector_service.chunk_text(text_content)
            
            if not chunks:
                logger.info(f"No chunks generated for resource: {resource_id}")
                resource.sync_status = SyncStatus.synced
                resource.processing_stage = ProcessingStage.done
                resource.indexed_hash = resource.file_hash
                resource.last_indexed_at = datetime.now(timezone.utc)
                await session.commit()
                await progress_callback(resource_id, ProcessingStage.done, 100)
                return
            
            # 更新状态为 embedding
            resource.processing_stage = ProcessingStage.embedding
            await session.commit()
            await progress_callback(resource_id, ProcessingStage.embedding, 50)
            
            # 4 & 5. Embed + Upsert: 如果是更新，先删除旧数据
            if action == JobAction.UPDATED:
                # 删除 Qdrant 中的旧向量
                await vector_service.delete_by_resource(resource_id, qdrant_client)
                
                # 删除 SQLite 中的旧 chunks
                await session.execute(
                    delete(ContextChunk).where(ContextChunk.resource_id == resource_id)
                )
            
            # 向量化并写入 Qdrant
            chunk_metadata = await vector_service.upsert_chunks(
                resource_id, chunks, qdrant_client
            )
            
            await progress_callback(resource_id, ProcessingStage.embedding, 80)
            
            # 6. 批量写入 SQLite context_chunks
            embedding_model = vector_service._dense_model.model_name if vector_service._dense_model else None
            now = datetime.now(timezone.utc)
            
            context_chunks = [
                ContextChunk(
                    resource_id=resource_id,
                    chunk_text=meta["text"],
                    chunk_index=meta["chunk_index"],
                    page_number=meta["page_number"],
                    qdrant_uuid=meta["qdrant_uuid"],
                    embedding_hash=meta["embedding_hash"],
                    embedding_model=embedding_model,
                    embedding_at=now,
                    token_count=meta["token_count"]
                )
                for meta in chunk_metadata
            ]
            
            session.add_all(context_chunks)
            
            # 7. Update: 更新 Resource 状态
            resource.sync_status = SyncStatus.synced
            resource.processing_stage = ProcessingStage.done
            resource.indexed_hash = resource.file_hash
            resource.last_indexed_at = now
            resource.last_error = None
            
            await session.commit()
            await progress_callback(resource_id, ProcessingStage.done, 100)
            
            logger.info(f"Resource {resource_id} ingestion completed: {len(chunks)} chunks")
            
        except Exception as e:
            await session.rollback()
            
            # 更新错误状态
            try:
                result = await session.execute(
                    select(Resource).where(Resource.resource_id == resource_id)
                )
                resource = result.scalar_one_or_none()
                if resource:
                    resource.sync_status = SyncStatus.error
                    resource.last_error = str(e)
                    await session.commit()
            except Exception:
                pass
            
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