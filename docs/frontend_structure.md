# 前端项目结构

## 目录总览

```
src/
├── api/
│   └── index.ts          # Tauri 后端 invoke 封装
├── assets/               # 静态资源（图标/占位符）
├── contexts/
│   ├── AIContext.tsx     # AI 配置和聊天状态管理
│   └── LanguageContext.tsx # 多语言支持
├── components/
│   ├── index.ts
│   ├── PDFViewer.tsx     # PDF 阅读器（懒加载）
│   ├── QuickCapture.tsx  # 捕获组件，支持 HUD/卡片、多文件、剪贴板粘贴
│   ├── ResourceCard.tsx  # 资源卡片 + 任务关联下拉
│   ├── Sidebar.tsx       # 侧边栏导航
│   ├── TaskCard.tsx      # 任务卡片（可点击方框切换状态、悬浮显示编辑按钮）
│   ├── TaskEditCard.tsx  # 任务编辑组件（支持创建/编辑双模式、Notion 风格日期选择器）
│   ├── TasksDialog.tsx   # 通用任务对话框（可显示指定日期的任务或已完成任务）
│   ├── TiptapEditor.tsx  # Markdown 富文本编辑器（基于 Tiptap）
│   ├── workspace/        # Workspace 页面子组件
│   │   ├── index.ts          # 导出
│   │   ├── ContextPanel.tsx  # 左侧面板（资源/任务详情）
│   │   ├── EditorPanel.tsx   # 中间编辑区
│   │   └── ChatPanel.tsx     # 右侧聊天面板
│   └── ui/               # shadcn/ui 通用组件库
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── popover.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       ├── switch.tsx
│       ├── textarea.tsx
│       └── tooltip.tsx
├── lib/
│   └── utils.ts          # 工具函数（cn 等）
├── pages/
│   ├── Dashboard.tsx     # 智能看板 (Page A)
│   ├── HUD.tsx           # 悬浮输入窗 (Quick Capture HUD)
│   ├── Calendar.tsx      # 日历页面 (Page C)
│   ├── index.ts
│   ├── Settings.tsx      # 设置 (Page E)
│   └── Workspace.tsx     # 任务工作台 (Page B)，集成编辑器
├── types/
│   └── index.ts          # 类型、Schema、常量
├── App.tsx               # 主界面，状态管理 & 路由
├── App.css               # 全局样式（深色主题）
├── main.tsx              # 入口，根据 hash 选择 App 或 HUD
└── vite-env.d.ts
```

---

## 文件说明

### `types/index.ts`

定义所有 TypeScript 类型、Zod Schema 与常量。

- Schema：`taskSchema`、`resourceSchema`、`dashboardSchema`，均用 `z.coerce.date()` 将日期规范化。
- 枚举值：`taskStatusValues`（todo/done）、`taskPriorityValues`、`resourceTypeValues`、`classificationValues`。
- 数据类型：`Task`（包含 task_id, title, status, done_date, priority, due_date 等）、`Resource`、`DashboardData`、`TaskStatus`、`TaskPriority`、`ResourceType`、`PageType`（"dashboard" | "workspace" | "calendar" | "settings"）。
- API 类型：`CreateTaskRequest/Response`、`CaptureRequest/Response`、`LinkResourceRequest/Response`、`TaskResourcesResponse`、`SeedResponse`、`CaptureSourceMeta`。
- 剪贴板类型：`ClipboardContent`（Image/Files/Text/Html/Empty）、`ReadClipboardResponse`。
- 常量：`priorityConfig`（中文标签 + 颜色）、`resourceTypeIcons`（emoji 图标）、`navItems`（Sidebar 菜单，包括日历）。
- AI Provider 类型：`AIProvider`（"openai" | "anthropic" | "gemini" | "grok" | "deepseek" | "qwen"）、`aiProviderValues`、`ModelInfo`、`ProviderInfo`、`AI_PROVIDER_INFO`（各 Provider 的配置信息）。
- AI 配置类型：`AIProviderStatus`、`AIConfigStatus`、`SaveApiKeyRequest`、`SetDefaultModelRequest`、`ChatMessagePayload`、`SendChatRequest`、`ChatResponse`、`ModelOption`、`ChatMessage`。

---

### `api/index.ts`

封装所有 Tauri `invoke` 调用，统一使用类型化请求/响应。

