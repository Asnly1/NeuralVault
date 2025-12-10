# 前端项目结构

## 目录总览

```
src/
├── api/
│   └── index.ts          # Tauri 后端 invoke 封装
├── assets/               # 静态资源（图标/占位符）
├── components/
│   ├── index.ts
│   ├── QuickCapture.tsx  # 捕获组件，支持 HUD/卡片、多文件、剪贴板粘贴
│   ├── ResourceCard.tsx  # 资源卡片 + 任务关联下拉
│   ├── Sidebar.tsx       # 侧边栏导航
│   ├── TaskCard.tsx      # 任务卡片（逾期高亮）
│   ├── TiptapEditor.tsx  # Markdown 富文本编辑器（基于 Tiptap）
│   └── ui/               # shadcn/ui 通用组件库
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
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
- 枚举值：`taskStatusValues`（inbox/todo/doing/done/archived）、`taskPriorityValues`、`resourceTypeValues`、`classificationValues`。
- 数据类型：`Task`、`Resource`、`DashboardData`、`TaskStatus`、`TaskPriority`、`ResourceType`、`PageType`（"dashboard" | "workspace" | "settings"）。
- API 类型：`CreateTaskRequest/Response`、`CaptureRequest/Response`、`LinkResourceRequest/Response`、`TaskResourcesResponse`、`SeedResponse`、`CaptureSourceMeta`。
- 剪贴板类型：`ClipboardContent`（Image/Files/Text/Html/Empty）、`ReadClipboardResponse`。
- 常量：`priorityConfig`（中文标签 + 颜色）、`resourceTypeIcons`（emoji 图标）、`navItems`（Sidebar 菜单）。

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

---

### `components/`

可复用 UI 组件，全部通过 `components/index.ts` 导出。

#### `Sidebar.tsx`

侧边栏导航组件，映射 `navItems`，支持当前态高亮。

```tsx
interface SidebarProps {
  currentPage: PageType; // 当前页面
  onNavigate: (page: PageType) => void; // 导航回调
}
```

#### `TaskCard.tsx`

任务卡片组件，展示单个任务并按截止时间高亮逾期。

```tsx
interface TaskCardProps {
  task: Task; // 任务数据
  onClick?: () => void; // 点击回调
}
```

#### `ResourceCard.tsx`

资源卡片组件，展示资源基本信息；当传入 `tasks` 和 `onLinkToTask` 时，会出现“关联到任务”的下拉菜单。

```tsx
interface ResourceCardProps {
  resource: Resource; // 资源数据
  tasks?: Task[]; // 可关联的任务列表
  onLinkToTask?: (resourceId: number, taskId: number) => Promise<void>; // 关联回调
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

```tsx
interface TiptapEditorProps {
  content: string; // Markdown 格式的内容
  onChange?: (markdown: string) => void; // 内容变化回调，返回 Markdown 格式
  editable?: boolean;
  placeholder?: string;
}
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

---

### `lib/utils.ts`

工具函数库，提供常用辅助函数：

- `cn(...inputs)`：用于合并和条件化 className（基于 clsx + tailwind-merge）

---

### `pages/`

页面组件对应设计文档中的页面与 HUD 窗口。

#### `Dashboard.tsx` (Page A)

智能看板：按 `inbox/todo/doing` 分列渲染 `TaskCard`，顶部状态 + 刷新/生成数据按钮，内嵌 `QuickCapture`，底部显示未分类资源列表（支持下拉关联到任务）。

#### `Workspace.tsx` (Page B)

任务工作台：三栏布局，已集成编辑器与资源预览。

- **左栏**：当前任务详情 + `fetchTaskResources` 拉取的关联资源列表，点击资源在中栏显示。
- **中栏**：资源编辑/预览区
  - 文本资源：使用 `TiptapEditor` 进行 Markdown 编辑（实时保存状态提示）
  - PDF 资源：预览占位（开发中）
  - 图片资源：使用 `react-zoom-pan-pinch` 实现缩放平移预览
    - 滚轮缩放（0.1x - 10x）
    - 鼠标拖拽平移
    - 双击重置视图
    - 工具栏控制（放大/缩小/重置/居中）
    - 优雅的半透明控制栏 + 操作提示
    - 自动路径转换（相对路径 → 完整路径 → Tauri URL）
  - URL 资源：显示内容占位
  - 其他类型：显示文件类型提示
- **右栏**：AI 助手占位（当前任务上下文提示，输入框支持 `@` 引用文件）。
- 未选择任务时显示返回看板的空状态。

```tsx
interface WorkspacePageProps {
  selectedTask: Task | null;
  onBack: () => void;
}
```

#### `Settings.tsx` (Page E)

设置：API Key 输入，本地模型开关与 URL，快捷键展示，关于信息。

#### `HUD.tsx` (Quick Capture HUD)

独立的悬浮输入窗。通过 Tauri hash 路由 `#/hud` 渲染，监听 `hud-focus` 事件聚焦输入，捕获成功后通过 `emit("hud-blur")` 通知后端关闭窗口。使用 `QuickCapture` 组件的 `hud` 变体，应用透明背景 + 毛玻璃效果（backdrop-blur）。

---

### `App.tsx`

主应用入口（主窗口），负责全局状态与页面切换：

- 状态：`currentPage`、`tasks`、`resources`、`loading`、`error`、`selectedTask`、`seeding`。
- 数据加载：`fetchDashboardData` 初始拉取 + `reloadData` 复用。
- 交互处理：
  - `handleCapture`：文本/文件快速捕获，推断文件类型后调用 `quickCapture`。
  - `handleSeed`：生成演示数据。
  - `handleSelectTask`/`handleBackToDashboard`：导航与选中任务。
  - `handleLinkResource`：资源关联后刷新列表（资源从“未分类”消失）。
- 路由：`dashboard`、`workspace`、`settings` 三个视图。

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
        │    ├─ TaskCard / ResourceCard / QuickCapture（含剪贴板支持）
        │    └─ onLinkResource -> linkResource -> Rust
        ├─ WorkspacePage (selectedTask)
        │    ├─ fetchTaskResources -> 获取关联资源
        │    ├─ TiptapEditor（文本编辑，Markdown 双向绑定）
        │    └─ AI Chat 占位（输入框 + 上下文）
        └─ SettingsPage (API Key / 本地模型 / 快捷键 / 关于)
              ▲
              │ state: tasks, resources, currentPage, selectedTask, loading, error, seeding
              │ actions: fetchDashboardData / seedDemoData / linkResource / quickCapture / readClipboard
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
   - 🚧 **PDF 预览**：待实现
7. **保存功能**：文本编辑器的保存功能需要添加 Rust 命令 `update_resource_content`，前端监听 `Ctrl+S` 快捷键触发保存。
8. **剪贴板增强**：可扩展支持复制资源到剪贴板、HTML 格式保留样式等功能。
9. **UI 组件扩展**：如需新增 shadcn/ui 组件，使用 `npx shadcn-ui@latest add [component]` 命令自动生成。
