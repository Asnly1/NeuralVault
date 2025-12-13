# 后端项目结构 (Rust + Tauri)

## 目录总览

```
src-tauri/
├── src/
│   ├── main.rs              # 应用入口
│   ├── lib.rs               # 库入口，Tauri 应用设置与初始化
│   ├── app_state.rs         # 全局应用状态定义
│   ├── db/                  # 数据库模块
│   │   ├── mod.rs          # 模块导出
│   │   ├── types.rs        # 数据库类型定义（枚举、结构体）
│   │   ├── pool.rs         # 数据库连接池初始化
│   │   ├── tasks.rs        # 任务相关数据库操作
│   │   ├── resources.rs    # 资源相关数据库操作
│   │   └── tests.rs        # 数据库集成测试
│   ├── commands/            # Tauri 命令模块
│   │   ├── mod.rs          # 模块导出
│   │   ├── types.rs        # 请求/响应类型定义
│   │   ├── tasks.rs        # 任务相关命令
│   │   ├── resources.rs    # 资源捕获相关命令
│   │   ├── clipboard.rs    # 剪贴板相关命令
│   │   └── dashboard.rs    # Dashboard 相关命令
│   ├── utils/               # 工具函数模块
│   │   ├── mod.rs          # 模块导出
│   │   ├── hash.rs         # 哈希计算工具
│   │   ├── file.rs         # 文件操作工具
│   │   └── notification.rs # Python 后端通知
│   └── window/              # 窗口管理模块
│       ├── mod.rs          # 模块导出
│       └── hud.rs          # HUD 窗口管理
├── migrations/
│   └── 20241006120000_init.sql  # 数据库初始化 SQL 脚本
├── capabilities/
│   ├── default.json         # 默认权限配置
│   └── desktop.json         # 桌面平台权限配置
├── target/                  # 编译产物目录（由 Cargo 生成）
├── gen/                     # 生成的代码和 Schema
├── icons/                   # 应用图标资源
├── Cargo.toml               # 依赖配置与构建选项
├── tauri.conf.json          # Tauri 应用配置（窗口、插件等）
├── build.rs                 # 构建脚本
└── .gitignore               # Git 忽略规则
```

---

## 文件说明

### `Cargo.toml`

项目依赖配置与编译选项。

#### 主要依赖

| 依赖项                         | 版本  | 功能说明                                |
| ------------------------------ | ----- | --------------------------------------- |
| `tauri`                        | 2.0.0 | Tauri 核心框架，支持托盘图标            |
| `tauri-plugin-opener`          | 2     | 用系统默认程序打开文件/URL              |
| `tauri-plugin-shell`           | 2     | 执行 Shell 命令                         |
| `tauri-plugin-global-shortcut` | 2     | 注册全局快捷键（Option+Space 唤起 HUD） |
| `tauri-plugin-dialog`          | 2     | 文件选择对话框                          |
| `serde` / `serde_json`         | 1     | 序列化/反序列化（与前端 JSON 通信）     |
| `sqlx`                         | 0.7   | 异步 SQLite 数据库驱动（含迁移支持）    |
| `uuid`                         | 1     | 生成唯一标识符                          |
| `sha2`                         | 0.10  | SHA-256 哈希（资源去重）                |
| `reqwest`                      | 0.12  | HTTP 客户端（通知 Python 后端）         |
| `clipboard-rs`                 | 0.2   | 跨平台剪贴板访问（读取图片/文件/文本）  |

#### 编译优化

- **开发模式**：增量编译加速构建
- **发布模式**：LTO、strip、单代码生成单元，最小化二进制体积

---

### `tauri.conf.json`

Tauri 应用配置文件，定义窗口、权限、构建流程。

#### 窗口配置

| 窗口标签 | 标题          | 尺寸     | 特性                                       | 说明                       |
| -------- | ------------- | -------- | ------------------------------------------ | -------------------------- |
| `main`   | NeuralVault   | 1200x800 | 默认主窗口                                 | 主界面（看板/工作台/设置） |
| `hud`    | Quick Capture | 680x220  | 无边框、透明、置顶、默认隐藏、不显示任务栏 | 快速捕获悬浮窗             |