| 函数                      | 参数                   | 返回                             | 说明                                  |
| ------------------------- | ---------------------- | -------------------------------- | ------------------------------------- |
| `fetchDashboardData()`    | -                      | `Promise<DashboardData>`         | 取回看板任务 + 未分类资源             |
| `createTask()`            | `CreateTaskRequest`    | `Promise<CreateTaskResponse>`    | 创建任务                              |
| `quickCapture()`          | `CaptureRequest`       | `Promise<CaptureResponse>`       | 快速捕获文本/文件                     |
| `linkResource()`          | `LinkResourceRequest`  | `Promise<LinkResourceResponse>`  | 资源关联到任务                        |
| `unlinkResource()`        | `(taskId, resourceId)` | `Promise<LinkResourceResponse>`  | 取消关联                              |
| `fetchTaskResources()`    | `taskId: number`       | `Promise<TaskResourcesResponse>` | 拉取任务的关联资源（含校验）          |
| `seedDemoData()`          | -                      | `Promise<SeedResponse>`          | 生成演示数据                          |
| `toggleHUD()`/`hideHUD()` | -                      | `Promise<void>`                  | 控制悬浮 HUD 的显示/隐藏              |
| `readClipboard()`         | -                      | `Promise<ReadClipboardResponse>` | 读取系统剪贴板（图片/文件/文本/HTML） |
| `getAssetsPath()`         | -                      | `Promise<string>`                | 获取 assets 目录的完整路径            |
| `fetchTasksByDate()`      | `date: string`         | `Promise<Task[]>`                | 获取指定日期的所有任务                |
| `fetchAllTasks()`         | -                      | `Promise<Task[]>`                | 获取所有任务（包括 todo 和 done），用于 Calendar 视图 |
| `updateResourceContent()` | `(resourceId, content)` | `Promise<void>`                  | 更新资源内容（保存编辑器更改）        |
| `getAIConfigStatus()`     | -                       | `Promise<AIConfigStatus>`        | 获取 AI 配置状态（各 Provider 是否已配置）|
| `saveApiKey()`            | `SaveApiKeyRequest`     | `Promise<void>`                  | 保存 API Key 到加密配置              |
| `removeApiKey()`          | `provider: string`      | `Promise<void>`                  | 删除指定 Provider 的 API Key        |
| `setDefaultModel()`       | `SetDefaultModelRequest`| `Promise<void>`                  | 设置默认模型                         |
| `sendChatMessage()`       | `SendChatRequest`       | `Promise<ChatResponse>`          | 发送聊天消息并获取 AI 回复           |

---

### `components/`

可复用 UI 组件，全部通过 `components/index.ts` 导出。

#### `Sidebar.tsx`

侧边栏导航组件，使用共享的 `navItems` 从 `types/index.ts` 导入，支持当前态高亮。包括Dashboard、Workspace、Calendar、Settings 四个页面。

**核心功能**：

- **可调整大小**：拖拽右侧边缘可以调整侧边栏宽度（150px - 400px）
- **可折叠/展开**：点击右上角 ChevronsLeft 图标可以折叠/展开侧边栏
- **状态持久化**：侧边栏宽度和折叠状态保存到 localStorage
- **悬浮展开按钮**：侧边栏折叠时，左侧显示悬浮展开按钮
- **视觉反馈**：拖拽时显示高亮效果和 col-resize 光标

```tsx
interface SidebarProps {
  currentPage: PageType; // 当前页面
  onNavigate: (page: PageType) => void; // 导航回调
  isCollapsed: boolean; // 是否折叠
  width: number; // 侧边栏宽度（像素）
  onToggleCollapse: () => void; // 折叠/展开回调
  onWidthChange: (width: number) => void; // 宽度变化回调
}
```

**localStorage Keys**：
- `neuralvault_sidebar_collapsed`: 折叠状态（boolean）
- `neuralvault_sidebar_width`: 侧边栏宽度（number，默认 240px）

#### `TaskCard.tsx`

任务卡片组件，展示单个任务并按截止时间高亮逾期。支持多种交互方式：

**核心功能**：

- **点击卡片**：跳转到对应的 Workspace
- **点击左上角方框**：直接切换任务状态（todo ↔ done），带勾选动画
- **悬浮显示操作按钮**：悬浮时显示编辑（三个点）和删除按钮
- **优先级显示**：彩色文字标签（High 红色、Medium 橙色、Low 绿色）
- **逾期高亮**：逾期任务显示红色边框和背景
- **统一高度**：所有卡片保持最小高度一致，优先级和日期底部对齐

```tsx
interface TaskCardProps {
  task: Task; // 任务数据
  onClick?: () => void; // 点击卡片回调
  onDelete?: (taskId: number) => void; // 删除回调
  onUpdate?: () => void; // 更新后刷新回调
}
```

