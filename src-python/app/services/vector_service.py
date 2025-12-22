"""
Chunking & Embedding -> Qdrant
"""
from typing import List, Dict, Any
import uuid
from datetime import datetime

from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document, TextNode
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

from app.core.config import settings
from app.models.sql_models import ContextChunk


class VectorService:
    """向量化服务"""
    
    def __init__(self):
        self.embedding_model = None
        self.splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap
        )
    
    def _get_embedding_model(self) -> TextEmbedding:
        """获取 embedding 模型（懒加载）"""
        if self.embedding_model is None:
            self.embedding_model = TextEmbedding(
                model_name=settings.embedding_model
            )
        return self.embedding_model
    
    async def chunk_text(self, text: str, resource_id: int) -> List[ContextChunk]:
        """
        将文本切分成 chunks
        返回 ContextChunk 对象列表
        """
        # 使用 LlamaIndex 的 SentenceSplitter
        doc = Document(text=text)
        nodes = self.splitter.get_nodes_from_documents([doc])
        
        chunks = []
        for idx, node in enumerate(nodes):
            chunk = ContextChunk(
                id=str(uuid.uuid4()),
                resource_id=resource_id,
                chunk_index=idx,
                content=node.text,
                token_count=len(node.text.split()),  # 简单估算
                metadata=None,
                created_at=datetime.utcnow()
            )
            chunks.append(chunk)
        
        return chunks
    
    async def embed_chunks(
        self,
        chunks: List[ContextChunk],
        qdrant_client: QdrantClient
    ) -> None:
        """
        将 chunks 进行 embedding 并存入 Qdrant
        """
        if not chunks:
            return
        
        # 提取文本
        texts = [chunk.content for chunk in chunks]
        
        # 生成 embeddings
        embedding_model = self._get_embedding_model()
        embeddings = list(embedding_model.embed(texts))
        
        # 构造 Qdrant points
        points = []
        for chunk, embedding in zip(chunks, embeddings):
            point = PointStruct(
                id=chunk.id,
                vector=embedding.tolist(),
                payload={
                    "resource_id": chunk.resource_id,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "token_count": chunk.token_count
                }
            )
            points.append(point)
        
        # 批量插入 Qdrant
        qdrant_client.upsert(
            collection_name=settings.qdrant_collection_name,
            points=points
        )
    
    async def search_similar(
        self,
        query: str,
        qdrant_client: QdrantClient,
        top_k: int = 10,
        resource_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        语义检索
        """
        # 生成查询向量
        embedding_model = self._get_embedding_model()
        query_vector = list(embedding_model.embed([query]))[0].tolist()
        
        # 构造过滤器
        query_filter = None
        if resource_id:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="resource_id",
                        match=MatchValue(value=resource_id)
                    )
                ]
            )
        
        # 执行检索
        results = qdrant_client.search(
            collection_name=settings.qdrant_collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter
        )
        
        return [
            {
                "chunk_id": hit.id,
                "score": hit.score,
                "payload": hit.payload
            }
            for hit in results
        ]


# 全局实例
vector_service = VectorService()
