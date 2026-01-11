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
│   ├── error.rs             # 错误类型定义
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
│   ├── commands/
│   │   ├── ai_config.rs     # AI 配置与聊天
│   │   ├── chat.rs          # 会话/消息/绑定
│   │   ├── clipboard.rs     # 剪贴板读取
│   │   ├── dashboard.rs     # Dashboard 数据
│   │   ├── edges.rs         # 关系连接
│   │   ├── nodes.rs         # 节点通用操作（收藏/审核）
│   │   ├── python.rs        # Python 状态检查
│   │   ├── resources.rs     # 资源捕获/解析
│   │   ├── search.rs        # 语义搜索与精确搜索
│   │   ├── tasks.rs         # 任务节点
│   │   ├── topics.rs        # 主题节点
│   │   └── types.rs         # 命令共用类型定义
│   ├── utils/
│   │   ├── crypto.rs        # 加密工具
│   │   ├── file.rs          # 文件工具
│   │   └── hash.rs          # 哈希工具
│   └── window/              # 窗口管理
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

### 资源命令

| 命令 | 说明 |
|------|------|
| `capture_resource` | 捕获资源 |
| `get_all_resources` | 获取所有资源 |
| `get_resource_by_id` | 获取单个资源 |
| `update_resource_content_command` | 更新内容 + 重新入队 AI Pipeline |
| `update_resource_title_command` | 更新标题 |
| `update_resource_summary_command` | 更新摘要 |
| `soft_delete_resource_command` | 软删除 |
| `hard_delete_resource_command` | 硬删除 |

---

## AI Pipeline（`services/ai_pipeline.rs`）

- 内存队列（`mpsc`）+ inflight 去重。
- 只处理 `node_type = resource` 的节点。

### 处理步骤

1. `embedding_status = pending`，`processing_stage = embedding`。
2. 调用 `/agent/summary` 更新 `nodes.summary`。
3. 调用 `/agent/embedding` 两次：
   - `summary`：不切分（chunk=false）。
   - `content`：按 SentenceSplitter 切分（chunk=true）。
   - 先按 `embedding_type` 清理旧 `context_chunks`。
   - 写入新的 `context_chunks`（含 `embedding_type`、`dense_embedding_model`、`sparse_embedding_model`）。
4. `embedding_status = synced`，`processing_stage = done`。
5. 调用 `/agent/classify`：
   - 需要时创建 Topic 节点。
   - 插入 `contains` 边，写入 `confidence_score`。

### 错误处理

- 失败时写入 `last_error`，`embedding_status = error`，`processing_stage = done`。

---

## 数据模型（SQLite）

### nodes

| 字段 | 说明 |
|------|------|
| `node_type` | topic / task / resource |
| `title` | 必填；资源默认文件名或前 10 字 |
| `review_status` | 仅资源可为 `unreviewed/reviewed/rejected`，其余强制 `reviewed` |
| `embedding_status` | pending / synced / dirty / error |
| `embedded_hash` | 最后成功 embedding 时的内容 hash |
| `processing_hash` | 正在处理的内容 hash |
| `processing_stage` | todo / embedding / done |
| `last_error` | 最后一次错误信息 |
| `done_date` | 任务完成日期（仅 task） |

### edges

- `relation_type`: contains / related_to
- `related_to` 存单边，规范化 `source_node_id < target_node_id`。

### context_chunks

- `node_id` + `embedding_type`（summary/content）。
- 每个 chunk 记录 `qdrant_uuid`、`embedding_hash`、`dense_embedding_model`、`sparse_embedding_model` 等。

### chat_sessions / session_bindings

- `binding_type`: primary / implicit（持久化）。

---

## Tauri Commands（概览）

### resources.rs

捕获、更新内容/标题/摘要、删除资源。

### tasks.rs

| 命令 | 说明 |
|------|------|
| `create_task` | 创建任务 |
| `get_all_tasks` | 获取所有任务 |
| `get_active_tasks` | 获取活跃任务（未完成/取消） |
| `get_tasks_by_date` | 按日期获取任务 |
| `mark_task_as_done_command` | 标记完成 |
| `mark_task_as_todo_command` | 重置为待办 |
| `update_task_title_command` | 更新标题 |
| `update_task_due_date_command` | 更新截止日期 |
| `update_task_description_command` | 更新描述（user_note） |
| `update_task_summary_command` | 更新摘要 |
| `update_task_priority_command` | 更新优先级 |
| `soft_delete_task_command` | 软删除 |
| `hard_delete_task_command` | 硬删除 |

### topics.rs

创建 topic、更新标题/摘要、收藏、关联资源/任务。

### nodes.rs

| 命令 | 说明 |
|------|------|
| `list_pinned_nodes` | 获取所有收藏节点 |
| `list_unreviewed_nodes` | 获取所有待审核节点 |
| `update_node_review_status` | 更新审核状态 |
| `update_node_pinned` | 更新收藏状态 |

### clipboard.rs

| 命令 | 说明 |
|------|------|
| `read_clipboard` | 读取系统剪贴板内容（支持文件/图片/HTML/文本） |

### dashboard.rs

| 命令 | 说明 |
|------|------|
| `get_dashboard` | 获取 Dashboard 数据（活跃任务 + 所有资源） |

### edges.rs

通用节点连接（`related_to` 自动规范化）。

### chat.rs

会话、消息、附件、绑定。

### ai_config.rs

API Key 管理、processing provider/model 配置、chat 调用。

### search.rs

语义搜索与精确搜索。

---

## 搜索命令（`commands/search.rs`）

### search_semantic

语义搜索，调用 Python `/search/hybrid` 进行混合检索。

```rust
#[tauri::command]
pub async fn search_semantic(
    query: String,
    scope_node_ids: Option<Vec<i64>>,  // Local scope
    embedding_type: Option<String>,     // summary | content
    limit: Option<i32>,
) -> AppResult<Vec<SemanticSearchResult>>
```

```rust
pub struct SemanticSearchResult {
    pub node_id: i64,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub score: f64,
}
```

Scope 权重：
- `scope_node_ids` 非空（Local）：score × 1.5
- `scope_node_ids` 为空（Global）：score × 1.0

### search_keyword

精确搜索，使用 SQL LIKE 在 title、file_content、user_note 中匹配。

```rust
#[tauri::command]
pub async fn search_keyword(
    query: String,
    node_type: Option<String>,  // topic | task | resource
    limit: Option<i32>,
) -> AppResult<Vec<NodeRecord>>
```

返回完整的 `NodeRecord` 列表。

---

## 剪贴板读取（`commands/clipboard.rs`）

读取系统剪贴板内容，按优先级返回：

1. **文件**：返回文件路径列表
2. **图片**：保存到 `assets/` 并返回相对路径
3. **HTML**：返回 HTML 内容及可选的纯文本版本
4. **文本**：返回纯文本内容
5. **空**：剪贴板为空

```rust
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ClipboardContent {
    Image { file_path: String, file_name: String },
    Files { paths: Vec<String> },
    Text { content: String },
    Html { content: String, plain_text: Option<String> },
    Empty,
}
```

---

## 事件

- `parse-progress`：文件解析/OCR 进度。
- `python-status`：Python Sidecar 启动状态。

---

## 说明

- Rust 写入 SQLite；Python 仅写入 Qdrant。
- AI Pipeline 依赖 processing provider/model 已配置且启用。
- 目前队列为内存队列，应用重启会清空。
