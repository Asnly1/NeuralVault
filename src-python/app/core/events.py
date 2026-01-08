"""
启动/关闭时的钩子
"""
import sys
import os
import asyncio
import signal
from typing import Optional

from app.core.db import DatabaseManager
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("NeuralVault")

# 心跳监控任务
_heartbeat_task: Optional[asyncio.Task] = None

async def startup_handler():
    """应用启动时的初始化"""
    logger.info("Starting up...")
    
    # 初始化 Qdrant
    await DatabaseManager.get_instance()
    
    # 初始化 VectorService（预加载 Embedding 模型）
    if settings.qdrant_path:
        from app.services.vector_service import vector_service
        vector_service.initialize()
    
    # 启动心跳监控（监听 stdin）
    global _heartbeat_task
    _heartbeat_task = asyncio.create_task(monitor_parent_process())
    
    logger.info("Startup complete")


async def shutdown_handler():
    """应用关闭时的清理"""
    logger.info("Shutting down...")
    
    # 停止心跳监控
    global _heartbeat_task
    if _heartbeat_task:
        _heartbeat_task.cancel()
        try:
            await _heartbeat_task
        except asyncio.CancelledError:
            pass
    
    # 关闭 Qdrant 连接
    db_manager = await DatabaseManager.get_instance()
    await db_manager.close()
    
    logger.info("Shutdown complete")


async def monitor_parent_process():
    """
    监控父进程（Tauri）是否存活
    通过监听 stdin，如果 stdin 关闭（父进程退出），则自动退出
    """
    logger.info("Heartbeat monitor started")
    
    try:
        loop = asyncio.get_event_loop() #获取当前运行的事件循环实例
        reader = asyncio.StreamReader() #创建一个异步流读取器
        protocol = asyncio.StreamReaderProtocol(reader) #创建一个协议适配器。它充当底层传输（Transport）和高层读取器（StreamReader）之间的桥梁
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        # 它将操作系统的标准输入文件描述符（sys.stdin）连接到异步事件循环中。   
        # 它告诉事件循环：“监控 stdin 的文件描述符，当有数据可读时，通过 protocol 写入到 reader 中”。
        # 如果没有这一步，直接在 asyncio 中使用 sys.stdin.read() 会导致整个线程阻塞，Web 服务将无法响应任何请求
        
        while True:
            try:
                # 尝试读取 stdin。
                # 如果父进程退出，操作系统通常会关闭 stdin 管道。
                # 代码检测到 line 为空（EOF）时，触发退出流程。
                line = await asyncio.wait_for(
                    reader.readline(),
                    timeout=settings.heartbeat_timeout
                )
                
                if not line:
                    # stdin 已关闭，父进程已退出
                    logger.warning("Parent process exited, shutting down...")

                    # 1. 获取当前进程 ID
                    pid = os.getpid()
                    # 2. 发送 SIGINT 信号 (相当于 Ctrl+C)
                    # 这会通知 Uvicorn 立即终止程序，从而触发 shutdown_handler
                    os.kill(pid, signal.SIGINT)
                    # 退出循环，不再监控
                    break
                    
            except asyncio.TimeoutError:
                # 超时是正常的，继续监听
                continue
                
    except Exception as e:
        logger.error(f"Heartbeat monitor error: {e}")
        sys.exit(1)
