# 前端项目结构

## 目录总览

```
src/
├── api/
│   └── index.ts          # Tauri invoke 封装与类型校验
├── assets/               # 素材源文件（运行时从 public/assets 提供）
├── components/
│   ├── index.ts          # 统一导出
│   ├── Sidebar.tsx       # 侧边栏导航
│   ├── TaskCard.tsx      # 任务卡片
│   ├── TaskEditCard.tsx  # 任务编辑/创建
│   ├── TasksDialog.tsx   # 通用任务对话框
│   ├── ResourceCard.tsx  # 资源卡片
│   ├── NodeCard.tsx      # 通用节点卡片（支持 topic/task/resource）
│   ├── SearchBar.tsx     # 搜索栏（关键字 + 语义搜索）
│   ├── QuickCapture.tsx  # 快速捕获
│   ├── TiptapEditor.tsx  # Markdown 编辑器
│   ├── PDFViewer.tsx     # PDF 阅读/高亮
│   ├── TemporaryChatPanel.tsx # 临时聊天面板
│   ├── workspace/        # Workspace 子组件
│   │   ├── index.ts
│   │   ├── ContextPanel.tsx
│   │   ├── EditorPanel.tsx
│   │   └── ChatPanel.tsx
│   └── ui/               # shadcn/ui 组件库
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── popover.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── switch.tsx
│       ├── textarea.tsx
│       └── tooltip.tsx
├── contexts/
│   ├── AIContext.tsx
│   └── LanguageContext.tsx
├── hooks/
│   ├── useIngestProgress.ts
│   └── usePanelResize.ts
├── lib/
│   ├── utils.ts
│   └── nodeUtils.ts      # 共享节点工具（getNodeTypeIcon, getNodeTypeLabel）
├── pages/
│   ├── Dashboard.tsx
│   ├── Workspace.tsx
│   ├── Warehouse.tsx     # 节点仓库（按类型查看 + 审核收件箱）
│   ├── Calendar.tsx
│   ├── Settings.tsx
│   ├── HUD.tsx
│   └── index.ts
├── types/
│   └── index.ts
├── translations.ts
├── App.tsx
├── App.css
├── main.tsx
└── vite-env.d.ts
public/
├── assets/               # 运行时静态资源（AI Provider logo 等）
└── pdf.worker.min.mjs    # PDF.js worker
```

---

## 文件说明

### `types/index.ts`

前端的核心类型与常量定义（Zod + TypeScript）。

**核心数据类型：**
- `NodeRecord`：统一的节点数据模型，包含 `node_id`、`title`、`summary`、`node_type`（topic/task/resource）、`task_status`、`priority`、`due_date`、`resource_subtype`、`file_path`、`file_content`、`review_status`、`is_pinned` 等字段
- `EdgeRecord`：节点间的关系记录

**枚举值：**
- `nodeTypeValues`：`topic`、`task`、`resource`
- `taskStatusValues`：`todo`、`done`
- `taskPriorityValues`：`low`、`medium`、`high`
- `resourceSubtypeValues`：`text`、`image`、`pdf`、`url`、`audio`、`video`、`code`、`other`
- `reviewStatusValues`：`unreviewed`、`approved`、`rejected`
- `embeddingStatusValues`：`pending`、`synced`、`dirty`、`error`

**常量：**
- `priorityConfig`：优先级标签与颜色
- `resourceSubtypeIcons`：资源类型图标映射
- `nodeTypeIcons`：节点类型图标映射
- `navItems`：导航菜单项

**API 类型：**
- `CreateTaskRequest/Response`、`CaptureRequest/Response`、`LinkNodesRequest`、`TaskResourcesResponse`
- 剪贴板类型：`ClipboardContent`、`ReadClipboardResponse`
- 资源处理进度：`ProcessingStage`、`IngestProgress`
- AI 类型：`AIProvider`、`AI_PROVIDER_INFO`、`AIProviderStatus`、`AIConfigStatus`、`ChatMessage`、`ChatSession`、`SendChatRequest` 等

---

### `api/index.ts`

