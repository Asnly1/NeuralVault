"""
环境变量，路径配置
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用配置
    app_name: str = "NeuralVault Python Backend"
    debug: bool = False
    
    # 数据库配置
    database_url: str = ""  # 由 Tauri 启动时传入
    
    # Qdrant 配置
    qdrant_path: str = ""  # 由 Tauri 启动时传入，embedded mode
    qdrant_collection_name: str = "neuralvault_chunks"
    vector_size: int | None = None  # 待定
    
    # LLM 配置
    llm_provider: str = ""  # ollama 或 openai
    llm_model: str = "" # 由Tauri传入
    openai_api_key: str = "" # 由Tauri传入
    openai_base_url: str = "" # 由Tauri传入
    
    # Embedding 配置
    embedding_model: str = ""  # 待定
    
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


# 全局配置实例
settings = Settings()


def get_app_data_dir() -> Path:
    """获取应用数据目录"""
    if settings.database_url:
        # 从数据库路径推导出应用数据目录
        return Path(settings.database_url).parent
    
    # 默认路径（开发环境）
    if os.name == "nt":  # Windows
        base_path = Path(os.environ.get("APPDATA", ""))
    elif os.name == "posix":
        if "darwin" in os.sys.platform:  # macOS
            base_path = Path.home() / "Library" / "Application Support"
        else:  # Linux
            base_path = Path.home() / ".local" / "share"
    else:
        base_path = Path.home()
    
    return base_path / "com.neuralvault.app"