#### 构建配置

- **开发命令**：`npm run dev`（前端开发服务器）
- **构建命令**：`npm run build`（构建前端到 `dist/`）
- **前端目录**：`../dist`

#### 安全策略

- **CSP**：关闭（`null`），允许灵活的前端资源加载
- **Asset 协议**：启用 `assetProtocol`，作用域为 `$APPDATA/**`，允许前端通过 `convertFileSrc` 访问应用数据目录中的文件（如图片预览）

---

### `src/`

#### `main.rs`

应用程序入口，极简设计。

- **功能**：调用 `neuralvault_lib::run()` 启动应用
- **Windows 兼容**：发布模式下隐藏控制台窗口（`windows_subsystem = "windows"`）

```rust
fn main() {
    neuralvault_lib::run()
}
```

---

#### `lib.rs`

库入口，简化后只负责应用的组装和启动，具体功能委托给各个子模块。

##### 核心功能

1. **数据库初始化**

   - 调用 `db::init_pool()` 初始化数据库连接池
   - 将连接池注入到 `AppState` 并由 Tauri 管理

2. **HUD 窗口设置**

   - 调用 `window::setup_hud()` 设置全局快捷键和事件监听

3. **插件初始化**

   - Shell、Opener、Dialog、Global Shortcut 插件

4. **命令注册**
   - 注册所有可供前端调用的 Tauri 命令

##### 模块组织

- 从 `commands/` 导入所有命令函数
- 从 `window/` 导入 HUD 管理函数
- 从 `app_state` 导入 `AppState`

---

#### `app_state.rs`

全局应用状态定义，通过 Tauri 的状态管理在所有命令间共享。

```rust
use crate::db::DbPool;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,  // SQLx 数据库连接池
}
```

通过 `State<AppState>` 在命令间共享数据库连接。

---

### `db/` 模块

数据库层，按功能拆分为多个子模块，清晰组织数据库相关代码。

#### 模块结构

- **`types.rs`**: 所有数据库类型定义（枚举、结构体、类型别名）
- **`pool.rs`**: 数据库连接池初始化和配置
- **`tasks.rs`**: 任务相关的数据库操作
- **`resources.rs`**: 资源相关的数据库操作
- **`tests.rs`**: 集成测试（仅在测试时编译）
- **`mod.rs`**: 导出所有公共接口

#### `db/types.rs`

定义所有数据库相关的类型，包括枚举和结构体。

##### 类型定义

**枚举类型**（均实现 `Type`、`Serialize`、`Deserialize`）

| 枚举类型                       | 可选值                                | 说明             |
| ------------------------------ | ------------------------------------- | ---------------- |
| `TaskStatus`                   | todo/done                             | 任务状态         |
| `TaskPriority`                 | High/Medium/Low                       | 任务优先级       |
| `ResourceSyncStatus`           | pending/synced/dirty/error            | 资源同步状态     |
| `ResourceProcessingStage`      | todo/chunking/embedding/done          | 资源处理阶段     |
| `ResourceFileType`             | text/image/pdf/url/epub/other         | 资源文件类型     |
| `ResourceClassificationStatus` | unclassified/suggested/linked/ignored | 资源分类状态     |
| `VisibilityScope`              | this/subtree/global                   | 资源关联可见范围 |

**数据结构**

| 结构体                   | 功能                        | 关键字段                                         |
| ------------------------ | --------------------------- | ------------------------------------------------ |
| `TaskRecord`             | 任务表记录                  | task_id, uuid, title, status, priority, due_date |
| `NewTask<'a>`            | 插入任务的参数              | 生命周期借用，避免字符串复制                     |
| `ResourceRecord`         | 资源表记录                  | resource_id, uuid, file_hash, file_type, content |
| `NewResource<'a>`        | 插入资源的参数              | 生命周期借用                                     |
| `SourceMeta`             | 资源来源元信息（存为 JSON） | url, window_title                                |
| `LinkResourceParams<'a>` | 关联资源到任务的参数        | task_id, resource_id, visibility_scope           |

##### 核心函数