封装所有 Tauri `invoke` 调用，统一返回类型与校验。所有 API 函数返回 `NodeRecord` 或 `NodeRecord[]`。

**Dashboard：**
- `fetchDashboardData()`：返回 `{ tasks: NodeRecord[], resources: NodeRecord[] }`

**Node 通用 API：**
- `fetchPinnedNodes()`、`fetchUnreviewedNodes()`、`toggleNodePinned()`、`approveNode()`、`rejectNode()`
- `linkNodes()`、`unlinkNodes()`

**Task API：**
- `createTask()`、`softDeleteTask()`、`hardDeleteTask()`
- `markTaskAsDone()`、`markTaskAsTodo()`
- `updateTaskTitle()`、`updateTaskDescription()`、`updateTaskPriority()`、`updateTaskDueDate()`
- `fetchTasksByDate()`、`fetchAllTasks()`：返回 `NodeRecord[]`

**Resource API：**
- `quickCapture()`、`unlinkResource()`
- `fetchTaskResources()`、`fetchAllResources()`、`getResourceById()`：返回 `NodeRecord[]` 或 `NodeRecord`
- `softDeleteResource()`、`hardDeleteResource()`
- `updateResourceContent()`、`updateResourceTitle()`

**Chat Session/Message：**
- `createChatSession()`、`getChatSession()`、`listChatSessions()`、`updateChatSession()`、`deleteChatSession()`
- `setSessionBindings()`：设置会话上下文节点绑定
- `createChatMessage()`、`listChatMessages()`、`updateChatMessage()`、`deleteChatMessage()`

**其他：**
- `seedDemoData()`、`toggleHUD()`、`hideHUD()`、`readClipboard()`、`getAssetsPath()`
- AI Config：`getAIConfigStatus()`、`saveApiKey()`、`removeApiKey()`、`setDefaultModel()`、`sendChatMessage()`

> 当前前端仅展示 OpenAI Provider，其他 Provider UI 隐藏。

---

### `contexts/`

#### `AIContext.tsx`

AI 配置与聊天状态管理。

- 状态：`config`、`loading`、`error`、`configuredProviders`、`selectedModel`、`messages`、`isChatLoading`
- 方法：`saveKey()`、`removeKey()`、`saveDefaultModel()`、`sendMessage()`、`loadSessionMessages()`、`clearMessages()`、`refreshConfig()`
- 事件：监听 Tauri `chat-stream`，按 `session_id` 拼接 assistant delta
- 上下文同步：使用 `setSessionBindings()` 将上下文资源绑定到会话

#### Chat 消息端到端流程 (ChatPanel -> Rust -> Python -> Rust -> 前端)

1. 前端 `ChatPanel` 选择模型与思考强度，切换任务/资源或上下文变更时调用 `loadSessionMessages`（携带 `context_resource_ids`）加载最近会话历史 (`src/components/workspace/ChatPanel.tsx`)。
2. 发送时触发 `useAI().sendMessage`，校验 `taskId`/`resourceId` 与 `context_resource_ids` 并清空输入 (`src/contexts/AIContext.tsx`)。
3. `AIContext` 通过 `createChatSession` 确保会话存在，同时调用 `setSessionContextResources` 同步上下文，追加用户消息、设置 loading，并注册 `chat-stream` 事件监听 (`src/contexts/AIContext.tsx`, `src/api/index.ts`)。
4. 前端调用 Tauri 命令 `send_chat_message`，携带 `session_id`、`provider`/`model`、`content`、`thinking_effort` 以及附件的 `resource_id` (`src/api/index.ts`)。
5. Rust `send_chat_message` 写入本轮 `user_content` 与附件到数据库，读取 `session_context_resources` 并在消息列表首部插入一条 user 消息（含附件路径），再组装历史并构造 Python 请求 `messages` (含 `images`/`files`) (`src-tauri/src/commands/ai_config.rs`)。
6. Rust 使用 streaming client 调用 Python `/chat/completions`，Python 通过 `llm_service.stream_chat` 返回 SSE 流 (`src-python/app/api/chat.py`, `src-python/app/services/llm_service.py`)。
7. Python SSE 事件包含 `delta`/`full_text`/`usage`/`error`；Rust 逐行解析 `data: ...`，转发 `delta`/`usage`/`error` 到前端，`full_text` 仅用于写库（更新同一轮的 `assistant_content`），收到 `usage` 即视为流结束 (`src-tauri/src/commands/ai_config.rs`)。
8. 前端监听 `chat-stream`：`delta` 拼接到最后一条 assistant 消息，`usage` 更新 token 统计并停止 loading，`error` 终止本轮并提示错误，界面即时更新 (`src/contexts/AIContext.tsx`)。

