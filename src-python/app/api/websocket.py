"""
负责向前端推送 AI 处理进度
WebSocket 连接管理
"""
import asyncio
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.sql_models import WebSocketMessage, ProcessingStage
from app.core.logging import get_logger

logger = get_logger("WebSocket")

router = APIRouter()

class ConnectionManager:
    """WebSocket 连接管理器"""
    
    _instance: Optional['ConnectionManager'] = None
    
    def __init__(self):
        self._active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()
    
    @classmethod
    def get_instance(cls) -> 'ConnectionManager':
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def connect(self, websocket: WebSocket):
        """接受新连接"""
        await websocket.accept()
        async with self._lock:
            self._active_connections.append(websocket)
        logger.info(f"Client connected. Total: {len(self._active_connections)}")
    
    async def disconnect(self, websocket: WebSocket, close_code: int = 1000):
        """断开连接"""
        async with self._lock:
            if websocket in self._active_connections:
                self._active_connections.remove(websocket)
                try:
                    await websocket.close(code=close_code)
                except Exception:
                    # 忽略已经关闭的连接报错
                    pass
        logger.info(f"Client disconnected. Total: {len(self._active_connections)}")
    
    async def _send_safe(self, websocket: WebSocket, message: str):
        """单独处理每个连接的发送异常，互不影响"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send message: {e}")
            await self.disconnect(websocket, close_code=1011)

    async def broadcast(self, message: WebSocketMessage):
        """广播消息给所有连接"""
        if not self._active_connections:
            return
        
        message_json = message.model_dump_json()
        
        # 复制列表以避免在迭代时修改
        async with self._lock:
            connections = list(self._active_connections)
        
        if connections:
            async with asyncio.TaskGroup() as tg:
                for ws in connections:
                    tg.create_task(self._send_safe(ws, message_json))
    
    async def send_ingest_progress(
        self, 
        resource_id: int, 
        status: ProcessingStage,
        percentage: Optional[int] = None,
        error: Optional[str] = None
    ):
        """发送进度更新"""
        message = WebSocketMessage(
            resource_id=resource_id,
            event="ingest",
            status=status,
            percentage=percentage,
            error=error
        )
        # 将广播任务丢进 Event Loop 后台运行，Worker 可以立即返回继续计算
        # 避免阻塞 Worker 线程，确保快速响应
        asyncio.create_task(self.broadcast(message))

# 全局连接管理器
connection_manager = ConnectionManager.get_instance()

@router.websocket("/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket 端点，前端用于接收实时进度通知
    """
    await connection_manager.connect(websocket)
    
    try:
        while True:
            # 保持连接，等待客户端消息（心跳等）
            data = await websocket.receive_text()
            # 可以在这里处理客户端发来的消息（如心跳）
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await connection_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Error: {e}")
        await connection_manager.disconnect(websocket, close_code=1011)

# 进度回调函数，供 Worker 调用
async def notify_progress(
    resource_id: int,
    stage: ProcessingStage,
    percentage: Optional[int] = None
):
    """
    进度通知回调函数
    
    供 IngestionQueue 调用，向前端推送进度
    """
    await connection_manager.send_ingest_progress(
        resource_id=resource_id,
        status=stage,
        percentage=percentage
    )
