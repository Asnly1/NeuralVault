# Python 后端实现文档

## 运行约束

> **建议使用单进程模式 (workers=1)**
>
> Qdrant 采用 embedded mode，且 Embedding 模型预热成本较高，多进程会重复加载并可能带来并发风险。

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
│   │   ├── chat.py            # /chat/completions
│   │   ├── search.py          # 预留: 搜索接口
│   │   ├── agent.py           # 摘要/Embedding/主题分类接口
│   │   └── example.py         # SDK/Provider 示例 (未注册路由)
│   ├── schemas.py             # API DTO + 枚举
│   ├── services/
│   │   ├── vector_service.py  # 切分 + 向量化 + Qdrant
│   │   ├── llm_service.py     # LLM Provider 路由 + 流式封装
│   │   └── agent_service.py   # 摘要/主题分类
```

---

## 已实现端点

### /agent

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/agent/summary` | 生成摘要（content + user_note -> summary） |
| POST | `/agent/embedding` | 生成并写入向量（summary/content） |
| POST | `/agent/embedding/delete` | 删除 Node 的向量 |
| POST | `/agent/classify` | 主题分类（候选主题 + 新摘要） |

### /chat

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/completions` | 调用 LLM 生成回复 (支持流式) |

### /providers

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/providers/{provider}` | Rust 同步 API Key/base_url |
| DELETE | `/providers/{provider}` | Rust 删除 API Key |

### /search

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/search/hybrid` | 混合语义检索（dense + sparse 向量，RRF 融合） |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/shutdown` | 优雅关闭 |

---

## 摘要 / Embedding / 主题分类

### /agent/summary

输入：

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "content": "资源内容...",
  "user_note": "用户备注（可选）",
  "max_length": 100
}
```

输出：

```json
{ "summary": "不超过 100 字的摘要" }
```

### /agent/embedding

输入：

```json
{
  "node_id": 1,
  "text": "需要向量化的文本",
  "embedding_type": "content",
  "replace": true,
  "chunk": true
}
```

- `embedding_type`: `summary` | `content`
- `content` 会使用 SentenceSplitter 进行切分；`summary` 作为单段写入。
- Payload 会写入 `type` 字段区分 summary/content。

输出（截断示例）：

```json
{
  "node_id": 1,
  "embedding_type": "content",
  "embedding_model": "BAAI/bge-small-zh-v1.5",
  "chunks": [
    {
      "chunk_text": "...",
      "chunk_index": 0,
      "qdrant_uuid": "...",
      "embedding_hash": "...",
      "token_count": 42
    }
  ]
}
```

### /agent/embedding/delete

输入：

```json
{ "node_id": 1, "embedding_type": "summary" }
```

### /agent/classify

输入：

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "resource_summary": "新资源摘要...",
  "candidates": [
    { "title": "Rust", "summary": "..." },
    { "title": "React", "summary": "..." }
  ]
}
```

输出：

```json
{ "topic_name": "Rust", "confidence": 0.86 }
```

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

- 文件解析已移到 Rust，Python 不再解析文件。
- Python 仅对传入文本进行切分与向量化。

Chunking:

- 使用 LlamaIndex `SentenceSplitter`，`chunk_size=512`，`chunk_overlap=50`。
- 如果文本中存在 `[Page N]` 标记，将用于提取页码。

---

## Embedding & Qdrant

| 类型 | 模型 | 维度 |
|------|------|------|
| Dense | `BAAI/bge-small-zh-v1.5` | 512 |
| Dense | `BAAI/bge-large-en-v1.5` | 1024 |
| Sparse | `Qdrant/bm42-all-minilm-l6-v2-attentions` | - |

- 使用 Qdrant embedded 模式 (`qdrant_path`)，collection 使用 named vectors: `dense` + `sparse`。
- 更新资源时先删除旧向量，再 upsert 新向量。
- Qdrant payload 包含 `node_id`, `type`(summary/content), `chunk_index`, `text`, `token_count`。

---

## 数据写入规则

| 目标 | 写入方 |
|------|--------|
| Qdrant vectors | Python |
| `resources`/`context_chunks` 等 SQLite 表 | Rust |
| 进度与结果 | 由 Rust 内部管线处理并发事件 |

---

## 搜索接口

### /search/hybrid

混合语义检索，使用 Qdrant 的 dense + sparse 向量进行 RRF（Reciprocal Rank Fusion）融合检索。

输入：

```json
{
  "query": "搜索关键词",
  "node_ids": [1, 2, 3],
  "embedding_type": "content",
  "limit": 20
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 搜索文本 |
| `node_ids` | int[] | ❌ | 限定搜索范围（Local scope），为空时搜索全部 |
| `embedding_type` | string | ❌ | `summary` \| `content`，默认 `content` |
| `limit` | int | ❌ | 返回结果数量，默认 20 |

输出：

```json
{
  "results": [
    {
      "node_id": 1,
      "chunk_index": 0,
      "chunk_text": "匹配的文本片段...",
      "score": 0.85,
    }
  ]
}
```

实现细节：

- 使用 Qdrant Prefetch 机制，分别检索 dense 和 sparse 向量
- 通过 RRF 融合两路结果，得到最终排序
- `node_ids` 非空时，通过 Filter 限定搜索范围

---

## 生命周期

**启动**: Qdrant 初始化 -> VectorService -> 心跳监控
Python 仅提供无状态接口，不维护本地任务队列。

**关闭**: 停止心跳 -> 关闭 Qdrant

> 心跳监控通过 stdin 判断父进程是否退出，若关闭则触发 SIGINT 优雅退出。