**交互细节**：

- 所有按钮点击事件都阻止冒泡（`e.stopPropagation()`），避免触发卡片点击
- 集成 `TaskEditCard` 组件用于编辑
- 使用 Flexbox 布局确保内容对齐

#### `TaskEditCard.tsx`

统一的任务编辑组件，支持创建和编辑两种模式。使用 Notion 风格的 UI 设计。

**双模式支持**：

- **创建模式**：不传入 `task` prop，所有字段为空，调用 `createTask` API
- **编辑模式**：传入 `task` prop，预填充数据，智能更新变化的字段

**表单字段**：

1. **标题** - Input 组件，必填
2. **描述** - Textarea 组件，可选
3. **状态** - Select 组件（Todo / Done）
4. **优先级** - Select 组件（High / Medium / Low），显示彩色文字
5. **截止日期** - Popover + Calendar 组件（Notion 风格日历选择器）

**核心特性**：

- 使用 `react-day-picker` + `date-fns` 实现 Notion 风格日历
- 表单验证：标题不能为空
- 智能 API 调用：编辑模式下只调用变化字段的更新 API
- 日期格式处理：Date 对象 → `YYYY-MM-DD HH:mm:ss` 格式
- 加载状态和错误处理

```tsx
interface TaskEditCardProps {
  task?: Task; // 可选，传入则为编辑模式
  open: boolean; // 控制 Dialog 显示
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void; // 保存成功后的回调
}
```

**日期选择器**：

- 使用 shadcn/ui 的 `Calendar` 和 `Popover` 组件
- 点击按钮弹出日历面板
- 支持月份切换和键盘导航
- 显示格式化日期（如 "December 16, 2025"）

#### `TasksDialog.tsx`

通用任务对话框组件，通过传入 `fetchTasks` 函数完全由调用方控制数据获取和过滤逻辑。

**功能特性**：

- 完全解耦的数据获取：通过 `fetchTasks` 函数参数，由调用方决定如何获取和过滤任务
- 支持恢复任务为待办状态
- 支持删除任务
- 空状态友好提示
- 响应式布局

```tsx
interface TasksDialogProps {
  open: boolean; // 控制对话框显示
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void; // 任务更新后的回调
  fetchTasks: () => Promise<Task[]>; // 获取和过滤任务的函数，由调用方提供
  title: string; // 对话框标题
}
```

**使用示例**：

```tsx
// Dashboard 中显示今天已完成的任务
<TasksDialog
  open={completedDialogOpen}
  onOpenChange={setCompletedDialogOpen}
  onTaskUpdated={onRefresh}
  title="今日已完成的任务"
  fetchTasks={async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const tasks = await fetchTasksByDate(today);
    return tasks.filter(t => 
      t.status === 'done' && 
      t.done_date && 
      isSameDay(new Date(t.done_date), new Date())
    );
  }}
/>

// Calendar 中显示指定日期的所有任务
<TasksDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  onTaskUpdated={onRefresh}
  title={format(selectedDate, 'yyyy年MM月dd日 EEEE', { locale: zhCN })}
  fetchTasks={async () => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return await fetchTasksByDate(dateStr);
  }}
/>
```

#### `ResourceCard.tsx`

资源卡片组件，展示资源基本信息；当传入 `tasks` 和 `onLinkToTask` 时，会出现"关联到任务"的下拉菜单。**支持点击卡片直接导航到Workspace**。

**核心功能**：

- **点击导航**：点击卡片可直接进入Workspace查看资源（需传入`onClick`回调）
- **关联任务**：下拉菜单支持将资源关联到任务
- **删除操作**：悬浮显示删除按钮
- **事件隔离**：下拉菜单和删除按钮点击不会触发卡片导航

```tsx
interface ResourceCardProps {
  resource: Resource; // 资源数据
  tasks?: Task[]; // 可关联的任务列表
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>; // 关联回调
  onDelete?: (resourceId: number) => Promise<void>; // 删除回调
  onClick?: (resource: Resource) => void; // 点击卡片的导航回调
}
```

#### `QuickCapture.tsx`

快速捕获组件，支持文本/文件，Enter 发送、Shift+Enter 换行，封装 Tauri 文件选择。增强功能：

- **多文件选择**：支持选择和预览多个文件（Tauri dialog API）
- **剪贴板粘贴**：支持粘贴图片、文件、HTML、纯文本（通过 `readClipboard` API）
- **自动高度调整**：textarea 根据内容自适应高度
- **HUD 模式**：Esc 关闭、窗口失焦自动关闭

