"""
FastAPI 入口，生命周期管理
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import events
from app.api import ingest, chat, agent, search, providers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 当应用启动时，执行 yield 之前的代码，通常用于连接数据库、加载机器学习模型等耗时操作。
    # yield：和传统的迭代器生成值不同。在这里，遇到 yield。函数在此处“冻结”。
    # FastAPI 拿到控制权，开始启动 HTTP 服务器，接收外部请求。
    # 当应用关闭（收到终止信号）时，执行 yield 之后的代码，通常用于断开数据库连接、释放内存资源。
    await events.startup_handler()
    yield
    await events.shutdown_handler()


app = FastAPI(
    title="NeuralVault Python Backend",
    description="Python backend for NeuralVault",
    version="0.1.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: 限制为Tauri前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(providers.router, tags=["providers"])


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "service": "neuralvault-ai"}


@app.post("/shutdown")
async def shutdown():
    """优雅关闭接口，供 Rust 调用"""
    import asyncio
    import os
    import signal
    
    asyncio.create_task(_shutdown())
    return {"status": "shutting down"}


async def _shutdown():
    """延迟关闭，给响应时间返回"""
    import asyncio
    import os
    import signal
    
    await asyncio.sleep(0.5)
    os.kill(os.getpid(), signal.SIGTERM)


if __name__ == "__main__":
    import argparse
    import uvicorn
    from app.core.logging import setup_logging, get_logger
    from app.core.config import settings
    
    # 配置日志
    setup_logging()
    logger = get_logger("Python")
    
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="NeuralVault Python Backend")
    parser.add_argument("--port", type=int, default=8765, help="Server port")
    parser.add_argument("--qdrant-path", type=str, help="Qdrant data path")
    args = parser.parse_args()
    
    # 更新 settings（命令行参数优先）
    if args.qdrant_path:
        settings.qdrant_path = args.qdrant_path
        logger.info(f"Qdrant path: {settings.qdrant_path}")
    
    if not settings.qdrant_path:
        logger.error("Qdrant path is required")
        raise SystemExit(1)
    
    logger.info(f"Starting server on port {args.port}")
    
    # IMPORTANT: 必须使用单进程模式 (workers=1)
    # 原因：
    # 1. ProgressBroadcaster 使用内存状态管理 HTTP 流订阅者
    # 2. IngestionQueue 使用 asyncio.Queue 内存队列
    # 3. VectorService 单例持有 Embedding 模型
    # 多进程会导致状态不共享，进度推送和任务队列无法正常工作
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=args.port,
        workers=1,  # 强制单进程
        log_level="info"
    )
