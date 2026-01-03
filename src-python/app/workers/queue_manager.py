"""
基于 asyncio.Queue 的内存队列
用于管理 Ingestion 任务
"""
import asyncio
import json
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Callable, Awaitable, AsyncGenerator

from app.models.sql_models import ProcessingStage, IngestProgress, IngestionResult
from app.core.logging import get_logger

logger = get_logger("IngestionQueue")


class ProgressBroadcaster:
    """
    全局进度广播器

    使用 HTTP StreamingResponse + NDJSON
    支持多个订阅者同时监听进度更新
    """
    _instance: Optional['ProgressBroadcaster'] = None

    def __init__(self):
        self._subscribers: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> 'ProgressBroadcaster':
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def subscribe(self) -> AsyncGenerator[str, None]:
        """
        订阅进度更新流

        返回一个异步生成器，yield NDJSON 格式的进度消息
        """
        queue: asyncio.Queue = asyncio.Queue()

        async with self._lock:
            self._subscribers.append(queue)
            logger.info(f"New subscriber connected. Total: {len(self._subscribers)}")

        try:
            while True:
                # 等待进度消息
                progress = await queue.get()
                # 返回 NDJSON 格式（每行一个 JSON 对象）
                yield json.dumps(progress, ensure_ascii=False) + "\n"
        finally:
            async with self._lock:
                if queue in self._subscribers:
                    self._subscribers.remove(queue)
                    logger.info(f"Subscriber disconnected. Total: {len(self._subscribers)}")

    async def broadcast(
        self,
        resource_id: int,
        stage: ProcessingStage,
        percentage: Optional[int] = None,
        error: Optional[str] = None
    ):
        """
        广播进度消息给所有订阅者

        Args:
            resource_id: 资源 ID
            stage: 处理阶段
            percentage: 进度百分比 (0-100)
            error: 错误信息（如果有）
        """
        message = IngestProgress(
            resource_id=resource_id,
            status=stage,
            percentage=percentage,
            error=error if error else None
        )
        await self._broadcast_message(message.model_dump(exclude_none=True))

    async def broadcast_result(self, result: IngestionResult):
        """广播处理结果"""
        await self._broadcast_message(result.model_dump(exclude_none=True))

    async def _broadcast_message(self, message: dict):
        """内部广播方法"""
        async with self._lock:
            subscribers = list(self._subscribers)

        # 向所有订阅者发送消息
        for queue in subscribers:
            try:
                await queue.put(message)
            except Exception as e:
                logger.error(f"Failed to send to subscriber: {e}")


# 全局单例
progress_broadcaster = ProgressBroadcaster.get_instance()

class JobType(str, Enum):
    """任务类型"""
    INGEST_RESOURCE = "ingest_resource"
    DELETE_RESOURCE = "delete_resource"

class JobAction(str, Enum):
    """触发动作"""
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"

@dataclass
class IngestionJob:
    """Ingestion 任务"""
    job_type: JobType
    source_id: int  # resource_id
    action: JobAction
    retry_count: int = 0
    max_retries: int = 3

# 进度回调类型
# 函数类型，接受参数：int, ProcessingStage, Optional[int]，返回值为 Awaitable[None]
ProgressCallback = Callable[[int, ProcessingStage, Optional[int]], Awaitable[None]]

class IngestionQueue:
    """
    Ingestion 任务队列管理器
    
    使用 asyncio.Queue 实现轻量级内存队列
    """
    _instance: Optional['IngestionQueue'] = None
    
    def __init__(self):
        self._queue: asyncio.Queue[IngestionJob] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        self._processor: Optional[Callable[[IngestionJob, ProgressCallback], Awaitable[None]]] = None
        self._progress_callback: Optional[ProgressCallback] = None
    
    @classmethod
    def get_instance(cls) -> 'IngestionQueue':
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def set_processor(
        self, 
        processor: Callable[[IngestionJob, ProgressCallback], Awaitable[None]]
    ):
        """设置任务处理器"""
        self._processor = processor
    
    def set_progress_callback(self, callback: ProgressCallback):
        """设置进度回调（用于 WebSocket 推送）"""
        self._progress_callback = callback
    
    async def enqueue(self, job: IngestionJob):
        """将任务加入队列"""
        await self._queue.put(job)
        logger.info(f"Job enqueued: {job.job_type.value} - {job.source_id}")
    
    async def start_worker(self):
        """启动 Worker"""
        if self._running:
            return
        
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        logger.info("Worker started")
    
    async def stop_worker(self):
        """停止 Worker"""
        self._running = False
        
        if self._worker_task:
            # 发送一个空任务来唤醒 worker
            await self._queue.put(None)  # type: ignore
            
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
        
        logger.info("Worker stopped")
    
    async def _worker_loop(self):
        """Worker 主循环"""
        while self._running:
            try:
                # 等待任务
                job = await self._queue.get()
                
                # 检查是否是停止信号
                if job is None:
                    break
                
                # 处理任务
                await self._process_job(job)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker error: {e}")
    
    async def _process_job(self, job: IngestionJob):
        """处理单个任务"""
        if not self._processor:
            logger.warning("No processor set, skipping job")
            return
        
        try:
            logger.info(f"Processing job: {job.job_type.value} - {job.source_id}")
            
            # 创建进度回调包装器
            async def progress_wrapper(
                resource_id: int, 
                stage: ProcessingStage, 
                percentage: Optional[int] = None
            ):
                if self._progress_callback:
                    await self._progress_callback(resource_id, stage, percentage)
            
            # 调用处理器
            await self._processor(job, progress_wrapper)
            
            logger.info(f"Job completed: {job.job_type.value} - {job.source_id}")
            
        except Exception as e:
            logger.error(f"Job failed: {job.job_type.value} - {job.source_id}: {e}")
            
            # 重试逻辑
            if job.retry_count < job.max_retries:
                job.retry_count += 1
                logger.info(f"Retrying job ({job.retry_count}/{job.max_retries})")
                await self._queue.put(job)
            else:
                logger.error(f"Job failed after {job.max_retries} retries")

# 全局单例
ingestion_queue = IngestionQueue.get_instance()