```tsx
interface QuickCaptureProps {
  onCapture: (content: string, filePath?: string) => Promise<void>;
  loading?: boolean;
  variant?: "card" | "hud"; // HUD 皮肤会应用专用样式与快捷键
  onSuccess?: () => void; // 成功后回调（HUD 用于收起窗口）
  onCancel?: () => void; // Esc/失焦关闭 HUD
  autoFocus?: boolean;
  placeholder?: string;
}
```

#### `TiptapEditor.tsx`

Markdown 富文本编辑器组件，基于 Tiptap + StarterKit + Markdown 扩展。

- **Markdown 支持**：输入输出均为 Markdown 格式
- **双向绑定**：内容变化实时回调
- **可编辑控制**：支持只读模式
- **标题层级**：支持 H1-H6
- **保存功能**：在 Workspace 中集成，支持 Ctrl+S/Command+S 快捷键保存

```tsx
interface TiptapEditorProps {
  content: string; // Markdown 格式的内容
  onChange?: (markdown: string) => void; // 内容变化回调，返回 Markdown 格式
  editable?: boolean;
  placeholder?: string;
}
```

**Workspace 集成**：
- 编辑内容后显示"未保存"徽章
- 点击保存按钮或按 Ctrl+S/Command+S 保存
- 显示保存状态：保存中、已保存、保存失败
- 保存成功后 3 秒自动隐藏提示

#### `PDFViewer.tsx`

PDF 阅读器组件，基于 react-pdf-highlighter-extended + PDF.js。

- **PDF 渲染**：使用 PDF.js 渲染引擎，支持大文件
- **文本高亮**：选中文本后可添加高亮标注
- **区域高亮**：支持框选区域进行截图高亮
- **高亮管理**：悬停查看高亮内容，点击删除
- **滚轮缩放**：支持滚轮缩放查看
- **加载状态**：加载动画和错误提示
- **懒加载**：在 Workspace 中使用 `React.lazy()` 按需加载，避免影响应用启动性能

```tsx
interface PDFViewerProps {
  url: string; // PDF 文件的 URL（通过 convertFileSrc 转换后的 asset:// 协议）
  displayName?: string; // 显示名称
}
```

**使用方式**（Workspace.tsx 中）：

```tsx
const PDFViewer = lazy(() =>
  import("../components/PDFViewer").then((module) => ({
    default: module.PDFViewer,
  }))
);

<Suspense fallback={<LoadingUI />}>
  <PDFViewer url={pdfUrl} displayName={name} />
</Suspense>;
```

#### `ui/` 组件库

基于 shadcn/ui 的通用 UI 组件，提供一致的设计语言和交互体验：

- `Button`：按钮组件，支持多种变体（default/ghost/secondary/destructive）和尺寸
- `Card`：卡片容器（CardHeader/CardContent/CardTitle/CardDescription）
- `Badge`：徽章标签
- `Input/Textarea`：表单输入组件
- `Switch`：开关组件
- `ScrollArea`：滚动区域容器
- `Separator`：分隔线
- `Tooltip`：提示框（TooltipProvider/TooltipTrigger/TooltipContent）
- `DropdownMenu`：下拉菜单
- `Avatar`：头像组件
- `Calendar`：日历组件（基于 react-day-picker，用于日期选择）
- `Popover`：弹出层容器（用于日历等浮动组件）
- `Dialog`：对话框组件（用于模态窗口）

---

### `lib/utils.ts`

工具函数库，提供常用辅助函数：

- `cn(...inputs)`：用于合并和条件化 className（基于 clsx + tailwind-merge）

---

### `contexts/`

Context 模块，提供全局状态管理。

#### `AIContext.tsx`

AI 配置和聊天状态管理 Context，负责与 Rust 后端通信管理 API Key 和发送聊天消息。

**提供的状态**：

| 状态 | 类型 | 说明 |
| --- | --- | --- |
| `config` | `AIConfigStatus \| null` | AI 配置状态（各 Provider 是否已配置） |
| `loading` | `boolean` | 配置加载状态 |
| `error` | `string \| null` | 错误信息 |
| `messages` | `ChatMessage[]` | 当前会话的聊天消息 |
| `sending` | `boolean` | 消息发送状态 |
| `selectedModel` | `ModelOption \| null` | 当前选中的模型 |
| `availableModels` | `ModelOption[]` | 可用的模型列表（基于已配置的 Provider） |

