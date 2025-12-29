"""
基于 asyncio.Queue 的内存队列
用于管理 Ingestion 任务
"""
import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Callable, Awaitable

from app.models.sql_models import ProcessingStage

class JobType(str, Enum):
    """任务类型"""
    INGEST_RESOURCE = "ingest_resource"
    INGEST_TASK = "ingest_task"
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
    source_id: int  # resource_id 或 task_id
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
        print(f"[IngestionQueue] Job enqueued: {job.job_type.value} - {job.source_id}", flush=True)
    
    async def start_worker(self):
        """启动 Worker"""
        if self._running:
            return
        
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        print("[IngestionQueue] Worker started", flush=True)
    
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
        
        print("[IngestionQueue] Worker stopped", flush=True)
    
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
                print(f"[IngestionQueue] Worker error: {e}", flush=True)
    
    async def _process_job(self, job: IngestionJob):
        """处理单个任务"""
        if not self._processor:
            print("[IngestionQueue] No processor set, skipping job", flush=True)
            return
        
        try:
            print(f"[IngestionQueue] Processing job: {job.job_type.value} - {job.source_id}", flush=True)
            
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
            
            print(f"[IngestionQueue] Job completed: {job.job_type.value} - {job.source_id}", flush=True)
            
        except Exception as e:
            print(f"[IngestionQueue] Job failed: {job.job_type.value} - {job.source_id}: {e}", flush=True)
            
            # 重试逻辑
            if job.retry_count < job.max_retries:
                job.retry_count += 1
                print(f"[IngestionQueue] Retrying job ({job.retry_count}/{job.max_retries})", flush=True)
                await self._queue.put(job)
            else:
                print(f"[IngestionQueue] Job failed after {job.max_retries} retries", flush=True)

# 全局单例
ingestion_queue = IngestionQueue.get_instance()