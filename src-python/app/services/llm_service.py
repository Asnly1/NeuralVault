"""
封装 OpenAI/Ollama 接口
1. PUT:  /providers/{provider_name} 用于启动时存储API Key
    1. Request: { "api_key": "sk-xxx", "base_url": "https://api.openai.com/v1" }
    2. Response: {"status": "ok"}
"""

CHAT_PROMPT = "这是CHAT的Prompt, 临时占位符"