"""
Chunking & Embedding -> Qdrant
集成 LlamaIndex SentenceSplitter、FastEmbed 和 Qdrant 操作
"""
import hashlib
import uuid
from dataclasses import dataclass
from typing import Optional

from fastembed import TextEmbedding, SparseTextEmbedding
from llama_index.core.node_parser import SentenceSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, SparseVector

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("VectorService")


@dataclass
class TextChunk:
    """文本片段数据类"""
    text: str
    chunk_index: int
    page_number: Optional[int] = None
    token_count: Optional[int] = None


class VectorService:
    """向量服务 - 集成 Chunking、Embedding 和 Qdrant 操作"""
    
    _instance: Optional['VectorService'] = None
    
    def __init__(self):
        self._dense_model: Optional[TextEmbedding] = None
        self._sparse_model: Optional[SparseTextEmbedding] = None
        self._splitter: Optional[SentenceSplitter] = None
        self._initialized = False
    
    @classmethod
    def get_instance(cls) -> 'VectorService':
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def initialize(self):
        """初始化模型（在应用启动时调用）"""
        if self._initialized:
            return
        
        logger.info(f"Loading Dense model: {settings.dense_embedding_model}")
        self._dense_model = TextEmbedding(
            model_name=settings.dense_embedding_model
        )
        
        logger.info(f"Loading Sparse model: {settings.sparse_embedding_model}")
        self._sparse_model = SparseTextEmbedding(
            model_name=settings.sparse_embedding_model
        )
        
        self._splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap
        )
        
        self._initialized = True
        logger.info("Models loaded successfully")
    
    def chunk_text(self, text: str) -> list[TextChunk]:
        """
        使用 LlamaIndex SentenceSplitter 切分文本
        
        Args:
            text: 原始文本（可能包含 [Page X] 标记）
            
        Returns:
            切分后的 TextChunk 列表
        """
        import re
        
        if not self._splitter:
            raise RuntimeError("VectorService not initialized")
        
        # LlamaIndex SentenceSplitter 返回字符串列表
        chunks = self._splitter.split_text(text)
        
        # [Page X] 标记的正则表达式
        page_pattern = re.compile(r'\[Page (\d+)\]')
        
        result: list[TextChunk] = []
        for i, chunk in enumerate(chunks):
            # 尝试从 chunk 中提取页码
            page_match = page_pattern.search(chunk)
            page_number = int(page_match.group(1)) if page_match else None
            
            result.append(TextChunk(
                text=chunk,
                chunk_index=i,
                page_number=page_number,
                token_count=len(chunk.split())  # 简单的 token 计数
            ))
        
        return result
    
    def embed_dense(self, texts: list[str]) -> list[list[float]]:
        """
        生成 Dense 向量
        
        Args:
            texts: 文本列表
            
        Returns:
            Dense 向量列表
        """
        if not self._dense_model:
            raise RuntimeError("VectorService not initialized")
        
        # fastembed 返回 generator，需要转换为 list
        embeddings = list(self._dense_model.embed(texts))
        return [emb.tolist() for emb in embeddings]
    
    def embed_sparse(self, texts: list[str]) -> list[SparseVector]:
        """
        生成 Sparse 向量
        
        Args:
            texts: 文本列表
            
        Returns:
            Qdrant SparseVector 列表
        """
        if not self._sparse_model:
            raise RuntimeError("VectorService not initialized")
        
        # fastembed sparse 返回带有 indices 和 values 的对象
        embeddings = list(self._sparse_model.embed(texts))
        
        return [
            SparseVector(
                indices=emb.indices.tolist(),
                values=emb.values.tolist()
            )
            for emb in embeddings
        ]
    
    def _compute_embedding_hash(self, text: str) -> str:
        """计算文本的 hash，用于去重"""
        return hashlib.sha256(text.encode()).hexdigest()[:16]
    
    async def upsert_chunks(
        self, 
        resource_id: int, 
        chunks: list[TextChunk],
        qdrant_client: QdrantClient
    ) -> list[dict]:
        """
        将 chunks 向量化并写入 Qdrant
        
        Args:
            resource_id: 资源 ID
            chunks: TextChunk 列表
            qdrant_client: Qdrant 客户端
            
        Returns:
            包含 qdrant_uuid 和 embedding_hash 的字典列表（用于写入 SQLite）
        """
        if not chunks:
            return []
        
        # 提取所有文本
        texts = [chunk.text for chunk in chunks]
        
        # 批量生成向量
        dense_vectors = self.embed_dense(texts)
        sparse_vectors = self.embed_sparse(texts)
        
        # 构建 Qdrant Points
        points: list[PointStruct] = []
        chunk_metadata: list[dict] = []
        
        for i, chunk in enumerate(chunks):
            point_id = str(uuid.uuid4())
            embedding_hash = self._compute_embedding_hash(chunk.text)
            
            point = PointStruct(
                id=point_id,
                vector={
                    "dense": dense_vectors[i],
                    "sparse": sparse_vectors[i]
                },
                payload={
                    "resource_id": resource_id,
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "text": chunk.text,
                    "token_count": chunk.token_count
                }
            )
            points.append(point)
            
            chunk_metadata.append({
                "qdrant_uuid": point_id,
                "embedding_hash": embedding_hash,
                "chunk_index": chunk.chunk_index,
                "page_number": chunk.page_number,
                "token_count": chunk.token_count,
                "text": chunk.text
            })
        
        # 批量写入 Qdrant
        qdrant_client.upsert(
            collection_name=settings.qdrant_collection_name,
            points=points
        )
        
        return chunk_metadata
    
    async def delete_by_resource(
        self, 
        resource_id: int,
        qdrant_client: QdrantClient
    ):
        """
        删除某个资源的所有向量
        
        Args:
            resource_id: 资源 ID
            qdrant_client: Qdrant 客户端
        """
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        
        qdrant_client.delete(
            collection_name=settings.qdrant_collection_name,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="resource_id",
                        match=MatchValue(value=resource_id)
                    )
                ]
            )
        )


# 全局单例
vector_service = VectorService.get_instance()