**提供的方法**：

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `saveKey()` | `provider, apiKey, baseUrl?` | `Promise<void>` | 保存 API Key |
| `removeKey()` | `provider` | `Promise<void>` | 删除 API Key |
| `refreshConfig()` | - | `Promise<void>` | 刷新配置状态 |
| `selectModel()` | `ModelOption` | `void` | 选择模型 |
| `sendMessage()` | `content` | `Promise<void>` | 发送聊天消息 |
| `clearMessages()` | - | `void` | 清空聊天记录 |

**备注**：当前前端通过 Tauri `send_chat_message` 获取完整回复（非流式）。Python 后端已支持 SSE 流式接口（`/chat/completions` + `stream=true`），前端接入可作为后续优化。

**使用示例**：

```tsx
import { useAI } from "@/contexts/AIContext";

function MyComponent() {
  const { config, availableModels, sendMessage } = useAI();

  // 检查是否有可用模型
  if (availableModels.length === 0) {
    return <div>请先配置 API Key</div>;
  }

  // 发送消息
  await sendMessage("Hello, AI!");
}
```

#### `LanguageContext.tsx`

多语言支持 Context，提供中英文切换功能。

---

### `pages/`

页面组件对应设计文档中的页面与 HUD 窗口。

#### `Dashboard.tsx` (Page A)

智能看板：采用 Notion 风格的现代化设计，包含三个主要部分：

**1. 智能待办列表**

- 展示所有活跃任务（todo 状态）
- 支持两种排序模式：
  - **智能排序**：基于优先级权重（high=3, medium=2, low=1）+ 截止日期紧迫程度
  - **手动排序**：按创建时间降序排列
- 使用响应式网格布局展示任务卡片（1-3 列自适应）
- 显示任务计数徽章
- 空状态友好提示

**任务交互**：

- **点击任务卡片**：跳转到 Workspace
- **点击方框**：直接切换任务状态（todo ↔ done）
- **悬浮显示按钮**：编辑和删除操作
- **优先级显示**：彩色文字标签（High/Medium/Low）

**顶部功能栏**：

- **"今日已完成"按钮**：点击打开 `CompletedTasksDialog` 对话框，查看今日完成的任务
- **"创建任务"按钮**：点击打开 `TaskEditCard` 对话框（创建模式）
- 显示任务计数徽章

**2. 快速捕获**

- 内嵌 `QuickCapture` 组件
- 支持文本输入、图片粘贴、文件上传
- 提供操作提示文字

**3. 待分类资源**

- 网格布局展示未分类资源（1-5 列自适应）
- **点击资源卡片**：直接进入Workspace查看资源（资源模式）
- 每个资源卡片支持下拉菜单关联到任务
- AI 建议提示（资源数量 > 0 时显示）
- 快捷键提示（Alt + Space 唤起 HUD）
- 空状态引导文字

**Props 接口**

```tsx
interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCapture: (content: string, filePath?: string) => Promise<void>;
  onSeed: () => void;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
  onSelectResource: (resource: Resource) => void; // 新增：资源点击导航
  onLinkResource: (resourceId: number, taskId: number) => Promise<void>;
}
```
#### `Calendar.tsx` (Page C)

日历页面：全屏月历视图，直接在日期格子中展示任务。

**核心功能**：

- **全屏月历布局**：7×6 网格，显示当前月份的所有日期
- **任务直接显示**：每个日期格子内最多显示前 2 个任务
- **溢出处理**：超过 2 个任务时显示"还有 X 个任务"按钮
- **任务列表对话框**：点击溢出按钮弹出 `TasksDialog` 显示该日所有任务
- **状态切换**：直接点击任务可切换 todo/done 状态
- **可视化标识**：
  - 今天日期：特殊边框高亮
  - 优先级颜色：每个任务有左侧颜色条
  - 完成状态：已完成任务显示删除线、勾选框和半透明效果

**月份导航**：

- 上个月/下个月箭头按钮
- 顶部显示当前年月

**数据管理**：

- 使用 `fetchAllTasks` API 查询所有任务（包括 todo 和 done 状态）
- 前端按日期分组任务用于快速查找
- 使用 `date-fns` 处理日期计算和格式化

**Props 接口**：

```tsx
interface CalendarPageProps {
  tasks: Task[]; // 所有任务列表（包括 todo 和 done）
  onRefresh: () => void; // 刷新回调
}
```

**特点**：

- 极简导航：仅前后切换，无"今天"按钮
- 同时显示 todo 和 done 状态任务
- 点击任务直接切换状态，无需进入编辑
- 溢出任务通过对话框查看，保持界面简洁
- 每个格子最多显示2个任务，优化空间利用

#### `Workspace.tsx` (Page B)