| 函数                            | 参数                         | 返回值                        | 说明                                    |
| ------------------------------- | ---------------------------- | ----------------------------- | --------------------------------------- |
| `init_pool()`                   | `db_path: impl AsRef<Path>`  | `Result<SqlitePool>`          | 初始化数据库连接池并运行迁移            |
| `insert_task()`                 | `pool, NewTask<'_>`          | `Result<i64>`                 | 插入任务并返回 `task_id`                |
| `get_task_by_id()`              | `pool, task_id`              | `Result<TaskRecord>`          | 根据 ID 查询任务                        |
| `list_active_tasks()`           | `pool`                       | `Result<Vec<TaskRecord>>`     | 查询活跃任务（todo）                    |
| `list_today_completed_tasks()`  | `pool`                       | `Result<Vec<TaskRecord>>`     | 查询今天已完成的任务（done）            |
| `soft_delete_task()`            | `pool, task_id`              | `Result<()>`                  | 软删除任务（设置 is_deleted = 1）       |
| `hard_delete_task()`            | `pool, task_id`              | `Result<()>`                  | 硬删除任务（物理删除及级联数据）        |
| `mark_task_as_done()`           | `pool, task_id`              | `Result<()>`                  | 将任务状态从 'todo' 转换为 'done'       |
| `mark_task_as_todo()`           | `pool, task_id`              | `Result<()>`                  | 将任务状态从 'done' 转换为 'todo'       |
| `update_task_priority()`        | `pool, task_id, priority`    | `Result<()>`                  | 更新任务优先级                          |
| `update_task_due_date()`        | `pool, task_id, due_date`    | `Result<()>`                  | 更新任务截止日期                        |
| `update_task_title()`           | `pool, task_id, title`       | `Result<()>`                  | 更新任务标题                            |
| `update_task_description()`     | `pool, task_id, description` | `Result<()>`                  | 更新任务描述                            |
| `list_tasks_by_date()`          | `pool, date: &str`           | `Result<Vec<TaskRecord>>`     | 查询指定日期的所有任务（根据 due_date） |
| `insert_resource()`             | `pool, NewResource<'_>`      | `Result<i64>`                 | 插入资源并返回 `resource_id`            |
| `get_resource_by_id()`          | `pool, resource_id`          | `Result<ResourceRecord>`      | 根据 ID 查询资源                        |
| `list_unclassified_resources()` | `pool`                       | `Result<Vec<ResourceRecord>>` | 查询未分类资源                          |
| `link_resource_to_task()`       | `pool, LinkResourceParams`   | `Result<()>`                  | 关联资源到任务，更新分类状态为 linked   |
| `unlink_resource_from_task()`   | `pool, task_id, resource_id` | `Result<()>`                  | 取消关联，检查是否需恢复为 unclassified |
| `list_resources_for_task()`     | `pool, task_id`              | `Result<Vec<ResourceRecord>>` | 查询任务的所有关联资源                  |

##### 数据库配置

- **模式**：WAL（Write-Ahead Logging）
- **同步**：Normal（平衡性能与安全）
- **外键**：启用（`PRAGMA foreign_keys = ON`）
- **超时**：5 秒（避免长时间阻塞）

##### 测试

包含完整的集成测试（`#[tokio::test]`）：

- 数据库初始化与 WAL 模式验证
- 任务与资源的插入、查询、关联操作

---

#### `commands.rs`

定义所有 Tauri 命令，前端通过 `invoke` 调用这些函数。

##### 请求/响应类型

| 类型                    | 用途               | 关键字段                                                 |
| ----------------------- | ------------------ | -------------------------------------------------------- |
| `CaptureRequest`        | 快速捕获请求       | content, display_name, file_path, file_type, source_meta |
| `CaptureResponse`       | 捕获响应           | resource_id, resource_uuid                               |
| `CreateTaskRequest`     | 创建任务请求       | title (必填), description, status, priority, due_date    |
| `CreateTaskResponse`    | 创建任务响应       | task                                                     |
| `DashboardData`         | 看板数据           | tasks, resources                                         |
| `LinkResourceRequest`   | 关联资源请求       | task_id, resource_id, visibility_scope, local_alias      |
| `LinkResourceResponse`  | 关联/取消关联响应  | success                                                  |
| `TaskResourcesResponse` | 任务资源列表响应   | resources                                                |
| `SeedResponse`          | 演示数据生成响应   | tasks_created, resources_created                         |
| `ClipboardContent`      | 剪贴板内容（枚举） | Image/Files/Text/Html/Empty                              |
| `ReadClipboardResponse` | 读取剪贴板响应     | content                                                  |