#### `LanguageContext.tsx`

多语言支持，依赖 `translations.ts`。

- `language` 存储到 localStorage（key: `language`）
- `t(category, key)` 读取 `zh/en` 文案

---

### `hooks/`

#### `useIngestProgress.ts`

资源处理进度管理 Hook。

- 监听 Tauri `ingest-progress` 事件
- 输出：`progressMap`（`Map<node_id, IngestProgress>`）与 `clearProgress()`

#### `usePanelResize.ts`

面板拖拽调整 Hook。

- 支持左右方向拖拽
- 本地存储宽度状态
- 返回 `{ width, tempWidth, isResizing, onMouseDown }`

---

### `lib/`

#### `utils.ts`

通用工具函数。

- `cn`：合并 className（`clsx` + `tailwind-merge`）
- `getFileTypeFromPath`：统一推断文件类型（App/HUD 的 Quick Capture 复用）

#### `nodeUtils.ts`

共享节点工具函数。

- `getNodeTypeIcon(nodeType)`：返回节点类型对应的图标组件
- `getNodeTypeLabel(nodeType)`：返回节点类型对应的显示标签

---

### `translations.ts`

中英文文案集合，覆盖 `sidebar/settings/dashboard/workspace/common` 等分类。

---

### `components/`

#### `Sidebar.tsx`

- 可拖拽调整宽度（150–400）
- 可折叠/展开，折叠时显示悬浮展开按钮
- 菜单项来自 `navItems`，显示文案来自 `t("sidebar", key)`
- 本地持久化由 `App.tsx` 维护：`neuralvault_sidebar_collapsed`、`neuralvault_sidebar_width`

#### `TaskCard.tsx`

- 接收 `NodeRecord` 类型（`node_type === 'task'`）
- 点击方框切换任务状态（`markTaskAsDone/markTaskAsTodo`，使用 `node_id`）
- 悬浮显示编辑/删除按钮，编辑使用 `TaskEditCard`
- 逾期任务高亮，显示优先级标签与截止日期
- 字段映射：`node_id`、`task_status`、`summary`

#### `TaskEditCard.tsx`

- 统一的创建/编辑 Dialog
- 接收 `NodeRecord` 类型（可选，传入则为编辑模式）
- 仅更新变化字段（标题/描述/优先级/截止日期/状态）
- `Popover + Calendar` 选择日期，保存时格式化为 `YYYY-MM-DD 00:00:00`
- API 调用使用 `node_id`

#### `TasksDialog.tsx`

- 通用任务对话框，数据获取由 `fetchTasks()` 决定
- `fetchTasks` 返回 `NodeRecord[]`
- 使用 `TaskCard` 展示，支持软删除（`softDeleteTask`）
- 包含加载/错误/空状态

#### `ResourceCard.tsx`

- 接收 `NodeRecord` 类型（`node_type === 'resource'`）
- 点击进入 Workspace（可选）
- 下拉菜单关联到任务（`onLinkToTask`）
- 删除资源（可选）
- 支持显示 Ingest 进度（`progress`），含阶段与百分比
- 字段映射：`node_id`、`title`、`resource_subtype`

#### `NodeCard.tsx`

- 通用节点卡片，支持所有节点类型（topic/task/resource）
- 显示节点标题、类型图标、状态、优先级等元数据
- 支持固定/取消固定操作
- 支持审核操作（approve/reject）
- 使用共享工具 `getNodeTypeIcon`、`getNodeTypeLabel`

#### `SearchBar.tsx`

