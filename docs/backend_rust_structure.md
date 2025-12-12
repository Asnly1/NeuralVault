# 后端项目结构 (Rust + Tauri)

## 目录总览

```
src-tauri/
├── src/
│   ├── main.rs              # 应用入口
│   ├── lib.rs               # 库入口，Tauri 应用设置与初始化
│   ├── commands.rs          # Tauri 命令（前端调用的接口）
│   └── db.rs                # 数据库模型、枚举与操作函数
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

库入口，负责 Tauri 应用的完整初始化与全局状态管理。

##### 核心功能

1. **数据库初始化**

   - 在应用数据目录创建 `neuralvault.sqlite3`
   - 使用 SQLx 连接池（最大 5 个连接）
   - 运行数据库迁移（`migrations/` 目录）
   - 插入默认用户（`user_id = 1`）

2. **全局快捷键**

   - 快捷键：`Option + Space`（macOS）/ `Alt + Space`（Windows/Linux）
   - 功能：切换 HUD 窗口显示/隐藏
   - 触发时发送 `hud-focus` 事件到前端

3. **HUD 窗口管理**

   - 监听前端 `hud-blur` 事件，自动隐藏 HUD
   - 提供 `toggle_hud` 和 `hide_hud` 命令供前端调用

4. **插件初始化**

   - Shell 插件（执行系统命令）
   - Opener 插件（打开文件/链接）
   - Dialog 插件（文件选择对话框）
   - Global Shortcut 插件（全局快捷键）

5. **命令注册**
   - 注册所有可供前端调用的 Tauri 命令（见 `commands.rs`）

##### 全局状态

```rust
pub struct AppState {
    pub db: DbPool,  // SQLx 数据库连接池
}
```

通过 `State<AppState>` 在命令间共享数据库连接。

##### 数据流

```
启动 -> 初始化数据库 -> 注册快捷键 -> 监听事件 -> 启动窗口
         ↓
    SQLite 连接池
         ↓
    注入到 AppState
         ↓
    所有命令通过 State<AppState> 访问数据库
```

---

#### `db.rs`

数据库层，定义所有模型、枚举与数据访问函数。

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

| 命令                 | 参数                          | 返回值                          | 说明                                     |
| -------------------- | ----------------------------- | ------------------------------- | ---------------------------------------- |
| `capture_resource`   | `app, state, CaptureRequest`  | `Result<CaptureResponse>`       | 快速捕获文本/文件，计算 hash，存入数据库 |
| `create_task`        | `state, CreateTaskRequest`    | `Result<CreateTaskResponse>`    | 创建任务                                 |
| `get_dashboard`      | `state`                       | `Result<DashboardData>`         | 返回活跃任务 + 未分类资源                |
| `link_resource`      | `state, LinkResourceRequest`  | `Result<LinkResourceResponse>`  | 关联资源到任务                           |
| `unlink_resource`    | `state, task_id, resource_id` | `Result<LinkResourceResponse>`  | 取消关联                                 |
| `get_task_resources` | `state, task_id`              | `Result<TaskResourcesResponse>` | 获取任务关联的资源列表                   |
| `seed_demo_data`     | `state`                       | `Result<SeedResponse>`          | 生成演示数据（3 个任务 + 3 个资源）      |
| `read_clipboard`     | `app`                         | `Result<ReadClipboardResponse>` | 读取系统剪贴板（图片/文件/HTML/文本）    |
| `get_assets_path`    | `app`                         | `Result<String>`                | 获取 assets 目录的完整路径               |

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
commands.rs (业务逻辑)
  ↓
db.rs (数据访问)
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
全局快捷键触发 (lib.rs)
  ↓
切换 HUD 窗口显示
  ↓
发送 hud-focus 事件
  ↓
前端聚焦输入框
  ↓
用户输入并捕获
  ↓
调用 capture_resource
  ↓
存入数据库
  ↓
异步通知 Python
  ↓
前端发送 hud-blur 事件
  ↓
后端隐藏 HUD 窗口
```

### 文件捕获流程

```
前端选择文件/粘贴图片
  ↓
调用 capture_resource
  ↓
读取文件字节
  ↓
计算 SHA-256 hash
  ↓
复制文件到 assets/{uuid}.{ext}
  ↓
插入 resources 表（存相对路径）
  ↓
异步通知 Python (http://127.0.0.1:8000/ingest/notify)
  ↓
返回 resource_id 和 resource_uuid
```

### 资源关联流程

```
前端调用 link_resource
  ↓
插入 task_resource_link 表
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

### 7. Asset 协议配置

- **用途**：允许前端通过 `convertFileSrc` API 访问应用数据目录中的文件
- **配置位置**：`tauri.conf.json` 的 `app.security.assetProtocol`
- **作用域**：`$APPDATA/**` 表示允许访问整个应用数据目录
- **使用场景**：图片预览、PDF 预览等需要加载本地文件的功能
- **URL 格式**：`asset://localhost/<encoded_path>`（由 `convertFileSrc` 自动生成）

---

## 测试

### 单元测试

位于 `db.rs` 的 `#[cfg(test)]` 模块：

- **数据库初始化测试**：验证 WAL 模式启用
- **CRUD 测试**：测试任务和资源的插入、查询、关联操作
- **使用 tempfile**：每个测试创建临时数据库，隔离环境

运行测试：

```bash
cd src-tauri
cargo test
```

---

## 开发建议

### 1. 新增命令

1. 在 `commands.rs` 中定义新命令函数
2. 添加 `#[tauri::command]` 宏
3. 在 `lib.rs` 的 `invoke_handler` 中注册命令
4. 在前端 `api/index.ts` 中添加对应的 TypeScript 封装

### 2. 新增数据库字段

1. 在 `migrations/` 中创建新的迁移文件（格式：`YYYYMMDDHHMMSS_description.sql`）
2. 在 `db.rs` 中更新结构体定义
3. 更新相关的查询和插入函数
4. 运行测试确保迁移正确

### 3. 新增枚举类型

1. 在 `db.rs` 中定义枚举，添加 `#[sqlx(rename_all = "...")]` 和 `#[serde(rename_all = "...")]`
2. 在数据库迁移中添加 `CHECK` 约束
3. 在前端 `types/index.ts` 中同步添加类型定义

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
      ├─→ commands.rs
      │   ├─→ db.rs (数据访问)
      │   ├─→ clipboard-rs (剪贴板)
      │   ├─→ sha2 (哈希计算)
      │   ├─→ uuid (生成 UUID)
      │   └─→ reqwest (HTTP 通知)
      └─→ tauri plugins
          ├─→ global-shortcut (快捷键)
          ├─→ dialog (文件选择)
          ├─→ opener (打开文件)
          └─→ shell (执行命令)
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

---

## 参考资料

- [Tauri 官方文档](https://tauri.app/)
- [SQLx 文档](https://docs.rs/sqlx/)
- [Serde 文档](https://serde.rs/)
- [clipboard-rs 文档](https://docs.rs/clipboard-rs/)
