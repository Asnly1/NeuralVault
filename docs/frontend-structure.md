# 前端项目结构

## 目录总览

```
src/
├── types/
│   └── index.ts          # 类型定义、Schema、常量
├── api/
│   └── index.ts          # Tauri 后端 API 调用函数
├── components/
│   ├── index.ts          # 组件导出入口
│   ├── Sidebar.tsx       # 侧边栏导航组件
│   ├── TaskCard.tsx      # 任务卡片组件
│   ├── ResourceCard.tsx  # 资源卡片组件
│   └── QuickCapture.tsx  # 快速输入组件
├── pages/
│   ├── index.ts          # 页面导出入口
│   ├── Dashboard.tsx     # 智能看板 (Page A)
│   ├── Workspace.tsx     # 任务工作台 (Page B)
│   └── Settings.tsx      # 设置页面 (Page E)
├── App.tsx               # 主入口，路由和状态管理
├── App.css               # 全局样式 (深色主题)
├── main.tsx              # React 入口
└── vite-env.d.ts         # Vite 类型声明
```

---

## 文件说明

### `types/index.ts`

定义所有 TypeScript 类型和 Zod Schema。

**Zod Schema:**

| 导出项            | 说明               |
| ----------------- | ------------------ |
| `taskSchema`      | 任务数据校验       |
| `resourceSchema`  | 资源数据校验       |
| `dashboardSchema` | Dashboard 数据校验 |

**数据类型:**

| 导出项          | 说明               |
| --------------- | ------------------ |
| `Task`          | 任务类型           |
| `Resource`      | 资源类型           |
| `DashboardData` | Dashboard 数据类型 |
| `TaskStatus`    | 任务状态联合类型   |
| `TaskPriority`  | 优先级联合类型     |
| `ResourceType`  | 资源类型联合类型   |
| `PageType`      | 页面类型联合类型   |

**API 请求/响应类型 (对应 Rust `commands.rs`):**

| 导出项               | 对应 Rust 类型       | 说明             |
| -------------------- | -------------------- | ---------------- |
| `CreateTaskRequest`  | `CreateTaskRequest`  | 创建任务请求     |
| `CreateTaskResponse` | `CreateTaskResponse` | 创建任务响应     |
| `CaptureSourceMeta`  | `CaptureSourceMeta`  | 捕获来源元信息   |
| `CaptureRequest`     | `CaptureRequest`     | 快速捕获请求     |
| `CaptureResponse`    | `CaptureResponse`    | 快速捕获响应     |
| `SeedResponse`       | `SeedResponse`       | 生成演示数据响应 |

**常量:**

| 导出项              | 说明                     |
| ------------------- | ------------------------ |
| `priorityConfig`    | 优先级配置（标签、颜色） |
| `resourceTypeIcons` | 资源类型图标映射         |
| `navItems`          | 导航菜单项               |

---

### `api/index.ts`

封装所有 Tauri invoke 调用，使用类型化的请求/响应对象。

| 函数                   | 参数类型            | 返回类型                      | 说明               |
| ---------------------- | ------------------- | ----------------------------- | ------------------ |
| `fetchDashboardData()` | 无                  | `Promise<DashboardData>`      | 获取任务和资源列表 |
| `createTask()`         | `CreateTaskRequest` | `Promise<CreateTaskResponse>` | 创建新任务         |
| `seedDemoData()`       | 无                  | `Promise<SeedResponse>`       | 生成演示数据       |
| `quickCapture()`       | `CaptureRequest`    | `Promise<CaptureResponse>`    | 快速捕获资源       |

---

### `components/`

可复用的 UI 组件。

#### `Sidebar.tsx`

侧边栏导航组件。

```tsx
interface SidebarProps {
  currentPage: PageType; // 当前页面
  onNavigate: (page: PageType) => void; // 导航回调
}
```

#### `TaskCard.tsx`

任务卡片组件，展示单个任务。

```tsx
interface TaskCardProps {
  task: Task; // 任务数据
  onClick?: () => void; // 点击回调
}
```

#### `ResourceCard.tsx`

资源卡片组件，展示单个资源。

```tsx
interface ResourceCardProps {
  resource: Resource; // 资源数据
}
```

#### `QuickCapture.tsx`

快速输入组件，用于创建新任务。

