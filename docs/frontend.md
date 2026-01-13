# 前端项目结构

## 目录总览

```
src/
├── api/
│   ├── index.ts          # 统一导出
│   ├── client.ts         # Tauri invoke 封装与统一错误处理
│   ├── node.ts           # 节点通用 API
│   ├── task.ts           # 任务 API
│   ├── resource.ts       # 资源 API
│   ├── chat.ts           # 聊天会话与消息 API
│   ├── search.ts         # 搜索 API
│   ├── system.ts         # 系统 API (HUD, 剪贴板等)
│   └── topic.ts          # 主题 API
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
│       └── ...
├── contexts/
│   ├── index.ts              # 统一导出
│   ├── AIContext.tsx         # 原 AI 上下文（兼容导出）
│   ├── AIConfigContext.tsx   # AI 配置管理
│   ├── ChatSessionContext.tsx # 聊天会话管理
│   ├── ChatMessageContext.tsx # 聊天消息与流处理
│   └── LanguageContext.tsx   # 多语言支持
├── hooks/
│   ├── index.ts              # 统一导出
│   ├── useAsync.ts           # 通用异步操作 hook
│   ├── useLocalStorage.ts    # localStorage 封装
│   ├── useKeyboard.ts        # 键盘快捷键管理
│   ├── usePanelResize.ts     # 面板拖拽调整
│   ├── useIngestProgress.ts  # 资源处理进度
│   ├── useChat.ts            # 聊天功能组合 hook
│   ├── useResourceEditor.ts  # 编辑器状态管理
│   ├── useContextResources.ts # 上下文资源管理
│   ├── useClipboard.ts       # 剪贴板操作
│   ├── useFileSelection.ts   # 文件选择对话框
│   ├── useTheme.ts           # 主题管理
│   ├── useSidebar.ts         # 侧边栏状态
│   ├── useDashboardData.ts   # Dashboard 数据加载
│   └── useAppNavigation.ts   # 页面导航状态
├── lib/
│   ├── utils.ts              # 通用工具函数
│   ├── nodeUtils.ts          # 节点工具函数
│   └── taskSort.ts           # 任务排序工具
├── pages/
│   ├── Dashboard.tsx
│   ├── Workspace.tsx
│   ├── Warehouse.tsx
│   ├── Calendar.tsx
│   ├── Settings.tsx
│   ├── HUD.tsx
│   └── index.ts
├── types/
│   ├── index.ts              # 统一导出
│   ├── node.ts               # NodeRecord, EdgeRecord 类型
│   ├── api.ts                # Request/Response 类型
│   ├── chat.ts               # Chat 相关类型
│   └── constants.ts          # 常量与配置
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

### `types/`

类型定义按职责拆分为多个文件：

#### `types/node.ts`
核心数据模型：
- `NodeRecord`：统一的节点数据模型
- `EdgeRecord`：节点间的关系记录

#### `types/api.ts`
API 请求/响应类型：
- `CreateTaskRequest/Response`、`CaptureRequest/Response`、`LinkNodesRequest`
- 剪贴板类型：`ClipboardContent`、`ReadClipboardResponse`
- 资源处理进度：`ProcessingStage`、`IngestProgress`

#### `types/chat.ts`
聊天相关类型：
- `AIProvider`、`AI_PROVIDER_INFO`、`AIProviderStatus`、`AIConfigStatus`
- `ChatMessage`、`ChatSession`、`SendChatRequest`

#### `types/constants.ts`
常量与配置：
- `priorityConfig`：优先级标签与颜色
- `resourceSubtypeIcons`：资源类型图标映射
- `nodeTypeIcons`：节点类型图标映射
- `navItems`：导航菜单项

---

### `api/`

API 层按领域拆分，统一使用 `client.ts` 封装的 `invoke` 函数：

#### `api/client.ts`
```typescript
// 统一封装 Tauri invoke，提供类型安全与错误处理
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
```

#### `api/node.ts`
节点通用 API：
- `fetchPinnedNodes()`、`fetchUnreviewedNodes()`
- `toggleNodePinned()`、`approveNode()`、`rejectNode()`
- `linkNodes()`、`unlinkNodes()`

#### `api/task.ts`
任务 API：
- `createTask()`、`softDeleteTask()`、`hardDeleteTask()`
- `markTaskAsDone()`、`markTaskAsTodo()`
- `updateTaskTitle()`、`updateTaskDescription()`、`updateTaskPriority()`、`updateTaskDueDate()`
- `fetchTasksByDate()`、`fetchAllTasks()`

#### `api/resource.ts`
资源 API：
- `quickCapture()`、`unlinkResource()`
- `fetchTaskResources()`、`fetchAllResources()`、`getResourceById()`
- `softDeleteResource()`、`hardDeleteResource()`
- `updateResourceContent()`、`updateResourceTitle()`

#### `api/chat.ts`
聊天 API：
- `createChatSession()`、`getChatSession()`、`listChatSessions()`
- `setSessionBindings()`
- `createChatMessage()`、`listChatMessages()`
- `getAIConfigStatus()`、`saveApiKey()`、`removeApiKey()`
- `setProcessingProviderModel()`、`setClassificationMode()`、`sendChatMessage()`

#### `api/system.ts`
系统 API：
- `toggleHUD()`、`hideHUD()`
- `readClipboard()`、`getAssetsPath()`
- `seedDemoData()`

---

### `contexts/`

Context 按职责拆分为三个独立模块：

#### `AIConfigContext.tsx` (~110行)
AI 配置管理：
- 状态：`config`、`loading`、`error`、`configuredProviders`
- 方法：`saveKey()`、`removeKey()`、`saveProcessingProviderModel()`、`saveClassificationMode()`、`refreshConfig()`

#### `ChatSessionContext.tsx` (~90行)
聊天会话管理：
- 状态：`currentSessionId`、`sessions`
- 方法：`createSession()`、`loadSession()`、`clearSession()`

#### `ChatMessageContext.tsx` (~180行)
聊天消息与流处理：
- 状态：`messages`、`isChatLoading`、`selectedModel`
- 方法：`sendMessage()`、`loadSessionMessages()`、`clearMessages()`
- 事件：监听 Tauri `chat-stream`，按 `session_id` 拼接 assistant delta

#### `LanguageContext.tsx`
多语言支持，依赖 `translations.ts`：
- `language` 存储到 localStorage
- `t(category, key)` 读取 `zh/en` 文案

---

### `hooks/`

Hooks 按功能分为通用 hooks 和业务 hooks：

#### 通用 Hooks

**`useAsync.ts`**
通用异步操作封装：
```typescript
const { data, loading, error, execute } = useAsync(asyncFn);
const { data, loading, error } = useAsyncImmediate(asyncFn, deps);
```

**`useLocalStorage.ts`**
localStorage 状态管理：
```typescript
const [value, setValue] = useLocalStorage<T>(key, defaultValue);
const [value, setValue] = useLocalStorageString(key, defaultValue);
const [value, setValue] = useLocalStorageNumber(key, defaultValue);
const [value, setValue] = useLocalStorageBoolean(key, defaultValue);
```

**`useKeyboard.ts`**
键盘快捷键管理：
```typescript
useKeyboardShortcut({ key: 's', ctrl: true }, callback);
useSaveShortcut(onSave, { enabled });
useEscapeKey(onEscape);
useEnterKey(onEnter);
```

#### 业务 Hooks

**`useChat.ts`**
组合 hook，整合 AI 配置、会话和消息管理：
```typescript
const { config, messages, sendMessage, ... } = useChat();
```

**`useResourceEditor.ts`**
编辑器状态管理：
```typescript
const {
  editorContent, isModified, isSaving,
  isEditingName, editedDisplayName,
  setEditorContent, save, ...
} = useResourceEditor(resource, onUpdate);
```

**`useContextResources.ts`**
上下文资源管理：
```typescript
const {
  contextResources, selectedResource,
  addContextResource, removeContextResource, ...
} = useContextResources({ selectedTask, propSelectedResource });
```

**`useDashboardData.ts`**
Dashboard 数据加载与操作：
```typescript
const {
  tasks, allTasks, resources, loading, error,
  reloadData, handleCapture, handleLinkResource
} = useDashboardData();
```

**`useAppNavigation.ts`**
页面导航与选择状态：
```typescript
const {
  currentPage, selectedTask, selectedResource,
  setCurrentPage, selectTask, selectResource, selectNode, backToDashboard
} = useAppNavigation();
```

**`useTheme.ts`**
主题管理：
```typescript
const { theme, setTheme } = useTheme();
```

**`useSidebar.ts`**
侧边栏状态：
```typescript
const { isCollapsed, width, toggleCollapse, setWidth } = useSidebar();
```

**`useIngestProgress.ts`**
资源处理进度：
```typescript
const { progressMap, clearProgress } = useIngestProgress();
```

**`usePanelResize.ts`**
面板拖拽调整：
```typescript
const { width, tempWidth, isResizing, onMouseDown } = usePanelResize(options);
```

---

### `lib/`

#### `utils.ts`
- `cn`：合并 className（`clsx` + `tailwind-merge`）
- `getFileTypeFromPath`：推断文件类型
- `getFileIcon`：根据文件名返回图标

#### `nodeUtils.ts`
- `getNodeTypeIcon(nodeType)`：返回节点类型图标
- `getNodeTypeLabel(nodeType)`：返回节点类型标签

#### `taskSort.ts`
统一的任务排序工具：
```typescript
// 通用排序函数
sortTasks(tasks, { doneAtBottom, byPriority, byDueDate });

