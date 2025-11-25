#### 1\. 核心模块：Capture & Ingest (对应 Quick Capture HUD)

- **`capture_text(content: String, source_meta: Json)`**
  - **功能**：快速保存文本到 SQL `resources` 表。
  - **逻辑**：
    1.  生成 `uuid` 和 `file_hash`。
    2.  写入 SQLite，状态设为 `sync_status = 'pending'`, `processing_stage = 'todo'`, `classification_status = 'unclassified'`
    3.  **关键步骤**：使用 Rust 的 `reqwest` 客户端，异步调用 Python 的 `POST http://localhost:8000/ingest/notify`。
    4.  返回 `resource_id` 给前端（前端显示“已保存”）。
- **`capture_screenshot()`**
  - **功能**：直接调用系统 API 截图或读取剪贴板图片。
  - **逻辑**：保存图片到本地 `./assets` 目录 -\> 写入 SQLite -\> 通知 Python。
- **`get_clipboard_content()`**
  - **功能**：读取剪贴板内容（文本/文件路径），填充到 HUD 输入框中供用户确认。

#### 2\. 核心模块：Task Management (对应 Page A & B)

Python 只负责读 Context 和生成建议，**任务的增删改查必须由 Rust 直接操作 SQLite**，以保证高性能和数据一致性。

- **`create_task(data: CreateTaskDto)`**
  - **功能**：创建新任务。
  - **逻辑**：写入 `tasks` 表。如果是用户手动创建，直接写入；如果是接受 AI 建议，则把 AI 返回的 JSON 转为 SQL 插入。
- **`create_resource(data: CreateResourceDto)`**
  - **功能**：创建新资源。
  - **逻辑**：写入 `resources` 表。
- **`get_dashboard_data(filter: TaskFilter)`**
  - **功能**：获取看板数据。
  - **逻辑**：执行 SQL 查询 `tasks` 表和 `resource`表。
  - **注意**：这里可以使用 CTE (Common Table Expressions) 递归查询构建任务树（Parent/Child），
- **`update_task_status(task_id: i32, status: String)`**
  - **功能**：更新任务状态。
- **`delete_task(task_id: i32, soft_delete: bool)`**
  - **功能**：软删除或物理删除。
- **`update_resource_status(resource_id: i32, classification_status: String)`**
  - **功能**：更新资源状态。
- **`delete_resource(resource_id: i32, soft_delete: bool)`**
  - **功能**：软删除或物理删除。
- **`classify_task(task_id: i32, tag_id: i32)`**
  - **功能**：把任务和 tag 挂钩，方便分类
- **`classify_resource(resource_id: i32, tag_id: i32)`**
  - **功能**：把资源和 tag 挂钩，方便分类

#### 3\. 核心模块：Resource & File System

- **`list_resources(limit: i32, offset: i32)`**
  - **功能**：列出资源文件。
- **`open_file(file_path: String)`**
  - **功能**：调用系统默认应用打开 PDF 或图片（对应 Page B 的执行区）。
- **`read_file_content(resource_id: i32)`**
  - **功能**：读取文本文件内容传给前端显示。

#### 4\. 核心模块：Search & AI Bridge

虽然搜索主要在 Python (Vector search)，但 **FTS5 (纯文本搜索)** 可以在 Rust 端直接做，速度更快，作为 Python 挂掉时的兜底。

- **`search_local_fts(query: String)`**
  - **功能**：查询 SQLite `search_index` 虚拟表。
  - **场景**：用户在 HUD 输入时，快速联想已有的任务名称（自动补全），不需要经过 Python。
- **`check_python_health()`**
  - **功能**：检查 Python sidecar 是否存活。如果不存活，尝试重启或报错。