```tsx
interface QuickCaptureProps {
  onCreateTask: (title: string, description: string) => Promise<void>;
  loading: boolean;
}
```

---

### `pages/`

页面组件，每个页面对应设计文档中的一个 Page。

#### `Dashboard.tsx` (Page A)

智能看板页面，包含：

- 任务看板（Inbox / Todo / Doing 三列）
- 快速输入区
- 未分类资源列表

```tsx
interface DashboardPageProps {
  tasks: Task[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onSeed: () => void;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
}
```

#### `Workspace.tsx` (Page B)

任务工作台页面，三栏布局：

- 左栏：上下文区（任务详情 + 关联资源）
- 中栏：执行区（文本编辑器 / PDF 阅读器占位）
- 右栏：ChatBox（AI 助手）

```tsx
interface WorkspacePageProps {
  selectedTask: Task | null;
  onBack: () => void;
}
```

#### `Settings.tsx` (Page E)

设置页面，包含：

- API 配置（OpenAI API Key）
- 本地模型配置（Ollama URL）
- 快捷键设置
- 关于信息

---

### `App.tsx`

主应用入口，负责：

- 全局状态管理（tasks, resources, currentPage, selectedTask）
- 页面路由切换
- 数据加载和错误处理

**状态列表：**

| 状态           | 类型             | 说明                         |
| -------------- | ---------------- | ---------------------------- |
| `currentPage`  | `PageType`       | 当前页面                     |
| `tasks`        | `Task[]`         | 任务列表                     |
| `resources`    | `Resource[]`     | 资源列表                     |
| `loading`      | `boolean`        | 加载状态                     |
| `error`        | `string \| null` | 错误信息                     |
| `selectedTask` | `Task \| null`   | 选中的任务（用于 Workspace） |
| `seeding`      | `boolean`        | 演示数据生成状态             |

---

### `App.css`

全局样式文件，使用 CSS 变量实现深色主题。

**主要 CSS 变量：**

```css
/* 背景色 */
--bg-primary: #0a0e17;
--bg-secondary: #111827;
--bg-tertiary: #1a2234;
--bg-card: #161d2e;

/* 文字色 */
--text-primary: #e8ecf4;
--text-secondary: #94a3b8;
--text-muted: #64748b;

/* 强调色 */
--accent: #4f7cff;

/* 优先级颜色 */
--priority-high: #ff6b6b;
--priority-medium: #fbbf24;
--priority-low: #34d399;
```

---

## 数据流

```
┌─────────────────────────────────────────────────────────┐
│                        App.tsx                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  State: tasks, resources, currentPage, ...       │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│          ┌───────────────┼───────────────┐              │
│          ▼               ▼               ▼              │
│    ┌──────────┐   ┌───────────┐   ┌──────────┐         │
│    │ Dashboard│   │ Workspace │   │ Settings │         │
│    └──────────┘   └───────────┘   └──────────┘         │
│          │               │                              │
│          ▼               ▼                              │
│    ┌──────────────────────────┐                        │
│    │  Components (TaskCard,   │                        │
│    │  ResourceCard, etc.)     │                        │
│    └──────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │     api/index.ts  │
              │  (Tauri invoke)   │
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │   Rust Backend    │
              │  (commands.rs)    │
              └───────────────────┘
```

---

## 页面对应关系

| 设计文档            | 组件文件              | 路由 Key    |
| ------------------- | --------------------- | ----------- |
| Page A - 智能看板   | `pages/Dashboard.tsx` | `dashboard` |
| Page B - 任务工作台 | `pages/Workspace.tsx` | `workspace` |
| Page C - 复盘与脉搏 | 暂未实现 (V1.0 不做)  | -           |
| Page D - 知识宇宙   | 暂未实现 (V1.0 不做)  | -           |
| Page E - 设置       | `pages/Settings.tsx`  | `settings`  |

---

## 后续扩展建议

1. **添加新页面**：在 `pages/` 下创建组件，更新 `pages/index.ts`，在 `App.tsx` 中添加路由
2. **添加新组件**：在 `components/` 下创建，更新 `components/index.ts`
3. **添加新类型**：在 `types/index.ts` 中添加 Schema 和类型导出
4. **添加新 API**：在 `api/index.ts` 中添加函数，对应 `commands.rs` 中的命令