// 预设排序
sortTasksForDashboard(tasks);  // done 置底 → 优先级 → 截止日期
sortTasksForCalendar(tasks);   // todo 在 done 前面
```

---

### `components/`

#### `Sidebar.tsx`
- 可拖拽调整宽度（150–400）
- 可折叠/展开
- 状态由 `useSidebar` hook 管理

#### `TaskCard.tsx`
- 接收 `NodeRecord` 类型
- 点击切换状态、悬浮编辑/删除

#### `ResourceCard.tsx`
- 接收 `NodeRecord` 类型
- 支持 Ingest 进度显示

#### `QuickCapture.tsx`
- 支持文本 + 多文件
- 支持剪贴板读取
- 使用 `useClipboard` 和 `useFileSelection` hooks

#### `workspace/`
- `ContextPanel.tsx`：上下文资源管理
- `EditorPanel.tsx`：文本/PDF/图片编辑器
- `ChatPanel.tsx`：AI 聊天面板

---

### `pages/`

#### `Dashboard.tsx`
- 使用 `sortTasksForDashboard()` 排序任务
- 任务区 + 资源区

#### `Workspace.tsx` (~210行，重构后)
- 使用 `useResourceEditor` 和 `useContextResources` hooks
- 三栏布局

#### `Calendar.tsx`
- 使用 `sortTasksForCalendar()` 排序任务
- 月历视图

#### `Settings.tsx`
- 主题/语言/API Key/处理模型/归类模式管理

---

### `App.tsx` (~93行，重构后)

使用组合 hooks 简化状态管理：

```typescript
function App() {
  const { theme, setTheme } = useTheme();
  const sidebar = useSidebar();
  const dashboard = useDashboardData();
  const nav = useAppNavigation();
  const { progressMap } = useIngestProgress();

  return (
    <div className="flex h-screen">
      <Sidebar {...sidebar} {...nav} />
      <main>
        {nav.currentPage === "dashboard" && <DashboardPage {...dashboard} {...nav} />}
        {nav.currentPage === "workspace" && <WorkspacePage {...nav} />}
        {/* ... */}
      </main>
    </div>
  );
}
```

---

## 数据流

```
main.tsx
  ├─ LanguageProvider + AIContextProvider
  ├─ #/hud -> HUDPage -> QuickCapture
  └─ App.tsx
       ├─ useTheme() -> 主题管理
       ├─ useSidebar() -> 侧边栏状态
       ├─ useDashboardData() -> 数据加载与操作
       ├─ useAppNavigation() -> 页面导航
       ├─ useIngestProgress() -> 处理进度
       │
       ├─ DashboardPage
       │    ├─ sortTasksForDashboard() -> 任务排序
       │    └─ TaskCard / ResourceCard / QuickCapture
       │
       ├─ WorkspacePage
       │    ├─ useResourceEditor() -> 编辑器状态
       │    ├─ useContextResources() -> 上下文资源
       │    └─ ContextPanel / EditorPanel / ChatPanel
       │
       ├─ CalendarPage
       │    └─ sortTasksForCalendar() -> 任务排序
       │
       └─ SettingsPage
            └─ useAIConfig() -> AI 配置
```

---

## 后续维护建议

1. 新增页面时更新 `pages/index.ts`、`types/constants.ts`（navItems）、`App.tsx`
2. 新增 API 时在对应领域文件中添加，并在 `api/index.ts` 导出
3. 新增 hook 时在 `hooks/index.ts` 导出
4. 新增类型时在对应类型文件中添加，并在 `types/index.ts` 导出
5. 任务排序逻辑变更时修改 `lib/taskSort.ts`
