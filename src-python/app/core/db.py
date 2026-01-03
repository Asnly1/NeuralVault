"""
Qdrant 单例连接池
"""
import asyncio
from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings, DENSE_MODEL_DIMENSIONS


class DatabaseManager:
    """数据库管理器 - 单例模式"""
    
    _instance: Optional['DatabaseManager'] = None
    _lock = asyncio.Lock()
    
    def __init__(self):
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
        # 初始化 Qdrant (embedded mode)
        if settings.qdrant_path:
            from qdrant_client.models import SparseVectorParams
            
            self.qdrant_client = QdrantClient(path=settings.qdrant_path)
            
            # 获取 Dense 向量维度
            dense_size = DENSE_MODEL_DIMENSIONS.get(
                settings.dense_embedding_model, 512
            )
            
            # 创建 collection（如果不存在）- 使用 Named Vectors 支持混合检索
            try:
                self.qdrant_client.get_collection(settings.qdrant_collection_name)
            except Exception:
                # 向量数据库客户端
                self.qdrant_client.create_collection(
                    collection_name=settings.qdrant_collection_name,
                    vectors_config={
                        "dense": VectorParams(
                            size=dense_size,
                            distance=Distance.COSINE
                        )
                    },
                    sparse_vectors_config={
                        "sparse": SparseVectorParams()
                    }
                )
    
    def get_qdrant(self) -> QdrantClient:
        """获取 Qdrant 客户端"""
        if not self.qdrant_client:
            raise RuntimeError("Qdrant not initialized")
        return self.qdrant_client
    
    async def close(self):
        """关闭所有连接"""
        if self.qdrant_client:
            self.qdrant_client.close()