任务工作台：三栏布局，已集成编辑器与资源预览。**支持拖拽调整面板大小**。**支持双模式进入：任务模式和资源模式**。

**组件结构**：

主组件 `Workspace.tsx` 重构为使用三个独立的子组件（位于 `components/workspace/`）：

- `ContextPanel.tsx` - 左侧面板，显示资源/任务详情
- `EditorPanel.tsx` - 中间编辑区，支持多种资源类型预览
- `ChatPanel.tsx` - 右侧 AI 聊天面板（目前为占位）

**进入模式**：

- **任务模式**：从Dashboard点击任务卡片进入
  - 左侧显示任务详情和关联资源列表
  - 可以点击关联资源在中间编辑区查看
  - Header面包屑显示："任务 / [任务名] / [资源名]"
- **资源模式**：从Dashboard点击资源卡片进入
  - 左侧显示资源详情（类型、创建时间、路径等）
  - 中间编辑区直接显示资源内容
  - Header面包屑显示："资源 / [资源名]"

**可调整布局**：

- **左栏（ContextPanel）**：可拖拽调整宽度（150px - 400px，默认 256px）
- **中栏（EditorPanel）**：自动填充剩余空间
- **右栏（ChatPanel）**：可拖拽调整宽度（200px - 500px，默认 288px）
- 宽度保存到 localStorage

**内容功能**：

- **左栏**：任务/资源详情 + 关联资源列表 + 附带文本显示
- **中栏**：支持多种资源类型预览和编辑
  - **文本资源**：使用 `TiptapEditor` 进行 Markdown 编辑
  - **文件资源（PDF/图片等）**：显示"编辑文本/查看文件"切换按钮
    - 查看文件：显示 PDF/图片预览
    - 编辑文本：显示 TiptapEditor 供用户添加笔记（即使原本没有文本内容）
  - PDF 使用 `react-pdf-highlighter-extended`，图片使用 `react-zoom-pan-pinch`
  - 支持 Ctrl+S/Command+S 快捷键保存
- **右栏**：AI 助手占位

```tsx
interface WorkspacePageProps {
  selectedTask: Task | null;
  selectedResource: Resource | null;
  onBack: () => void;
}
```

##### `workspace/ContextPanel.tsx`

左侧面板组件，负责资源/任务详情显示。

```tsx
interface ContextPanelProps {
  isResourceMode: boolean;
  selectedTask: Task | null;
  propSelectedResource: Resource | null;
  selectedResource: Resource | null;
  linkedResources: Resource[];
  loadingResources: boolean;
  hoveredResourceId: number | null;
  setHoveredResourceId: (id: number | null) => void;
  editorContent: string;
  viewMode: 'file' | 'text';
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResourceClick: (resource: Resource) => void;
  onDeleteResource: (resourceId: number, e: React.MouseEvent) => void;
}
```

##### `workspace/EditorPanel.tsx`

中间编辑区组件，负责资源内容编辑和预览。

```tsx
interface EditorPanelProps {
  currentResource: Resource | null;
  editorContent: string;
  viewMode: 'file' | 'text';
  isEditingName: boolean;
  editedDisplayName: string;
  isModified: boolean;
  isSaving: boolean;
  assetsPath: string;
  onEditorChange: (content: string) => void;
  onSave: () => void;
  onViewModeChange: (mode: 'file' | 'text') => void;
  onEditingNameChange: (editing: boolean) => void;
  onDisplayNameChange: (name: string) => void;
}
```

**特性**：
- 对于文件类型资源，始终显示"编辑文本/查看文件"切换按钮
- 即使资源原本没有文本内容，也可以切换到"编辑文本"模式添加笔记
- 懒加载 PDFViewer 组件

##### `workspace/ChatPanel.tsx`

右侧聊天面板组件，集成 AI 聊天功能。

**核心功能**：

- **模型选择**：下拉菜单显示所有已配置 API Key 的 Provider 及其模型
- **消息发送**：输入消息并通过 Enter 键或发送按钮发送
- **消息展示**：显示用户和 AI 的对话历史
- **加载状态**：发送消息时显示"思考中..."状态
- **未配置提示**：如果没有配置任何 API Key，显示引导用户前往设置页

```tsx
interface ChatPanelProps {
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onNavigateToSettings?: () => void; // 导航到设置页的回调
}
```

**使用的 Context**：
- `useAI()` - 获取 AI 配置状态、可用模型、发送消息等功能

#### `Settings.tsx` (Page E)

设置页面，包含 API Key 管理、外观设置、快捷键展示和关于信息。

**API Key 管理**：

