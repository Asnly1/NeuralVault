"""
环境变量，路径配置
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用配置
    app_name: str = "NeuralVault Python Backend"
    debug: bool = False
    
    # Qdrant 配置
    qdrant_path: str = ""  # 由 Tauri 启动时传入，embedded mode
    qdrant_collection_name: str = "neuralvault_chunks"
    
    # Embedding 配置
    # Dense 模型: BAAI/bge-small-zh-v1.5 (512) 或 BAAI/bge-large-en-v1.5 (1024)
    dense_embedding_model: str = "BAAI/bge-small-zh-v1.5"
    # Sparse 模型: Qdrant/bm42-all-minilm-l6-v2-attentions
    sparse_embedding_model: str = "Qdrant/bm42-all-minilm-l6-v2-attentions"
    
    # LLM 配置
    llm_provider: str = ""  # ollama 或 openai
    llm_model: str = "" # 由Tauri传入
    openai_api_key: str = "" # 由Tauri传入
    openai_base_url: str = "" # 由Tauri传入
    
    # 文件处理配置
    chunk_size: int = 512
    chunk_overlap: int = 50
    
    # 心跳配置
    heartbeat_interval: int = 5  # 秒
    heartbeat_timeout: int = 15  # 秒
    
    # 告诉 Pydantic：这个 Settings 类在“加载和校验配置”时要遵循哪些规则
    model_config = SettingsConfigDict(
        env_file=".env", #自动从 .env 文件加载环境变量
        env_file_encoding="utf-8",
        extra="ignore" #如果环境变量里有 Settings 里没定义的字段，直接忽略，不报错
    )


# Dense 模型 -> Vector Size 映射
DENSE_MODEL_DIMENSIONS: dict[str, int] = {
    "BAAI/bge-small-zh-v1.5": 512,
    "BAAI/bge-large-en-v1.5": 1024,
}


# 全局配置实例
settings = Settings()