##### 命令列表

| 命令                              | 参数                          | 返回值                          | 说明                                     |
| --------------------------------- | ----------------------------- | ------------------------------- | ---------------------------------------- |
| `capture_resource`                | `app, state, CaptureRequest`  | `Result<CaptureResponse>`       | 快速捕获文本/文件，计算 hash，存入数据库 |
| `create_task`                     | `state, CreateTaskRequest`    | `Result<CreateTaskResponse>`    | 创建任务                                 |
| `soft_delete_task_command`        | `state, task_id`              | `Result<()>`                    | 软删除任务（设置 is_deleted = 1）        |
| `hard_delete_task_command`        | `state, task_id`              | `Result<()>`                    | 硬删除任务（物理删除及级联数据）         |
| `mark_task_as_done_command`       | `state, task_id`              | `Result<()>`                    | 将任务状态从 'todo' 转换为 'done'        |
| `mark_task_as_todo_command`       | `state, task_id`              | `Result<()>`                    | 将任务状态从 'done' 转换为 'todo'        |
| `update_task_priority_command`    | `state, task_id, priority`    | `Result<()>`                    | 更新任务优先级（用户自由选择）           |
| `update_task_due_date_command`    | `state, task_id, due_date`    | `Result<()>`                    | 更新任务截止日期                         |
| `update_task_title_command`       | `state, task_id, title`       | `Result<()>`                    | 更新任务标题                             |
| `update_task_description_command` | `state, task_id, description` | `Result<()>`                    | 更新任务描述                             |
| `get_tasks_by_date`               | `state, date`                 | `Result<Vec<TaskRecord>>`       | 获取指定日期（due_date）的所有任务  |
| `get_dashboard`                   | `state`                       | `Result<DashboardData>`         | 返回活跃任务 + 未分类资源                |
| `link_resource`                   | `state, LinkResourceRequest`  | `Result<LinkResourceResponse>`  | 关联资源到任务                           |
| `unlink_resource`                 | `state, task_id, resource_id` | `Result<LinkResourceResponse>`  | 取消关联                                 |
| `get_task_resources`              | `state, task_id`              | `Result<TaskResourcesResponse>` | 获取任务关联的资源列表                   |
| `soft_delete_resource_command`    | `state, resource_id`          | `Result<()>`                    | 软删除资源（设置 is_deleted = 1）        |
| `hard_delete_resource_command`    | `state, resource_id`          | `Result<()>`                    | 硬删除资源（物理删除数据库记录和文件）   |
| `seed_demo_data`                  | `state`                       | `Result<SeedResponse>`          | 生成演示数据（3 个任务 + 3 个资源）      |
| `read_clipboard`                  | `app`                         | `Result<ReadClipboardResponse>` | 读取系统剪贴板（图片/文件/HTML/文本）    |
| `get_assets_path`                 | `app`                         | `Result<String>`                | 获取 assets 目录的完整路径               |

##### 核心逻辑详解

###### `capture_resource`

快速捕获的核心命令，支持：

1. **文本 + 文件**：拼接字节计算 hash，文本存数据库，文件复制到 `assets/`
2. **仅文本**：存数据库，取前 20 字符作为 `display_name`
3. **仅文件**：
   - 外部文件：复制到 `assets/{uuid}.{ext}`，存相对路径
   - 剪贴板文件（`assets/` 开头）：直接使用已保存的路径

**文件管理**：

- 所有文件统一存储在 `{app_data_dir}/assets/` 目录
- 文件名格式：`{uuid}.{ext}`（UUID 确保唯一性）
- 数据库存储相对路径：`assets/xxx.png`

