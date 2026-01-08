# NeuralVault 重构计划（Node/Edge + Rust 解析）

本计划以 `docs/overview.md` 为目标功能基线，并采用 `new_database.sql`
的 Node/Edge 方案，含“文件解析移到 Rust”的整体改造路径。

## 范围与假设
- 不需要数据迁移，旧数据库已删除。
- 直接改写 `src-tauri/migrations/20241006120000_init.sql`。
- 目标平台：macOS + Windows。
- 前端：React + TypeScript。
- 后端：Tauri (Rust) + FastAPI (Python) 作为无状态 AI 服务。

## 已确认决策
- `node_type` 仅包含：topic / task / resource。
- `nodes.title` 必填：
  - 文本资源默认前 10 字作为 title，后续可改。
  - 文件资源默认文件名。
- Topic 名称唯一（仅对 `node_type='topic'` 且未删除生效）。
- `resource_subtype` 允许 `other`。
- `edges.related_to` 单边存储，规范化 `source_id < target_id`。
- `review_status` 仅用于资源，非资源默认 `reviewed`。
- `session_bindings.binding_type` 需要持久化（区分用户/AI）。
- 临时 Session -> Persistent：
  - 将附件转为 Resource 节点；
  - `session_type` 切为 `persistent`。
- Summary 与 Content 向量分开存储。
- `source_meta` 需要 `window_title`、`process_name`（TEXT）、`captured_at`（DATETIME）。
- `@todo` / `@time` 解析规则按示例即可。

## Phase 1：数据库 Schema（仅 init.sql）
1. 用 new_database.sql 结构替换 `src-tauri/migrations/20241006120000_init.sql`：
   - `nodes`、`edges`、`context_chunks`、`chat_sessions`、`session_bindings`、
     `chat_messages`、`message_attachments`、`message_citations`、`users`。
2. 增加 CHECK 约束：
   - `node_type`、`task_status`、`priority`、`resource_subtype`、`review_status`、
     `relation_type`、`session_type`、`binding_type`。
   - 非资源节点强制 `review_status='reviewed'`。
   - `relation_type='related_to'` 强制 `source_node_id < target_node_id`。
3. 建立索引：
   - `nodes(node_type)`、`nodes(task_status)`、`nodes(due_date)`、`nodes(title)`、
     `nodes(file_hash)`、`nodes(review_status)`。
   - `edges(source_node_id)`、`edges(target_node_id)`、`edges(relation_type)`。
   - `session_bindings(node_id)`。
4. Topic 唯一约束（部分唯一索引）：
   - `node_type='topic'` 且 `is_deleted=0`。

## Phase 2：Rust 后端重构（Nodes + 解析）
1. 数据层改造：
   - `src-tauri/src/db/types.rs` 替换为 Node/Edge 类型。
   - `src-tauri/src/db/*.rs` 改为 Node/Edge CRUD + `session_bindings`。
2. 命令/API 改造：
   - `src-tauri/src/commands/*.rs` 替换 Task/Topic/Resource 命令为 Node/Edge 命令。
   - Chat 命令改用 `session_bindings` 与 `node_id` 附件/引用。
3. 捕获与解析流水线（Rust 负责）（参考docs/thrid_party/）：
   - 文字直存，无额外处理。
   - 图片 OCR 使用 `rust-paddle-ocr`。
   - PDF 解析：`pdf_oxide` 提取文字；`pdfium-render` + OCR 处理图片。
   - 捕获时写入 `window_title` / `process_name` / `captured_at`。
   - 向前端推送解析进度事件。
4. 资源创建规则：
   - 严格执行 title 默认值规则。
   - 解析内容写入 `nodes.file_content`，备注写入 `nodes.user_note`。

## Phase 3：Python AI 微服务（无状态）
1. 移除 Python 侧解析服务。
2. 提供无状态接口：
   - Summary：`content + user_note -> summary`。
   - Embedding：summary 与 content 分开。
   - 分类：Topic 建议 + 置信度。
   - Chat：流式回复。
3. Qdrant 操作仍由 Python 执行，Rust 负责调度与落库。

## Phase 4：向量与搜索策略
1. Qdrant 写入两类向量：
   - `type=summary`
   - `type=content`
2. Payload 至少包含：`node_id`、`chunk_index`、`chunk_text`、`qdrant_uuid`、`embedding_hash`、`embedding_model`、`embedding_at`、`token_count`。
3. 搜索策略：
   - 默认语义检索（Qdrant）。
   - 精确匹配走 SQL LIKE。
4. Scope 权重：
   - Local：1.5
   - Global：1.0

## Phase 5：前端重构（Node 视角）
1. `src/types/index.ts`、`src/api/index.ts` 切换为 Node/Edge 模型。
2. HUD + Dashboard：
   - 支持 Capture/Chat 模式；
   - 临时 Session 列表与转持久化流程。
3. Workspace：
   - 左侧显示 contains nodes；
   - 右侧 Chat + “Pin to Context”。
4. Warehouse：
   - 展示所有节点 + Inbox（`review_status='unreviewed'`）。
5. Sidebar：
   - 搜索模式切换（Hybrid / LIKE）；
   - 收藏展示来自 `nodes.is_pinned`。
6. Calendar：
   - 读取 task 节点的 `due_date`。

## Phase 6：验证清单
- 文本/文件捕获 -> 资源节点创建且 title 正确。
- OCR/PDF 解析可用，`file_content`/`user_note` 写入正确。
- Summary/Content 向量在 Qdrant 中可检索，payload 正确。
- 自动分类生成 edges，并正确写入 `review_status`。
- Inbox 展示 `unreviewed`，审核后状态更新。
- 临时 Session -> 持久：附件转 Resource + session_type 更新。
- Chat 上下文使用 `session_bindings`，Scope 权重生效。
