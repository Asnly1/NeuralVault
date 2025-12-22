"""
SQLite (SQLModel) & Qdrant 单例连接池
"""
import asyncio
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings


class DatabaseManager:
    """数据库管理器 - 单例模式"""
    
    _instance: Optional['DatabaseManager'] = None
    _lock = asyncio.Lock()
    
    def __init__(self):
        self.engine: Optional[AsyncEngine] = None
        self.session_factory: Optional[sessionmaker] = None
        self.qdrant_client: Optional[QdrantClient] = None
    
    @classmethod
    # 确保整个应用程序在运行期间，无论接收到多少个请求，DatabaseManager 这个类只会被实例化（创建）一次
    # 双重检查锁定
    async def get_instance(cls) -> 'DatabaseManager':
        """获取单例实例"""
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    await cls._instance.initialize()
        return cls._instance
    
    async def initialize(self):
        """初始化数据库连接"""
        # 初始化 SQLite
        if settings.database_url:
            # 确保使用 aiosqlite
            db_url = settings.database_url.replace("sqlite://", "sqlite+aiosqlite://")
            # 应用程序与数据库之间的底层物理连接管理器
            # 它负责建立和维护到底层数据库文件的连接
            # 它将 Python 的指令翻译成数据库能听懂的 SQL 语言
            # 它包含了一个连接池
            self.engine = create_async_engine(
                db_url,
                echo=settings.debug,
                connect_args={"check_same_thread": False}
            )
            
            # 制造 Session 的工厂
            # 它是你操作数据库的“工作区”
            # 它管理“事务”
            # 它是临时的。Engine 是全局唯一的（单例），一直存在；但 Session 是“用完即弃”的
            # 通常一个 HTTP 请求进来，创建一个 Session，处理完请求，关闭 Session
            self.session_factory = sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
        
        # 初始化 Qdrant (embedded mode)
        if settings.qdrant_path:
            self.qdrant_client = QdrantClient(path=settings.qdrant_path)
            
            # 创建 collection（如果不存在）
            try:
                self.qdrant_client.get_collection(settings.qdrant_collection_name)
            except Exception:
                # 向量数据库客户端
                self.qdrant_client.create_collection(
                    collection_name=settings.qdrant_collection_name,
                    vectors_config=VectorParams(
                        size=settings.vector_size,
                        distance=Distance.COSINE
                    )
                )
    
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """获取数据库 session"""
        if not self.session_factory:
            raise RuntimeError("Database not initialized")

        # 虽然 session_factory 是一个对象（Object），但在 Python 中，对象如果实现了 __call__ 方法，就可以像函数一样被调用
        # 产生一个新的session
        async with self.session_factory() as session:
            yield session
    
    def get_qdrant(self) -> QdrantClient:
        """获取 Qdrant 客户端"""
        if not self.qdrant_client:
            raise RuntimeError("Qdrant not initialized")
        return self.qdrant_client
    
    async def close(self):
        """关闭所有连接"""
        if self.engine:
            await self.engine.dispose()
        if self.qdrant_client:
            self.qdrant_client.close()


# 便捷函数
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency - 获取数据库 session"""
    db_manager = await DatabaseManager.get_instance()
    async for session in db_manager.get_session():
        yield session


def get_qdrant() -> QdrantClient:
    """FastAPI dependency - 获取 Qdrant 客户端"""
    # 注意：这是同步函数，但 QdrantClient 在初始化后可以安全使用
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # 如果已经有事件循环，直接使用缓存的实例
        db_manager = DatabaseManager._instance
        if db_manager is None:
            raise RuntimeError("Database not initialized")
        return db_manager.get_qdrant()
    else:
        raise RuntimeError("No running event loop")