- **Provider 卡片**：为每个支持的 AI Provider（ChatGPT、Claude、Gemini、Grok、Deepseek、Qwen）显示独立的配置卡片
- **状态显示**：已配置的 Provider 显示绿色"已配置"徽章，未配置显示"未配置"
- **API Key 输入**：密码样式输入框，支持显示/隐藏切换（Eye 图标）
- **保存/删除**：点击"配置"或"更新"按钮保存，已配置的 Provider 可删除

```tsx
interface APIKeyCardProps {
  provider: AIProvider;
  hasKey: boolean;
  enabled: boolean;
  baseUrl: string | null;
  onSave: (apiKey: string, baseUrl?: string) => Promise<void>;
  onRemove: () => Promise<void>;
}
```

**使用的 Context**：
- `useAI()` - 获取配置状态、保存/删除 API Key

#### `HUD.tsx` (Quick Capture HUD)

独立的悬浮输入窗。通过 Tauri hash 路由 `#/hud` 渲染，监听 `hud-focus` 事件聚焦输入，捕获成功后通过 `emit("hud-blur")` 通知后端关闭窗口。使用 `QuickCapture` 组件的 `hud` 变体，应用透明背景 + 毛玻璃效果（backdrop-blur）。

---

### `App.tsx`

主应用入口（主窗口），负责全局状态与页面切换：

- 状态：`currentPage`、`tasks`、`allTasks`、`resources`、`loading`、`error`、`selectedTask`、`selectedResource`、`seeding`、`theme`、`sidebarCollapsed`、`sidebarWidth`。
- 数据加载：`fetchDashboardData` 初始拉取 + `reloadData` 复用。
- 交互处理：
  - `handleCapture`：文本/文件快速捕获，推断文件类型后调用 `quickCapture`。
  - `handleSeed`：生成演示数据。
  - `handleSelectTask`：选中任务并导航到Workspace（任务模式），同时清除资源选择。
  - `handleSelectResource`：选中资源并导航到Workspace（资源模式），同时清除任务选择。
  - `handleBackToDashboard`：返回Dashboard，清除任务和资源选择。
  - `handleLinkResource`：资源关联后刷新列表（资源从"未分类"消失）。
- 路由：`dashboard`、`workspace`、`calendar`、`settings` 四个视图。

### `main.tsx`

根据 URL hash 选择渲染：

- `#/hud` -> `HUDPage`（悬浮输入窗）。
- 其他 -> `App`（主界面）。

---

### `App.css`

全局样式，基于 Tailwind CSS + CSS 变量的深色主题，配合 shadcn/ui 组件库。

- **CSS 变量**：背景/边框、文字、强调色（含 hover/subtle）、状态色、字体、圆角、阴影、过渡。
- **全局样式**：覆盖 Sidebar、看板、工作台、设置页与 QuickCapture。
- **Tiptap 编辑器样式**：自定义编辑器内容区样式（`.tiptap-editor-content`）。
- **响应式设计**：基于 Tailwind 的响应式网格布局（Dashboard、ResourceCard）。

---

## 数据流

```
入口: main.tsx
  ├─ #/hud -> HUDPage -> QuickCapture(variant="hud")
  │                        ├─ 剪贴板粘贴 -> readClipboard -> Rust (read_clipboard)
  │                        └─ 捕获提交 -> quickCapture -> Rust (capture_resource)
  └─ default -> App.tsx
        ├─ DashboardPage (tasks/resources)
│    ├─ TaskCard（点击方框切换状态、悬浮显示编辑/删除按钮、点击卡片进入Workspace任务模式）
│    │    └─ TaskEditCard（编辑模式）
│    ├─ Completed TasksDialog（查看今日已完成任务）
│    ├─ TaskEditCard（创建模式，点击\"创建任务\"按钮触发）
│    ├─ ResourceCard（点击卡片进入Workspace资源模式）/ QuickCapture（含剪贴板支持）
│    └─ onLinkResource -> linkResource -> Rust
├─ WorkspacePage (selectedTask | selectedResource，双模式支持)
│    ├─ 任务模式：fetchTaskResources -> 获取关联资源
│    ├─ 资源模式：直接显示资源详情
│    ├─ TiptapEditor（文本编辑，Markdown 双向绑定）
│    └─ AI Chat 占位（输入框 + 上下文）
├─ CalendarPage (allTasks)
│    ├─ 月历视图，显示所有任务
│    └─ TasksDialog（溢出任务对话框）
└─ SettingsPage (API Key / 本地模型 / 快捷键 / 关于)
      ▲
      │ state: tasks, allTasks, resources, currentPage, selectedTask, selectedResource, loading, error, seeding
      │ actions: fetchDashboardData / seedDemoData / linkResource / quickCapture / readClipboard
      │         handleSelectTask / handleSelectResource / handleBackToDashboard
      │         markTaskAsDone / markTaskAsTodo / updateTask* (title/description/priority/due_date)
      ▼
api/index.ts -> tauri invoke -> Rust commands.rs
```