**哈希计算**：使用 SHA-256 对文本/文件字节计算 hash，用于去重

**异步通知 Python**：捕获成功后异步调用 `http://127.0.0.1:8000/ingest/notify`，失败不影响主流程

###### `get_tasks_by_date`

获取指定日期的所有任务，用于日历外面显示和任务列表对话框。

**查询逻辑**：

- 筛选条件：`DATE(due_date) = DATE(?)`
- 排序：按 `due_date ASC, priority DESC`（最早截止且最高优先级在前）
- 支持查询任意日期，不只限于今天

**使用场景**：

- Calendar 页面显示每天的任务
- 查看具体日期的所有任务列表
- Dashboard 页面显示今天已完成的任务（传入今天日期，前端过滤 done 状态）

###### `read_clipboard`

跨平台剪贴板读取，优先级：**文件 > 图片 > HTML > 文本**

- **文件**：返回文件路径列表
- **图片**：保存到 `assets/{uuid}.png`，返回相对路径
- **HTML**：返回 HTML 内容 + 可选的纯文本版本
- **文本**：返回纯文本内容
- **空**：返回 `ClipboardContent::Empty`

> **注意**：文件优先于图片，因为 macOS 复制文件时会同时生成预览图片

###### `seed_demo_data`

生成 3 个演示任务和 3 个演示资源，用于快速体验功能。

###### `get_assets_path`

获取 assets 目录的完整路径，用于前端将相对路径（如 `assets/xxx.png`）转换为可访问的完整路径。

- **返回值**：assets 目录的绝对路径字符串（例如：`/Users/xxx/Library/Application Support/com.hovsco.neuralvault/assets`）
- **用途**：图片预览等功能需要将数据库中的相对路径转换为完整路径，再通过 Tauri 的 `convertFileSrc` API 转换为浏览器可访问的 URL

---

### `utils/` 模块

工具函数模块，提供通用的辅助功能。

#### 模块结构

- **`hash.rs`**: SHA-256 哈希计算
- **`file.rs`**: 文件操作相关工具函数
- **`notification.rs`**: Python 后端异步通知
- **`mod.rs`**: 导出所有工具函数

#### `utils/hash.rs`

哈希计算工具。

**函数**：

- `compute_sha256(bytes: &[u8]) -> String`: 计算 SHA-256 哈希值

#### `utils/file.rs`

文件操作相关的工具函数。

**函数**：

- `parse_file_type(raw: Option<&str>) -> ResourceFileType`: 解析文件类型字符串
- `get_extension(path: &str) -> Option<String>`: 从文件路径提取扩展名
- `get_assets_dir(app: &AppHandle) -> Result<PathBuf, String>`: 获取 assets 目录路径，如果不存在则创建

#### `utils/notification.rs`

Python 后端通知。

**函数**：

- `notify_python(resource_uuid: String)`: 异步通知 Python 后端处理资源

---

### `window/` 模块

窗口管理模块，处理 HUD 窗口的显示、隐藏和快捷键。

#### 模块结构

- **`hud.rs`**: HUD 窗口管理逻辑
- **`mod.rs`**: 导出窗口管理功能

#### `window/hud.rs`

HUD 窗口管理实现。

**命令**：

- `toggle_hud()`: 切换 HUD 窗口显示/隐藏
- `hide_hud()`: 隐藏 HUD 窗口

**设置函数**：

- `setup_hud(app: &App)`: 设置 HUD 窗口的全局快捷键和事件监听
  - 注册 `Option + Space` (macOS) / `Alt + Space` (Windows/Linux) 快捷键
  - 监听 `hud-blur` 事件自动隐藏窗口
  - 发送 `hud-focus` 事件通知前端

---

### `migrations/`

#### `20241006120000_init.sql`

数据库初始化脚本，由 SQLx 自动管理迁移。

##### 表结构

