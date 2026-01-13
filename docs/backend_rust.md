# Rust 后端实现文档（Node/Edge + Rust 解析 + AI Pipeline）

## 总览

- Rust 负责 SQLite、Node/Edge、文件解析与 AI Pipeline 调度。
- AI 逻辑内置 Rust：Gemini LLM、fastembed-rs、LanceDB（内嵌）。
- LanceDB 运行在进程内，无需单独服务或端口。
- 统一数据模型：`nodes` + `edges`，覆盖 topic/task/resource。
- dense模型选用BAAI/bge-m3量化版本和Qdrant/clip-ViT-B-32-text，image模型选用Qdrant/clip-ViT-B-32-vision
- Embedding别的资源时，只使用bge-m3量化版本；但是在Embedding Image类型时，用bge-m3embedding计算OCR出来的文本，用clip-ViT-B-32-vision计算Image的向量。
- 在每次搜索时，实时计算bge-m3的embedding和clip-ViT-B-32-text的embedding，然后进行搜索。bge-m3搜索文字，clip-ViT-B-32-text搜索图片。

---

## 目录结构（关键）

```
src-tauri/
├── src/
│   ├── lib.rs               # 应用组装与启动
│   ├── app_state.rs         # 全局状态
│   ├── error.rs             # 错误类型定义
│   ├── services/
│   │   ├── ai_config.rs     # API Key + VectorConfig 配置
│   │   ├── ai_pipeline/     # AI 队列与管线
│   │   │   ├── mod.rs       # 常量定义与导出
│   │   │   ├── queue.rs     # AiPipeline 结构体与任务队列
│   │   │   ├── processor.rs # 资源处理逻辑
│   │   │   └── classifier.rs# 主题分类逻辑
│   │   ├── parser/          # 文件解析模块
│   │   │   ├── mod.rs       # 解析入口与导出
│   │   │   ├── ocr.rs       # OCR 引擎与图片识别
│   │   │   ├── pdf.rs       # PDF 解析（文本 + OCR）
│   │   │   └── text.rs      # 文本文件解析
│   │   └── ai/              # Rust AI 服务实现
│   │       ├── llm.rs       # Gemini LLM（流式 + 结构化输出）
│   │       ├── embedding/   # Embedding 服务
│   │       │   ├── mod.rs   # 常量定义与导出
│   │       │   ├── model.rs # EmbeddingService 结构体与方法
│   │       │   └── store.rs # LanceDB 存储操作
│   │       ├── agent.rs     # Summary + Topic 分类
│   │       ├── search.rs    # LanceDB Hybrid Search
│   │       └── types.rs     # AI DTO
│   ├── db/
│   │   ├── pool.rs          # SQLx 连接池
│   │   ├── types.rs         # 节点/边/枚举/结构体
│   │   ├── nodes/           # Node 操作
│   │   │   ├── mod.rs       # NODE_FIELDS 常量与导出
│   │   │   ├── crud.rs      # 基本 CRUD 操作
│   │   │   ├── status.rs    # 状态更新操作
│   │   │   └── query.rs     # 查询操作
│   │   ├── edges.rs         # Edge CRUD
│   │   └── chat.rs          # Chat 相关
│   ├── commands/
│   │   ├── ai_config.rs     # AI 配置命令
│   │   ├── chat_stream.rs   # 聊天流式命令
│   │   ├── chat.rs          # 会话/消息/绑定
│   │   ├── clipboard.rs     # 剪贴板读取
│   │   ├── dashboard.rs     # Dashboard 数据
│   │   ├── edges.rs         # 关系连接
│   │   ├── nodes.rs         # 节点通用操作（收藏/审核）
│   │   ├── resources.rs     # 资源捕获（调用 parser 模块）
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
2. 初始化 `AIConfigService`（加密存储 API Key / VectorConfig）。
3. 初始化 `AiServices`（Embedding / LLM / Agent / Search）。
4. 初始化 `AiPipeline` 队列并写入 `AppState`。
5. 注册 Tauri 命令与窗口事件。

---

## AppState

```rust
pub struct AppState {
    pub db: DbPool,
    pub ai: Arc<AiServices>,
    pub ai_config: Arc<Mutex<AIConfigService>>,
    pub ai_pipeline: Arc<AiPipeline>,
}
```

---

## LanceDB（内嵌向量库）

- 连接路径：本地目录（如 `${app_data_dir}/lancedb`）。
- 运行方式：同进程内嵌，无需端口、无需 sidecar。
- 向量列：Arrow `FixedSizeList<Float32>`。
  - Dense 向量维度：1024
  - Image 向量维度：512
- 使用 FTS 索引（`chunk_text`）以支持 Hybrid Search（文本检索 + 向量检索）。

---

## AI 配置（`ai_config.enc`）

配置由 `AIConfigService` 加密存储，主要包含：

- `providers`: 各 LLM provider 的 `api_key` / `base_url` / `enabled`。
- `processing_provider` / `processing_model`: Pipeline 使用的默认 provider/model。
- `classification_mode`: `manual` 或 `aggressive`。
- `vector_config`（建议字段）：
  - `lancedb_path`, `lancedb_table_name`
  - `dense_embedding_model`, `image_embedding_model`
  - `dense_vector_size`, `image_vector_size`
  - `chunk_size`, `chunk_overlap`

---

## AI 服务（`services/ai/*`）

### LLM（`llm.rs`）

- Gemini REST：`streamGenerateContent`（SSE 流式）+ `generateContent`（结构化 JSON）。
- 支持文件上传（resumable upload），等待文件 `ACTIVE` 后再调用模型。
- `thinking_effort` -> Gemini `thinkingLevel`，流式时可包含 thought delta。

### Embedding（`embedding/`）

模块结构：
- `mod.rs`：常量定义（向量维度、分块参数等）与导出
- `model.rs`：`EmbeddingService` 结构体与方法（`embed_text`、`embed_image`、`embed_query`、`search_hybrid`）
- `store.rs`：LanceDB 存储操作（表创建、向量写入、搜索结果收集）

技术栈：
- `fastembed-rs`：
  - Dense: `BAAI/bge-m3`（1024）
  - Image: `Qdrant/clip-ViT-B-32-vision`（512）
- 使用 Hugging Face tokenizer（`BAAI/bge-m3`）+ `text-splitter` 做分段与 token 计数。
- LanceDB 表保存向量与元数据；不再计算 sparse embedding。
- `embedding_type` 仍区分 `summary` / `content`。

### Agent（`agent.rs`）

- Summary：非文本资源优先文件上传；上传失败时回退到文本。
- Topic 分类：使用结构化 JSON 输出（assign / create_new / restructure）。

### Search（`search.rs`）

- Hybrid Search：LanceDB FTS + dense 向量检索，`execute_hybrid` 融合。
- 若 FTS 不可用，可退化为纯向量检索。

---

## 文件解析（`services/parser/`）

模块结构：
- `mod.rs`：导出 `parse_resource_content()` 入口函数与 `ProgressCallback` 类型
- `ocr.rs`：OCR 引擎构建（`ocr_rs`）与图片识别
- `pdf.rs`：PDF 解析（文本优先，失败后 PDFium + OCR）
- `text.rs`：文本文件解析与标题生成

解析流程根据 `ResourceSubtype` 分发：
- `Text`：直接读取文件内容
- `Image`：OCR 识别
- `Pdf`：文本提取优先，失败后逐页 OCR
- `Epub`：文本提取
- `Url` / `Other`：返回空

---

## 资源捕获（`commands/resources.rs`）

### capture_resource 流程

1. 复制文件到 `assets/`（如有 file）。
2. 计算 `file_hash`。
3. 生成 title（文件名或文本前 10 字）。
4. 合并 `source_meta`（window_title/process_name/captured_at）。
5. 调用 `services::parser::parse_resource_content()` 解析内容。
6. 写入 `nodes.file_content` / `nodes.file_hash`。
7. 触发 `parse-progress` 事件。
8. 内容存在或有 file_path 则入队 AI Pipeline（文件上传优先）。

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

## AI Pipeline（`services/ai_pipeline/`）

模块结构：
- `mod.rs`：常量定义（队列大小、摘要长度、分类阈值等）与导出
- `queue.rs`：`AiPipeline` 结构体、任务入队与去重、`run_pipeline` 循环
- `processor.rs`：`process_resource_job`、`sync_embeddings_for_type`、错误处理
- `classifier.rs`：`classify_and_link_topic`、相似资源搜索、主题候选构建、主题创建与修订

核心特性：
- 内存队列（`mpsc`）+ inflight 去重。
- 只处理 `node_type = resource` 的节点。

### 处理步骤

1. `embedding_status = pending`。
2. 读取 `processing_provider` / `processing_model` / `classification_mode`。
3. Summary：
   - 基于 `content + user_note` 生成摘要。
   - 非文本资源优先文件上传；失败则回退文本。
4. `processing_stage = embedding` 后进行 embedding。
5. Embedding：
   - 清理旧 `context_chunks` + LanceDB 记录（按 `node_id` + `embedding_type`）。
   - `summary`：不切分；`content`：使用 `text-splitter` 分段。
   - 写入 LanceDB（dense 向量；image 向量按资源类型可选）并回写 `context_chunks`。
6. `embedding_status = synced`，`processing_stage = done`。
7. Topic 分类：
   - 用 Summary 做 LanceDB hybrid search（Top-10，阈值 0.7）。
   - 构建候选 Topic + 父级上下文。
   - LLM 结构化输出：assign / create_new / restructure。
   - 去重：新 Topic 创建前做标题相似性检查。
   - 插入 `contains` 边（DAG 环检测，失败则拒绝）。
   - `classification_mode` 决定 review_status（manual 全部进 Inbox；aggressive 置信度≥0.8 自动 reviewed）。
   - 置信度≥0.8 时允许修改 Topic title/summary，并写入 `node_revision_logs`。

### 错误处理

- 失败时写入 `last_embedding_error`，`embedding_status = error`，`processing_stage = done`。

---

## 数据模型（SQLite）

### db/nodes/ 模块结构

- `mod.rs`：`NODE_FIELDS` 常量（查询字段列表）与导出
- `crud.rs`：基本 CRUD 操作（`insert_node`、`get_node_by_id`、`update_node_*`、`delete_node`）
- `status.rs`：状态更新（`update_task_status`、`mark_task_done`、`update_resource_sync_status`、`insert_context_chunks`）
- `query.rs`：查询操作（`list_nodes_by_type`、`list_active_tasks`、`search_nodes_by_keyword`）

### nodes 表

| 字段 | 说明 |
|------|------|
| `node_type` | topic / task / resource |
| `title` | 必填；资源默认文件名或前 10 字 |
| `review_status` | 仅资源可为 `unreviewed/reviewed/rejected`，其余强制 `reviewed` |
| `embedding_status` | pending / synced / dirty / error |
| `embedded_hash` | 最后成功 embedding 时的内容 hash |
| `processing_hash` | 正在处理的内容 hash |
| `processing_stage` | todo / embedding / done |
| `last_embedding_error` | 最后一次错误信息 |
| `done_date` | 任务完成日期（仅 task，保持现有时间类型） |

### edges

- `relation_type`: contains / related_to
- `related_to` 存单边，规范化 `source_node_id < target_node_id`。

### context_chunks

- `node_id` + `embedding_type`（summary/content）。
- 记录 `embedding_hash`、`dense_embedding_model`、`image_embedding_model` 等。
- 保存 LanceDB 行 ID（若字段名仍为 `qdrant_uuid`，仅属历史残留）。

### node_revision_logs

- 记录 AI 自动修改的节点字段（title/summary）。
- 字段：`field_name`、`old_value`、`new_value`、`reason`、`provider/model`、`confidence_score`。

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

API Key 管理、processing provider/model 配置。

### chat_stream.rs

聊天流式命令（`send_chat_message`），处理 SSE 流式响应。

### search.rs

语义搜索与精确搜索。

---

## 搜索命令（`commands/search.rs`）

### search_semantic

语义搜索，调用 Rust LanceDB hybrid search（FTS + dense 向量）。

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

---

## 说明

- Rust 写入 SQLite 与 LanceDB。
- AI Pipeline 依赖 processing provider/model 已配置且启用。
- 目前队列为内存队列，应用重启会清空；启动后会扫描 `embedding_status=pending/dirty/error` 或 `processing_stage!=done` 且内容非空的资源并重新入队。

---

## 开发命令与 SQLx 校验

- 启动开发（前端 + Tauri）：`npm run tauri dev`
- `sqlx::query!` 依赖离线元数据，需提交 `src-tauri/.sqlx/` 到版本控制。
- 当新增/修改 SQL 时，在 `src-tauri/` 下更新元数据（按需替换数据库路径）：

```bash
DATABASE_URL="sqlite:///Users/hovsco/Library/Application Support/com.hovsco.neuralvault/neuralvault.sqlite3" \
cargo sqlx prepare -- --lib
```