---

## 页面对应关系

| 设计文档 / 场景     | 组件文件              | 路由 Key / 窗口 |
| ------------------- | --------------------- | --------------- |
| Quick Capture HUD   | `pages/HUD.tsx`       | `#/hud`         |
| Page A - 智能看板   | `pages/Dashboard.tsx` | `dashboard`     |
| Page B - 任务工作台 | `pages/Workspace.tsx` | `workspace`     |
| Page C - 复盘与脉搏 | 暂未实现 (V1.0 不做)  | -               |
| Page D - 知识宇宙   | 暂未实现 (V1.0 不做)  | -               |
| Page E - 设置       | `pages/Settings.tsx`  | `settings`      |

---

## 后续扩展建议

1. **页面扩展**：新增页面时同步更新 `pages/index.ts` 与 `App.tsx` 路由，必要时补充 Sidebar `navItems`。
2. **HUD 行为**：如需更多 HUD 交互（历史记录、快捷标签），直接在 `QuickCapture` 扩展 props，HUD 只需传递新能力即可复用。
3. **类型/Schema**：新增模型字段时先更新 `types/index.ts` 的 Schema，再调整 API 返回值解析，避免 Zod 校验失败。
4. **API 对应**：前后端新增命令时保持 `api/index.ts` 与 Rust `commands.rs` 同步命名，确保类型对齐。
5. **编辑器增强**：当前 `TiptapEditor` 支持基础 Markdown 编辑，可扩展更多插件（表格、代码高亮、公式等）。
6. **资源预览**：
   - ✅ **图片预览已完成**：
     - 使用 `react-zoom-pan-pinch` 实现缩放平移功能
     - 路径转换流程：相对路径（`assets/xxx.png`）→ `getAssetsPath()` 获取完整路径 → `convertFileSrc()` 转换为 asset 协议 URL（`asset://localhost/...`）
     - 配置要求：`tauri.conf.json` 中启用 `assetProtocol`，作用域设置为 `$APPDATA/**`
   - ✅ **PDF 预览已完成**：
     - 使用 `react-pdf-highlighter-extended` + `pdfjs-dist@4.4.168` 实现 PDF 阅读
     - 支持文本高亮、区域截图（按住 Alt/Option）
     - PDF.js worker 配置：复制 `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` 到 `public/` 目录
     - 路径转换流程与图片预览相同
     - 依赖安装：`npm install react-pdf-highlighter-extended pdfjs-dist@4.4.168 --legacy-peer-deps`
     - 懒加载：使用 `React.lazy()` 避免影响应用启动
     - 版本要求：`pdfjs-dist` 必须是 4.4.168，与 `react-pdf-highlighter-extended` 匹配
7. **保存功能**：
   - ✅ **保存功能已完成**：
     - 后端 API：`update_resource_content_command` Tauri 命令
     - 前端 API：`updateResourceContent(resourceId, content)` 函数
     - 快捷键：支持 Ctrl+S/Command+S 保存编辑器内容
     - 状态提示：显示"未保存"、"保存中..."、"已保存"、"保存失败"状态
     - 自动刷新：保存成功后 3 秒自动隐藏提示
8. **剪贴板增强**：可扩展支持复制资源到剪贴板、HTML 格式保留样式等功能。
9. **UI 组件扩展**：如需新增 shadcn/ui 组件，使用 `npx shadcn-ui@latest add [component]` 命令自动生成。
10. **任务编辑功能**：
    - ✅ **TaskEditCard 组件已完成**：
      - 支持创建/编辑双模式
      - Notion 风格日期选择器（基于 `react-day-picker` + `date-fns`）
      - 完整表单验证和错误处理
      - 智能 API 调用（仅更新变化的字段）
    - ✅ **TaskCard 交互优化已完成**：
      - 点击方框直接切换任务状态
      - 悬浮显示编辑和删除按钮
      - 优先级彩色文字显示（High 红色、Medium 橙色、Low 绿色）
      - 统一卡片高度和底部对齐
    - ✅ **已完成任务管理**：
      - `CompletedTasksDialog` 组件展示今日已完成任务
      - 支持恢复任务为待办状态
      - 支持删除已完成任务
