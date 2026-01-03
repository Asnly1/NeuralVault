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
│   │   ├── db.py              # SQLite (SQLModel) & Qdrant 连接池
│   │   ├── events.py          # 启动/关闭钩子 + 心跳监控
│   │   └── logging.py         # 日志配置
│   ├── api/
│   │   ├── ingest.py          # /ingest 端点
│   │   ├── chat.py            # /chat/completions
│   │   ├── search.py          # 预留: 搜索接口
│   │   ├── agent.py           # 预留: 任务型 AI 接口
│   │   └── example.py         # SDK/Provider 示例 (未注册路由)
│   ├── models/
│   │   └── sql_models.py      # SQLModel + API DTO
│   ├── services/
│   │   ├── file_service.py    # 文件解析
│   │   ├── vector_service.py  # 切分 + 向量化 + Qdrant
│   │   ├── llm_service.py     # 预留
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
| GET | `/ingest/status/{resource_id}` | 查询处理状态 (读 SQLite) |
| GET | `/ingest/stream` | NDJSON 进度流，Rust 长连接读取 |

### /chat

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/completions` | 调用 LLM 生成回复 (支持流式) |

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
                     Fetch -> Parse -> Chunk -> Embed -> Upsert(Qdrant)
                                   |
                        NDJSON Progress/Result -> /ingest/stream (Rust)
```

- `action=deleted` 仅执行 Qdrant 删除，不做解析与切分。

### /ingest 请求

```json
{ "id": 1, "action": "created" }
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
  "api_key": "sk-xxx",
  "base_url": "https://api.openai.com/v1",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello"}
  ],
  "context_resource_ids": [1, 2],
  "stream": false
}
```

> `context_resource_ids` 目前未参与实际调用逻辑，仅预留。

### 关键行为

- **OpenAI**: 使用 Responses API；system 消息合并为 `instructions`。
- **OpenAI 兼容**（Deepseek/Qwen/Grok）: 使用 Chat Completions。
- **Gemini**: system 映射为 `system_instruction`，assistant 角色映射为 `model`。
- **Anthropic**: system 单独传入 `system` 字段。

### 非流式响应

```json
{
  "content": "AI 回复内容",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}
```

### 流式响应 (SSE)

当 `stream=true` 时返回 `text/event-stream`，每条事件为：

```
data: {"type":"delta","content":"片段内容"}

data: {"type":"done","content":"完整内容"}
```

发生错误：

```
data: {"type":"error","message":"错误信息"}
```

---

## 文件解析与切分

- 支持 `pdf` 和 `text` 类型，`epub`/`image`/`url` 目前未实现或仅支持 content 字段。
- 相对路径会拼接应用数据目录 (由 `database_url` 推导)。
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

**启动**: DB 初始化 -> WAL -> VectorService -> IngestionQueue -> 重建待处理队列 -> 心跳监控

**关闭**: 停止心跳 -> 停止 Worker -> 关闭 DB

> 心跳监控通过 stdin 判断父进程是否退出，若关闭则触发 SIGINT 优雅退出。