| 表名                 | 说明                      | 关键字段                                                                           |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `users`              | 用户表（预留多用户）      | user_id, user_name                                                                 |
| `tasks`              | 任务表                    | task_id, uuid, title, status, priority, due_date, parent_task_id, root_task_id     |
| `resources`          | 资源表                    | resource_id, uuid, file_hash, file_type, content, file_path, classification_status |
| `task_resource_link` | 任务-资源关联表（多对多） | task_id, resource_id, visibility_scope, local_alias                                |
| `context_chunks`     | 向量化分块表              | chunk_id, resource_id, chunk_text, qdrant_uuid, embedding_hash                     |
| `chat_sessions`      | 聊天会话表                | session_id, session_type, task_id, title                                           |
| `chat_messages`      | 聊天消息表                | message_id, session_id, role, content                                              |

##### 索引

- **任务表**：`due_date`、`status`、`created_at`、`parent_task_id`、`root_task_id`
- **资源表**：`sync_status`、唯一索引 `(file_hash, user_id)` WHERE `is_deleted = 0`（防止重复上传）
- **分块表**：`qdrant_uuid`、`resource_id + chunk_index`、`embedding_hash`
- **会话表**：`task_id + created_at`

##### 外键约束

- `PRAGMA foreign_keys = ON`：启用外键约束
- 级联删除：删除任务/资源时自动删除关联记录和分块
- 软删除：`is_deleted` + `deleted_at` 字段，前端控制展示

---

### `capabilities/`

Tauri 2.0 权限配置，基于最小权限原则。

#### `default.json`

默认权限配置，应用于 `main` 和 `hud` 窗口。

**允许的权限**：

- `core:default`：核心功能（窗口管理、事件等）
- `opener:default`：打开文件/URL
- `shell:default`：执行 Shell 命令
- `global-shortcut:allow-*`：注册/注销/查询全局快捷键
- `dialog:allow-*`：文件选择对话框

#### `desktop.json`

桌面平台特定权限（macOS/Windows/Linux）。

**应用于**：`main` 窗口

**允许的权限**：

- `global-shortcut:default`：全局快捷键功能

---

### `build.rs`

Tauri 构建脚本，在编译前运行。

```rust
fn main() {
    tauri_build::build()
}
```

功能：

- 生成 Tauri 运行时所需的代码
- 处理 `tauri.conf.json` 配置
- 嵌入应用图标和元数据

---

## 数据流

```
前端 (TypeScript)
  ↓ invoke("command_name", payload)
Tauri IPC 层
  ↓
命令路由 (lib.rs)
  ↓
commands/* (业务逻辑)
  ├─→ utils/* (工具函数)
  └─→ db/* (数据访问)
       ↓
   SQLite 数据库
       ↓
返回 Result<Response, String>
  ↓
前端接收 Promise
```

### HUD 窗口工作流

```
用户按 Option+Space
  ↓
全局快捷键触发 (window/hud.rs)
  ↓
切换 HUD 窗口显示
  ↓
发送 hud-focus 事件
  ↓
前端聚焦输入框
  ↓
用户输入并捕获
  ↓
调用 capture_resource (commands/resources.rs)
  ↓
存入数据库 (db/resources.rs)
  ↓
异步通知 Python (utils/notification.rs)
  ↓
前端发送 hud-blur 事件
  ↓
后端隐藏 HUD 窗口 (window/hud.rs)
```

### 文件捕获流程

```
前端选择文件/粘贴图片
  ↓
调用 capture_resource (commands/resources.rs)
  ↓
读取文件字节 (utils/file.rs)
  ↓
计算 SHA-256 hash (utils/hash.rs)
  ↓
复制文件到 assets/{uuid}.{ext}
  ↓
插入 resources 表（存相对路径） (db/resources.rs)
  ↓
异步通知 Python (utils/notification.rs)
  ↓
返回 resource_id 和 resource_uuid
```

### 资源关联流程

```
前端调用 link_resource (commands/resources.rs)
  ↓
插入 task_resource_link 表 (db/resources.rs)
  ↓
更新 resources.classification_status = 'linked'
  ↓
返回 success: true
  ↓
前端刷新看板（资源从"未分类"消失）
```

---

## 关键设计决策

### 1. 数据库设计

