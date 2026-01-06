# Python 后端实现文档

## 运行约束

> **必须使用单进程模式 (workers=1)**
>
> IngestionQueue、ProgressBroadcaster、VectorService 使用内存状态，多进程会导致状态不共享。

---

## 文件结构

```
src-python/
├── app/
│   ├── main.py                # FastAPI 入口，生命周期管理与路由注册
│   ├── core/
│   │   ├── config.py          # 配置与路径推导
│   │   ├── db.py              # Qdrant 连接池
│   │   ├── events.py          # 启动/关闭钩子 + 心跳监控
│   │   └── logging.py         # 日志配置
│   ├── api/
│   │   ├── ingest.py          # /ingest 端点
│   │   ├── chat.py            # /chat/completions
│   │   ├── search.py          # 预留: 搜索接口
│   │   ├── agent.py           # 预留: 任务型 AI 接口
│   │   └── example.py         # SDK/Provider 示例 (未注册路由)
│   ├── schemas.py             # API DTO + 枚举
│   ├── services/
│   │   ├── file_service.py    # 文件解析
│   │   ├── vector_service.py  # 切分 + 向量化 + Qdrant
│   │   ├── llm_service.py     # LLM Provider 路由 + 流式封装
│   │   └── agent_service.py   # 预留
│   └── workers/
│       ├── queue_manager.py   # asyncio.Queue + 进度广播
│       └── processors.py      # Ingestion Worker
```

---

## 已实现端点

### /ingest

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/ingest` | Rust 通知数据变更，立即返回，后台处理 |
| GET | `/ingest/stream` | NDJSON 进度流，Rust 长连接读取 |

### /chat

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/completions` | 调用 LLM 生成回复 (支持流式) |

### /providers

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/providers/{provider}` | Rust 同步 API Key/base_url |
| DELETE | `/providers/{provider}` | Rust 删除 API Key |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/shutdown` | 优雅关闭 |

> /search 和 /agent 已注册路由前缀，但当前没有具体实现的接口。

---

## Ingestion 流水线

```
/ingest -> IngestionQueue -> Worker
                                   |
                     Payload -> Parse -> Chunk -> Embed -> Upsert(Qdrant)
                                   |
                        NDJSON Progress/Result -> /ingest/stream (Rust)
```

- `action=deleted` 仅执行 Qdrant 删除，不做解析与切分。

### /ingest 请求

```json
{
  "resource_id": 1,
  "action": "created",
  "file_hash": "hash-xxx",
  "file_type": "pdf",
  "content": null,
  "file_path": "/abs/path/to/file.pdf"
}
```

`action` 可选: `created` | `updated` | `deleted`

### /ingest/stream 消息 (NDJSON, application/x-ndjson)

Progress:

```json
{"type":"progress","resource_id":1,"status":"chunking","percentage":30}
```

Result:

```json
{"type":"result","resource_id":1,"success":true,"chunks":[...],"embedding_model":"BAAI/bge-small-zh-v1.5","indexed_hash":"..."}
```

Error:

```json
{"type":"result","resource_id":1,"success":false,"error":"File not found: ..."}
```

> 进度与结果都通过同一条流发送；Rust 负责将结果落库。

---

## Chat 接口

### 请求格式

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "task_type": "chat",
  "thinking_effort": "low",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello", "images": ["/abs/path/img.png"], "files": ["/abs/path/doc.pdf"]},
    {"role": "assistant", "content": "Hi! How can I help?"}
  ],
  "stream": true
}
```

> API Key 由 Rust 在启动/保存/删除时同步到 Python（PUT/DELETE `/providers/{provider}`）。Python 仅内存保存，用于复用客户端。
>
> `images/files` 必须是绝对路径；Rust 负责拼接完整对话历史并传给 Python。
>
> 会话存在 `session_context_resources` 时，Rust 会在 `messages` 首部插入一条 user 消息，附带这些资源的图片/文件路径作为上下文输入。
>
> `thinking_effort` 可选，仅支持 `none` / `low` / `high`，映射为 OpenAI Responses API 的 `reasoning.effort`。

### 关键行为

- **System Prompt**: `SYSTEM_PROMPTS[task_type]` + `role=system` 消息合并后作为系统提示。
- **OpenAI**: 使用 Responses API；系统提示传 `instructions`；流式事件 `response.output_text.delta`，使用 `response.completed` 提取 usage。
- **OpenAI 兼容**（Deepseek/Qwen）: 使用 Chat Completions（文本-only TODO: 图片/文件）。
- **Gemini**: 系统提示使用 `system_instruction`，assistant 角色映射为 `model`。
- **Anthropic**: 暂时文本-only（图片/文件会报错，TODO）。
- **Grok**: 使用 xAI SDK `client.chat.create(..., input=[...], stream=True)`；系统提示使用 `developer` 角色；支持图片/文件。

> 当前前端仅开放 OpenAI，其他 Provider 仍保留实现但不在 UI 中选择。

### 流式响应 (SSE)

返回 `text/event-stream`，每条事件为：

```
data: {"type":"delta","delta":"片段内容"}

data: {"type":"done_text","done_text":"完整回复"}

data: {"type":"usage","usage":{"input_tokens":10,"output_tokens":20,"reasoning_tokens":5,"total_tokens":35}}
```

发生错误：

```
data: {"type":"error","message":"错误信息"}
```

> `done_text` 用于 Rust 端写入数据库，避免在 Rust 侧累积 delta。
>
> `usage` 通常在流末尾返回（不同 Provider 有差异），字段为 `input_tokens` / `output_tokens` / `reasoning_tokens` / `total_tokens`，其中 `total_tokens` 已包含 `reasoning_tokens`；收到 `usage` 后即可视为流结束。

---

## 文件解析与切分

- 支持 `pdf` 和 `text` 类型，`epub`/`image`/`url` 目前未实现或仅支持 content 字段。
- `file_path` 需要传入绝对路径。
- 解析文件时带有重试，避免 Rust 写入文件的竞态。

Chunking:

- 使用 LlamaIndex `SentenceSplitter`，`chunk_size=512`，`chunk_overlap=50`。
- PDF 解析会插入 `[Page N]` 标记，用于提取页码。

---

## Embedding & Qdrant

| 类型 | 模型 | 维度 |
|------|------|------|
| Dense | `BAAI/bge-small-zh-v1.5` | 512 |
| Dense | `BAAI/bge-large-en-v1.5` | 1024 |
| Sparse | `Qdrant/bm42-all-minilm-l6-v2-attentions` | - |

- 使用 Qdrant embedded 模式 (`qdrant_path`)，collection 使用 named vectors: `dense` + `sparse`。
- 更新资源时先删除旧向量，再 upsert 新向量。
- Qdrant payload 包含 `resource_id`, `chunk_index`, `page_number`, `text`, `token_count`。

---

## 数据写入规则

| 目标 | 写入方 |
|------|--------|
| Qdrant vectors | Python |
| `resources`/`context_chunks` 等 SQLite 表 | Rust |
| 进度与结果 | Python 通过 /ingest/stream 推送 |

---

## 生命周期

**启动**: Qdrant 初始化 -> VectorService -> IngestionQueue -> 心跳监控  
待处理队列由 Rust 在 Python 健康后触发重建。

**关闭**: 停止心跳 -> 停止 Worker -> 关闭 Qdrant

> 心跳监控通过 stdin 判断父进程是否退出，若关闭则触发 SIGINT 优雅退出。