- 支持关键字搜索和语义搜索
- 显示搜索结果列表，包含节点类型图标
- 选择结果导航到对应节点

#### `QuickCapture.tsx`

- 支持文本 + 多文件（Tauri `open` 对话框）
- 支持剪贴板（图片/文件/HTML/文本）读取：`readClipboard()`
- `variant="hud"` 支持 Esc 关闭、失焦关闭与提示信息
- Enter 提交，Shift+Enter 换行

#### `TiptapEditor.tsx`

- Tiptap + StarterKit + Markdown
- 双向绑定：Markdown 输入/输出
- 降级支持：解析失败时回退到纯文本/HTML

#### `PDFViewer.tsx`

- `react-pdf-highlighter-extended` + `pdfjs-dist`（worker: `public/pdf.worker.min.mjs`）
- 文本高亮与区域高亮（Alt/Option）
- 高亮列表与清空操作
- 切换 PDF 时清空高亮

#### `components/workspace/`

- `ContextPanel.tsx`：上下文资源显示区（加号添加/减号移除），保留附带文本；任务模式下额外展示任务信息；使用 `NodeRecord` 类型
- `EditorPanel.tsx`：文本编辑（Tiptap）、PDF 预览、图片缩放/拖拽（`react-zoom-pan-pinch`），支持资源名称编辑与文本/文件视图切换；使用 `NodeRecord` 类型
- `ChatPanel.tsx`：AI 聊天（模型选择 + 思考强度 + 消息历史/发送），需要传入 `taskId/resourceId + contextResourceIds`（使用 `node_id`）

---

### `pages/`

#### `Dashboard.tsx`

- 状态类型：`tasks: NodeRecord[]`、`resources: NodeRecord[]`
- 任务排序：`task_status === 'done'` 置底 + 优先级权重 + 截止日期
- 任务区：`TaskCard` + `TaskEditCard`（创建）+ `TasksDialog`（今日完成）
- 资源区：仅展示 `review_status === "unreviewed"` 的资源
- 支持 Ingest 进度显示（`progressMap` -> `ResourceCard`，使用 `node_id` 索引）

#### `Workspace.tsx`

- 参数类型：`selectedTask: NodeRecord | null`、`selectedResource: NodeRecord | null`
- 双模式：任务模式 / 资源模式
- 三栏布局：`ContextPanel` / `EditorPanel` / `ChatPanel`
- 左右面板可拖拽调整（使用 `usePanelResize` Hook）
- 任务模式默认上下文为任务关联资源；资源模式默认上下文为当前资源
- 支持资源内容与名称保存：`updateResourceContent` + `updateResourceTitle`（使用 `node_id`）
- 支持 Ctrl+S / Command+S 保存

#### `Warehouse.tsx`

- 节点仓库页面，按类型查看节点（topic/task/resource）
- 审核收件箱 Tab：显示 `review_status === 'unreviewed'` 的节点
- 支持审核操作（approve/reject）和固定操作

#### `Calendar.tsx`

- 状态类型：`tasks: NodeRecord[]`
- 月历视图，按 `due_date` 聚合任务
- 点击任务切换 `task_status`（使用 `node_id` 调用 `markTaskAsDone/markTaskAsTodo`）
- 超过两条任务时用 `TasksDialog` 展示全部

#### `Settings.tsx`

- 页面简化：移除副标题与卡片说明文案，仅保留标题与字段
- 主题模式：Light / Dark / System
- 语言切换：中文 / English（`LanguageContext`）
- API Key 管理：读取 `AI_PROVIDER_INFO` 渲染卡片
- 本地模型（Ollama）开关 + Local URL（当前为 UI 状态）
- 快捷键展示（Alt + Space）

#### `HUD.tsx`

- Quick Capture HUD 窗口（`#/hud`）
- `emit("hud-blur")` 通知后端关闭
- 监听 `hud-focus` 事件用于窗口聚焦

---

### `App.tsx`