- **软删除**：`is_deleted` + `deleted_at`，保留数据历史
- **级联删除**：删除任务自动删除关联资源和分块
- **唯一性约束**：`(file_hash, user_id)` 防止重复上传相同文件
- **WAL 模式**：提高并发性能，减少写阻塞

### 2. 文件管理

- **集中存储**：所有文件统一存储在 `{app_data_dir}/assets/`
- **UUID 命名**：确保文件名唯一，避免冲突
- **相对路径**：数据库存储相对路径，便于迁移和备份
- **哈希去重**：SHA-256 计算内容哈希，避免重复存储

### 3. 异步通知

- **非阻塞**：使用 `tauri::async_runtime::spawn` 异步通知 Python
- **容错性**：Python 后端失败不影响本地存储，仅记录错误

### 4. 剪贴板优先级

- **文件优先于图片**：macOS 复制文件时会同时生成预览图片，需要优先检测文件
- **多格式支持**：图片、文件、HTML、纯文本

### 5. 生命周期优化

- **借用而非拷贝**：`NewTask<'a>` 和 `NewResource<'a>` 使用生命周期参数，避免不必要的字符串分配

### 6. 错误处理

- **统一错误类型**：所有命令返回 `Result<T, String>`，便于前端处理
- **详细错误信息**：使用 `.map_err(|e| e.to_string())` 转换错误，提供可读的错误消息

### 7. 模块化设计

- **按功能分离**：db、commands、utils、window 各司其职
- **清晰的边界**：每个模块通过 mod.rs 明确导出的公共接口
- **易于维护**：新增功能时只需修改对应模块
- **代码复用**：utils 模块提供可复用的工具函数

### 8. Asset 协议配置

- **用途**：允许前端通过 `convertFileSrc` API 访问应用数据目录中的文件
- **配置位置**：`tauri.conf.json` 的 `app.security.assetProtocol`
- **作用域**：`$APPDATA/**` 表示允许访问整个应用数据目录
- **使用场景**：图片预览、PDF 预览等需要加载本地文件的功能
- **URL 格式**：`asset://localhost/<encoded_path>`（由 `convertFileSrc` 自动生成）

---

## 测试

### 集成测试

位于 `db/tests.rs` 模块：

- **数据库初始化测试**：验证 WAL 模式启用
- **CRUD 测试**：测试任务和资源的插入、查询、关联操作
- **使用 tempfile**：每个测试创建临时数据库，隔离环境

运行测试：

```bash
cd src-tauri
cargo test
```

测试覆盖：

- `db::tests::tests::init_db_runs_migrations_and_enables_wal`: 数据库初始化
- `db::tests::tests::insert_and_query_task_and_resource`: 任务和资源的完整流程

---

## 开发建议

### 1. 新增命令

1. 根据功能选择合适的模块（tasks/resources/clipboard/dashboard）
2. 在对应的 `commands/*.rs` 中定义新命令函数
3. 添加 `#[tauri::command]` 宏
4. 在 `commands/mod.rs` 中导出（如果是新文件）
5. 在 `lib.rs` 的 `invoke_handler` 中注册命令
6. 在前端 `api/index.ts` 中添加对应的 TypeScript 封装

### 2. 新增数据库操作

1. 根据操作类型选择 `db/tasks.rs` 或 `db/resources.rs`
2. 定义新的数据库操作函数
3. 在 `db/mod.rs` 中确保已导出（通过 `pub use`）
4. 在对应的命令模块中调用
5. 更新 `db/tests.rs` 添加测试用例

### 3. 新增数据库字段

1. 在 `migrations/` 中创建新的迁移文件（格式：`YYYYMMDDHHMMSS_description.sql`）
2. 在 `db/types.rs` 中更新结构体定义
3. 在 `db/tasks.rs` 或 `db/resources.rs` 中更新相关的查询和插入函数
4. 运行测试确保迁移正确

### 4. 新增枚举类型

1. 在 `db/types.rs` 中定义枚举，添加 `#[sqlx(rename_all = "...")]` 和 `#[serde(rename_all = "...")]`
2. 在数据库迁移中添加 `CHECK` 约束
3. 在前端 `types/index.ts` 中同步添加类型定义

### 5. 新增工具函数

