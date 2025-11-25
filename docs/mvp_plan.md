# MVP 落地路线图（Rust: SQLx 建库，Python: SQLModel 只连接+写入）

## 0. 原则与职责

- Schema 与迁移：由 Rust（SQLx）负责创建/迁移 SQLite，Python 不跑自动迁移，仅基于现有表做连接与写入（需和 docs/database.sql 对齐）。
- 连接方式：SQLite 开启 WAL；Rust/SQLite 池大小和超时时间一致；Python 连接复用同一 DB 文件路径。
- 写入权限：任务/资源 CRUD 主导在 Rust；Python 只写 AI 相关字段（sync_status/processing_stage/context_chunks 等），遵守 docs/python_backend.md 中的字段限定。

## 1. 阶段拆解

1. 数据层基线（Rust）
   - 用 SQLx migration 生成 docs/database.sql 中的表，提供 `init_db` CLI/启动钩子。
   - 补上 WAL/PRAGMA 设置 & 基础 DAO（插入/查询 task、resource、task_resource_link）。
2. Quick Capture（Rust）
   - 提供 HUD/Tauri 调用的极简 API/命令：输入内容 -> 计算 file_hash -> resources 插入（status 默认 pending/todo/unclassified）。
   - 写入后异步通知 Python `/ingest/notify`；错误兜底：本地提示但不阻塞写库。
3. Dashboard / Page A（前端 + Rust API）
   - Rust 暴露获取 inbox/todo/doing 任务 + 未分类 resources 的查询接口；新增任务/资源的创建接口。
   - 前端先用假数据排版，再接接口；空态/失败提示到位。
4. Retrieval / Page B（前端 + Rust/Python 协同）
   - Rust 提供 task 详情（任务基本信息 + 已关联文件）。
   - Python 提供“可能相关历史任务”简单规则接口（同标签/关键词/项目）。Rust 负责关联写入，不由 Python 直接改任务。
   - 前端展示：任务信息 + 关联文件列表 + 历史任务推荐；无数据时显示空态。
5. 联调与验收
   - E2E 流程：HUD 输入 -> SQLite 落库 -> Dashboard 显示 -> 点进任务详情 -> 看到关联与推荐。
   - 补充日志/错误提示；README/quick start 写启动步骤与示例 curl。

## 2. 每阶段输出与检查点

- 数据层基线：`sqlx migrate run` 可跑通；`init_db` 成功创建文件；DAO 单测/脚本验证插入和查询。
- Quick Capture：curl/前端提交后，resources 新增记录，状态字段正确；Python 收到 notify（可用日志或 mock 服务验证）。
- Dashboard：页面加载能看到任务列表 + 输入框 + 未分类资源；创建操作落库并刷新。
- Retrieval：任务详情接口返回关联文件；Python 推荐接口返回列表（可先固定规则/Mock），前端正常展示空态/结果。
- 联调：完整手工走通“创建 -> 看板出现 -> 进入详情 -> 推荐展示”；列出遗留问题。

## 3. 端到端数据流（MVP 版）

- Capture：HUD 输入/粘贴 -> Rust SQLx 写 resources (pending/todo/unclassified) -> Rust 异步 POST `/ingest/notify` -> Python 将资源加入待处理队列（仅写 AI 字段，不改任务）。
- Dashboard：Rust 查询 tasks/resources -> 前端渲染；用户分类/创建任务时由 Rust 直接写 SQLite。
- Retrieval：前端请求 Rust 获取任务 & 关联；并请求 Python 获取相关历史任务建议；结果合并后展示。

## 4. 工程清单

- Rust：SQLx migration + WAL 设置 + DAO；Quick Capture API/命令；Dashboard/Task 详情查询；通知 Python 的 HTTP 客户端。
- Python：SQLModel 连接（不建表）+ `/ingest/notify` handler + 简单推荐接口；后续可接 embedding/Chroma。
- 前端：Page A/B 布局、空态、错误提示；与 Rust/Python 接口对接；本地存储/状态管理最简实现。

## 5. 建议的迭代顺序

Day 1：SQLx 迁移与 init_db；Rust DAO 脚本验证插入/查询。  
Day 2：Quick Capture API + 通知 Python；日志与错误处理。  
Day 3：Dashboard 假数据布局 -> 接 Rust 查询/创建接口。  
Day 4：Retrieval API（Rust 任务详情 + Python 推荐规则）；Page B 展示。  
Day 5：端到端联调，补 README/脚本，记录 TODO。

## 6. 测试与校验

- Rust 数据层：`sqlx::query!`/`query_as!` 编译期列校验；集成测试起临时 SQLite，跑 `sqlx migrate run`，验证 WAL/PRAGMA 生效，完成 tasks/resources/links 的插入+查询。
- Quick Capture 流程：集成测试用临时 DB，调用 capture 写入，检查默认字段（pending/todo/unclassified 等）；模拟 Python 通知失败时的兜底日志/不阻塞写库。
- Dashboard/Retrieval API：造 1 任务 + 2 资源 + 关联，调用任务详情接口，只返回关联文件；Dashboard 查询返回 inbox/todo/doing 任务和未分类资源，空态正常。
- Schema parity（Python）：`scripts/check_schema_parity.py` 读取 Rust 迁移生成的 DB，用 `PRAGMA table_info` 对比 SQLModel `__table__`（字段名/类型/nullable/default）；有差异 exit 1，可挂 CI。
- 推荐执行顺序：`sqlx migrate run` -> schema parity 脚本 -> Rust 集成测试 -> 手工 E2E（HUD 输入 -> Dashboard -> 详情页）。