- 全局状态（均使用 `NodeRecord` 类型）：
  - `tasks: NodeRecord[]`、`allTasks: NodeRecord[]`、`resources: NodeRecord[]`
  - `selectedTask: NodeRecord | null`、`selectedResource: NodeRecord | null`
  - `currentPage`、`theme`、`pythonError`
- 初始加载与刷新：`fetchDashboardData()` + `fetchAllTasks()`
- 节点关联：`handleLinkResource` 使用 `linkNodes()` 而非废弃的 `linkResource()`
- 监听 `python-status` 事件，失败时顶部提示
- `useIngestProgress()` 获取资源处理进度（使用 `node_id` 索引）
- 主题切换：`light` / `dark` / `system`

### `main.tsx`

- 根据 hash 选择渲染：`#/hud` -> `HUDPage`，否则 `App`
- 包裹 `LanguageProvider` 与 `AIContextProvider`

### `App.css`

- Notion 风格 Light/Dark 主题变量
- Sidebar 专用色板与优先级颜色变量
- 自定义滚动条、Tiptap 编辑器样式、全局字体

---

## 数据流

```
main.tsx
  ├─ LanguageProvider + AIContextProvider
  ├─ #/hud -> HUDPage -> QuickCapture
  │        ├─ readClipboard -> Rust (read_clipboard)
  │        └─ quickCapture -> Rust (capture_resource)
  └─ App.tsx (所有状态使用 NodeRecord 类型)
       ├─ listen python-status -> 顶部错误提示
       ├─ useIngestProgress (ingest-progress event, node_id 索引)
       ├─ DashboardPage (NodeRecord[])
       │    ├─ TaskCard / TaskEditCard / TasksDialog (node_id)
       │    ├─ QuickCapture
       │    └─ ResourceCard (progressMap, node_id)
       ├─ WorkspacePage (NodeRecord | null)
       │    ├─ ContextPanel + EditorPanel + ChatPanel (NodeRecord)
       │    ├─ fetchTaskResources / updateResourceContent / updateResourceTitle
       │    └─ AI chat -> sendChatMessage (node_id)
       ├─ WarehousePage
       │    ├─ NodeCard (NodeRecord)
       │    └─ approve/reject/pin operations (node_id)
       ├─ CalendarPage (NodeRecord[])
       │    └─ markTaskAsDone/markTaskAsTodo + fetchTasksByDate (node_id)
       └─ SettingsPage
            └─ saveApiKey/removeApiKey + theme/language
```

---

## 页面对应关系

| 场景 | 组件文件 | 路由 Key / 窗口 |
| --- | --- | --- |
| Quick Capture HUD | `pages/HUD.tsx` | `#/hud` |
| Page A - 智能看板 | `pages/Dashboard.tsx` | `dashboard` |
| Page B - 任务工作台 | `pages/Workspace.tsx` | `workspace` |
| Page C - 节点仓库 | `pages/Warehouse.tsx` | `warehouse` |
| Page D - 日历视图 | `pages/Calendar.tsx` | `calendar` |
| Page E - 设置 | `pages/Settings.tsx` | `settings` |

---

## 后续维护建议

1. 新增页面时同步更新：`src/pages/index.ts`、`src/types/index.ts`（`navItems`）、`src/App.tsx`。
2. 新增文案时更新 `src/translations.ts`，并确保 `LanguageContext` 可用。
3. Local Model（Ollama）当前为前端状态，如需启用请对接后端命令。
4. AI Chat 使用 SSE 流式响应，前端通过 `chat-stream` 事件拼接 assistant 输出与 usage。
5. 新增资源类型时同步更新 `resourceSubtypeValues` 与 `EditorPanel` 的渲染逻辑。
6. 新增/替换 AI Provider 图标时确保放入 `public/assets`。
7. **关于 NodeRecord 迁移**：
   - 所有组件已完全迁移到使用 `NodeRecord` 类型
   - 废弃的 `Task`/`Resource` 类型别名已移除
   - API 调用使用 `node_id` 而非 `task_id`/`resource_id`
   - 字段映射参考：`task_status`（原 `status`）、`summary`（原 `description`）、`resource_subtype`（原 `file_type`）、`file_content`（原 `content`）、`title`（原 `display_name`）
