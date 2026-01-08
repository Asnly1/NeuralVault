# Rust 后端实现文档（Node/Edge + Rust 解析 + AI Pipeline）

## 总览

- Rust 负责 SQLite、Node/Edge、文件解析与 AI Pipeline 调度。
- Python Sidecar 无状态：摘要、Embedding、主题分类、Qdrant 写入。
- 统一数据模型：`nodes` + `edges`，覆盖 topic/task/resource。

---

## 目录结构（关键）

```
src-tauri/
├── src/
│   ├── lib.rs               # 应用组装与启动
│   ├── app_state.rs         # 全局状态
│   ├── sidecar.rs           # Python Sidecar
│   ├── services/
│   │   ├── ai_config.rs     # API Key 配置
│   │   └── ai_pipeline.rs   # Rust AI 队列与管线
│   ├── db/
│   │   ├── pool.rs          # SQLx 连接池
│   │   ├── types.rs         # 节点/边/枚举/结构体
│   │   ├── nodes.rs         # Node CRUD
│   │   ├── edges.rs         # Edge CRUD
│   │   └── chat.rs          # Chat 相关
│   └── commands/
│       ├── resources.rs     # 资源捕获/解析
│       ├── tasks.rs         # 任务节点
│       ├── topics.rs        # 主题节点
│       ├── edges.rs         # 关系连接
│       ├── chat.rs          # 会话/消息/绑定
│       └── ai_config.rs     # AI 配置与聊天
└── migrations/
    └── 20241006120000_init.sql
```

---

## 启动流程（`lib.rs`）

1. 初始化应用数据目录与 SQLite 连接池。
2. 初始化 `AIConfigService`（加密存储 API Key）。
3. 启动 Python Sidecar，并在后台等待健康检查结果。
4. 初始化 `AiPipeline` 队列并写入 `AppState`。
5. 注册 Tauri 命令与窗口事件。

关键事件：
- `python-status`：Sidecar ready / error。

---

## AppState

```rust
pub struct AppState {
    pub db: DbPool,
    pub python: Arc<PythonSidecar>,
    pub ai_config: Arc<Mutex<AIConfigService>>,
    pub ai_pipeline: Arc<AiPipeline>,
}
```

---

## Python Sidecar（`sidecar.rs`）

- 启动命令：`uv run python -m app.main --port <port> --qdrant-path <path>`
- 动态分配端口，`get_base_url()` 提供给 Rust 请求。
- `check_health()` / `wait_for_health()` 进行健康检查。
- 主窗口销毁时调用 `shutdown()` 关闭进程。

不再使用 `/ingest/stream` 进度流。

---

## 资源捕获与解析（`commands/resources.rs`）

### capture_resource 流程

1. 复制文件到 `assets/`（如有 file）。
2. 计算 `file_hash`。
3. 生成 title（文件名或文本前 10 字）。
4. 合并 `source_meta`（window_title/process_name/captured_at）。
5. Rust 解析内容：
   - 文本：直接读取。
   - 图片：OCR。
   - PDF：文本优先，失败后 PDFium + OCR。
6. 写入 `nodes.file_content` / `nodes.file_hash`。
7. 触发 `parse-progress` 事件。
8. 内容存在则入队 AI Pipeline。

### update_resource_content_command

- 更新 `file_content` + `file_hash`。
- 重新入队 AI Pipeline。

---

## AI Pipeline（`services/ai_pipeline.rs`）

- 内存队列（`mpsc`）+ inflight 去重。
- 只处理 `node_type = resource` 的节点。

### 处理步骤

1. `sync_status = pending`，`processing_stage = chunking`。
2. 调用 `/agent/summary` 更新 `nodes.summary`。
3. `processing_stage = embedding`。
4. 调用 `/agent/embedding` 两次：
   - `summary`：不切分（chunk=false）。
   - `content`：按 SentenceSplitter 切分（chunk=true）。
   - 先按 `embedding_type` 清理旧 `context_chunks`。
   - 写入新的 `context_chunks`（含 `embedding_type`）。
5. `sync_status = synced`，`processing_stage = done`。
6. 调用 `/agent/classify`：
   - 需要时创建 Topic 节点。
   - 插入 `contains` 边，写入 `confidence_score`。

### 错误处理

- 失败时写入 `last_error`，`sync_status = error`，`processing_stage = done`。

---

## 数据模型（SQLite）

### nodes
- `node_type`: topic / task / resource
- `title` 必填；资源默认文件名或前 10 字。
- `review_status`：仅资源可为 `unreviewed/reviewed/rejected`，其余强制 `reviewed`。

### edges
- `relation_type`: contains / related_to
- `related_to` 存单边，规范化 `source_node_id < target_node_id`。

### context_chunks
- `node_id` + `embedding_type`（summary/content）。
- 每个 chunk 记录 `qdrant_uuid`、`embedding_hash`、`embedding_model` 等。

### chat_sessions / session_bindings
- `binding_type`: primary / implicit（持久化）。

---

## Tauri Commands（概览）

- `resources.rs`：捕获、更新内容/标题/摘要、删除资源。
- `tasks.rs`：创建任务与状态更新。
- `topics.rs`：创建 topic、更新、收藏、关联资源/任务。
- `edges.rs`：通用节点连接（`related_to` 自动规范化）。
- `chat.rs`：会话、消息、附件、绑定。
- `ai_config.rs`：API Key 管理与 chat 调用。

---

## 事件

- `parse-progress`：文件解析/OCR 进度。
- `python-status`：Python Sidecar 启动状态。

---

## 说明

- Rust 写入 SQLite；Python 仅写入 Qdrant。
- AI Pipeline 依赖默认 provider/model 已配置且启用。
- 目前队列为内存队列，应用重启会清空。
