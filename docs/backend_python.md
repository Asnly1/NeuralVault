文件结构
src-python/
├── app/
│ ├── main.py # FastAPI 入口，生命周期管理
│ ├── core/ # 核心配置
│ │ ├── config.py # 环境变量，路径配置
│ │ ├── db.py # SQLite (SQLModel) & Qdrant 单例连接池
│ │ └── events.py # 启动/关闭时的钩子（如开启 WAL 模式）
│ │
│ ├── api/ # 接口层 (Routes)
│ │ ├── ingest.py # 接收 Rust 的“新文件/新任务”通知
│ │ ├── chat.py # 聊天对话接口
│ │ ├── agent.py # 不是对话的 AI 任务处理 (标签，任务拆解等)
│ │ ├── search.py # 混合检索接口
│ │ └── websocket.py # 负责向前端推送 AI 处理进度
│ │
│ ├── models/ # 数据模型 (与 database.sql 对应)
│ │ └── sql_models.py # SQLModel
│ │
│ ├── services/ # 业务逻辑层 (核心大脑)
│ │ ├── file_service.py # 文件解析 (PDF/Image/Epub) -> Text
│ │ ├── vector_service.py# Chunking & Embedding -> Qdrant
│ │ ├── llm_service.py # 封装 OpenAI/Ollama 接口
│ │ └── agent_service.py # 任务拆解、自动打标签逻辑
│ │
│ └── workers/ # 异步任务队列 (不用 Celery，太重)
│ │ ├── queue_manager.py # 基于 asyncio.Queue 的内存队列
│ │ └── processors.py # 具体的消费者逻辑 (处理 Embedding、Task Routing)
│
├── scripts/ # 数据库初始化脚本
└── pyproject.toml
└── .python-version
└── uv.lock

端点：

1. ingest.py:
   1. POST: /ingest/notify: Rust 通知 Python 有新数据写入，触发后台处理流水线。
      1. Request: { "source_type": "resource"|"task", "id": 101, "action": "created"|"updated" }
      2. /notify 必须是 Non-blocking (非阻塞) 的。Python 收到请求后，使用 BackgroundTasks 立即返回 200 OK，然后在后台进行文件解析（如果是 PDF 等需要解析的）和 Embedding。
   2. GET: /ingest/status/{resource_id} 查询某个资源的 AI 处理状态。
      1. Respone: { "status": "todo" | "chunking" | "embedding" | "done" }
2. search.py:
   1. POST: /search/hybrid: 执行混合检索。同时查询 Qdrant 和 SQLite FTS。MVP 先暂时使用 语义+FTS5 去重，不使用 RRF
      1. Request: { "query": "深度学习", "top_k": 20, "filters": { "task_id": 5, "file_type": "pdf" } }
   2. （预留）POST: /search/rerank 对检索结果进行重排序。
3. chat.py:
   1. POST: /chat/completions 发送消息并获取回复。Rust 传入 API Key，Python 调用对应 Provider 的 SDK。
      1. Request:
         ```json
         {
           "provider": "openai" | "anthropic" | "gemini" | "grok" | "deepseek" | "qwen",
           "model": "gpt-4o",
           "api_key": "sk-xxx",
           "base_url": "https://api.openai.com/v1",  // 可选，用于自定义端点
           "messages": [{"role": "user", "content": "Hello"}],
           "context_resource_ids": [1, 2]  // 可选，关联的资源 ID
         }
         ```
      2. Response:
         ```json
         {
           "content": "AI 回复内容",
           "usage": {"prompt_tokens": 10, "completion_tokens": 20}
         }
         ```
      3. Provider 路由：
         - **openai/grok/deepseek/qwen**: 使用 OpenAI SDK（兼容 API）
         - **anthropic**: 使用 Anthropic SDK
         - **gemini**: 使用 Google GenAI SDK
   2. GET: /chat/history/{session_id} 获取历史聊天记录。（预留）
   3. POST: /chat/session/new 创建一个新的会话，绑定特定的 Task 或 Resource。（预留）
      1. Request: { "task_id": 12, "title": "关于部署的讨论" }
4. agent.py:
   1. POST: /agent/decompose 任务拆解。读取 Task 标题和描述以及相关 context，生成建议的子任务列表。存到 suggested_subtasks 里面。异步展示。任务先创建成功（状态为 todo），然后 UI 上显示一个“✨ AI 正在分析...”的微动画，分析完了悄悄把建议挂在旁边，而不是阻断用户操作。
      1. Request: { "model": "gpt-4o-mini", "task_id": 1, "title": "Develop A FastAPI Web App", "description":"xxx", "context": "main.py" }
      2. Response: {
         "suggested_subtasks": [
         { "title": "设计数据库 Schema", "priority": "High" },
         { "title": "配置 FastAPI", "priority": "Medium" }
         ]
         }
   2. POST: /agent/tag 自动打标。分析 Resource 内容，建议 Tags。存到 suggested_tags 里面
      1. Request: { "model": "gpt-4o-mini", "resource_id": 1, "chunk_id_list": ["1", "2", "5"] }
5. websocket.py:
   1. GET /ws/notifications Python 后端告诉 React 前端
      1. {"resource_id": 101, "event": "decompose" | "tag" | "report", "status": "todo" | "chunking" | "embedding" | "done", "percentage": 30 }

任务队列：
Worker 启动时，先从数据库扫描：
sync_status in ('pending','dirty', 'error') AND (indexed_hash IS NULL OR indexed_hash != file_hash)
来重建队列。
通过数据库来创建队列，然后写入数据库

Python 只返回“结构化建议”（子任务数组、tag 列表等）给前端；
前端确认后，通过 Tauri 调用 Rust 的 create_task / update_task / create_resource / update_resource / link_resource 命令，由 Rust 去写 SQLite；

心跳机制：Rust 端每隔几秒向 Python 发送心跳，或者 Python 监听 stdin。一旦管道断开，Python 必须自动 sys.exit(0)。
API 优雅退出：在 Rust 的 app_handle.exit() 钩子中，显式调用 Python 的 /shutdown 接口（如果需要保存状态），然后再杀进程。
规定：

resources 的 sync_status/indexed_hash/processing_hash/last_indexed_at/processing_stage/last_error：只能 Python 写。
例外：Rust 初始化资源时可以写`sync_status = 'pending'`, `processing_stage = 'todo'`，其余时刻都是 Python 写
context_chunks：只能 Python 写。
其余都只能 Rust 写
Python 端尽量批量写入。不要解析完一个 Chunk 就写一次数据库，而是攒够一个文件的所有 Chunks 一次性事务写入