1. 根据功能选择 `utils/` 下的合适模块或创建新模块
2. 实现工具函数
3. 在 `utils/mod.rs` 中导出
4. 在需要的命令中导入使用

### 4. 调试技巧

- **查看 SQL 日志**：设置环境变量 `RUST_LOG=sqlx=debug`
- **查看 Tauri 日志**：开发模式下查看终端输出
- **测试数据库操作**：使用 `cargo test` 运行集成测试

### 5. 性能优化

- **连接池大小**：根据并发需求调整 `max_connections`（当前为 5）
- **批量插入**：使用事务包装多个插入操作
- **索引优化**：根据查询模式添加合适的索引

### 6. 安全注意事项

- **SQL 注入**：始终使用 `bind()` 而非字符串拼接
- **路径安全**：验证文件路径，避免目录遍历攻击
- **权限最小化**：只在 `capabilities/` 中启用必要的权限

---

## 依赖关系

```
main.rs
  └─→ lib.rs
      ├─→ app_state.rs (全局状态)
      ├─→ db/ (数据库模块)
      │   ├─→ types.rs (类型定义)
      │   ├─→ pool.rs (连接池)
      │   ├─→ tasks.rs (任务操作)
      │   ├─→ resources.rs (资源操作)
      │   └─→ tests.rs (测试)
      ├─→ commands/ (命令模块)
      │   ├─→ types.rs (请求/响应类型)
      │   ├─→ tasks.rs (任务命令)
      │   ├─→ resources.rs (资源命令)
      │   ├─→ clipboard.rs (剪贴板命令)
      │   └─→ dashboard.rs (Dashboard命令)
      ├─→ utils/ (工具模块)
      │   ├─→ hash.rs (SHA-256)
      │   ├─→ file.rs (文件操作)
      │   └─→ notification.rs (Python通知)
      ├─→ window/ (窗口模块)
      │   └─→ hud.rs (HUD管理)
      └─→ tauri plugins
          ├─→ global-shortcut (快捷键)
          ├─→ dialog (文件选择)
          ├─→ opener (打开文件)
          └─→ shell (执行命令)

依赖关系：
commands/* ─→ db/*
commands/* ─→ utils/*
window/hud.rs ─→ tauri plugins
```

---

## 编译与运行

### 开发模式

```bash
cd src-tauri
cargo tauri dev
```

### 构建发布版本

```bash
cargo tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

---

## 常见问题

### Q1: 数据库文件在哪里？

**A**: 应用数据目录（由 Tauri 管理）：

- **macOS**: `~/Library/Application Support/com.hovsco.neuralvault/neuralvault.sqlite3`
- **Windows**: `C:\Users\<用户名>\AppData\Roaming\com.hovsco.neuralvault\neuralvault.sqlite3`
- **Linux**: `~/.local/share/com.hovsco.neuralvault/neuralvault.sqlite3`

### Q2: 如何查看数据库内容？

**A**: 使用 SQLite 客户端：

```bash
sqlite3 ~/Library/Application\ Support/com.hovsco.neuralvault/neuralvault.sqlite3
```

或使用 GUI 工具（DB Browser for SQLite、DBeaver 等）。

### Q3: 全局快捷键不生效怎么办？

**A**:

- **macOS**: 检查"系统偏好设置 → 安全性与隐私 → 辅助功能"中是否授权应用
- **Windows/Linux**: 确保快捷键未被其他程序占用

### Q4: 如何重置数据库？

**A**: 删除数据库文件，重启应用会自动重新初始化：

```bash
rm ~/Library/Application\ Support/com.hovsco.neuralvault/neuralvault.sqlite3
```

### Q5: Python 后端通知失败怎么办？

**A**:

- 检查 Python 后端是否运行在 `http://127.0.0.1:8000`
- 捕获失败不影响本地存储，可以稍后手动触发处理

## 参考资料

- [Tauri 官方文档](https://tauri.app/)
- [SQLx 文档](https://docs.rs/sqlx/)
- [Serde 文档](https://serde.rs/)
- [clipboard-rs 文档](https://docs.rs/clipboard-rs/)
