"""
FastAPI 入口，生命周期管理
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import events
from app.api import ingest, chat, agent, search, websocket


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
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "service": "neuralvault-ai"}


if __name__ == "__main__":
    import uvicorn
    # TODO: 动态端口
    uvicorn.run(app, host="127.0.0.1", port=8765)
