import { z } from "zod";

// ============================================
// Schema Definitions
// ============================================

// as const: 这个数组里的值是固定死的，永远不会变，也不允许被修改，请把它当作字面量处理，而不是普通的字符串数组
export const taskStatusValues = ["todo", "done"] as const;

export const taskPriorityValues = ["high", "medium", "low"] as const;

export const resourceTypeValues = [
  "text",
  "image",
  "pdf",
  "url",
  "epub",
  "other",
] as const;

export const classificationValues = [
  "unclassified",
  "suggested",
  "linked",
  "ignored",
] as const;

export const taskSchema = z.object({
  task_id: z.number(),
  uuid: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(taskStatusValues),
  done_date: z.coerce.date().nullable(),
  priority: z.enum(taskPriorityValues),
  // coerce: Zod 的“宽容模式”。它会先尝试把输入的数据（可能是字符串、数字）强行转换为 Date 对象，然后再进行校验
  due_date: z.coerce.date().nullable(),
  created_at: z.coerce.date().nullable(),
});

export const resourceSchema = z.object({
  resource_id: z.number(),
  uuid: z.string(),
  display_name: z.string().nullable(),
  file_type: z.enum(resourceTypeValues),
  classification_status: z.enum(classificationValues),
  created_at: z.coerce.date().nullable(),
  content: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
});

export const dashboardSchema = z.object({
  tasks: z.array(taskSchema).default([]),
  resources: z.array(resourceSchema).default([]),
});

// ============================================
// Type Exports
// ============================================

export type Task = z.infer<typeof taskSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type DashboardData = z.infer<typeof dashboardSchema>;
// typeof taskStatusValues: 获取这个JavaScript 变量在 TypeScript 层面对应的类型
// 因为你加了 as const，所以它的类型是： readonly ["todo", "done"]
// [number]: 请给我这个数组里任意数字索引位置上的元素的类型
// 因为数组的索引是数字（0, 1, 2...），所以这就相当于把数组里所有的值拿出来，拼成一个联合类型
// 结果：type TaskStatus = "todo" | "done";
export type TaskStatus = (typeof taskStatusValues)[number];
export type TaskPriority = (typeof taskPriorityValues)[number];
export type ResourceType = (typeof resourceTypeValues)[number];
export type PageType = "dashboard" | "workspace" | "calendar" | "settings";

// ============================================
// Constants
// ============================================

export const priorityConfig: Record<
  TaskPriority,
  { label: string; color: string }
> = {
  high: { label: "高", color: "var(--priority-high)" },
  medium: { label: "中", color: "var(--priority-medium)" },
  low: { label: "低", color: "var(--priority-low)" },
};

export const resourceTypeIcons: Record<ResourceType, string> = {
  text: "📄",
  image: "🖼️",
  pdf: "📕",
  url: "🔗",
  epub: "📖",
  other: "📎",
};

export const navItems: { key: PageType; icon: string; label: string }[] = [
  { key: "dashboard", icon: "◈", label: "看板" },
  { key: "workspace", icon: "⬡", label: "工作台" },
  { key: "calendar", icon: "📅", label: "日历" },
  { key: "settings", icon: "⚙", label: "设置" },
];

// ============================================
// API Request/Response Types (对应 Rust commands.rs)
// ============================================

/**
 * 创建任务请求 (对应 Rust: CreateTaskRequest)
 */
export interface CreateTaskRequest {
  title: string; // 必填：任务标题
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  // 后端接受的是string，所以这里也用string
  due_date?: string;
}

/**
 * 创建任务响应 (对应 Rust: CreateTaskResponse)
 */
export interface CreateTaskResponse {
  task: Task;
}

/**
 * 快速捕获来源元信息 (对应 Rust: CaptureSourceMeta)
 */
export interface CaptureSourceMeta {
  url?: string;
  window_title?: string;
}

/**
 * 快速捕获请求 (对应 Rust: CaptureRequest)
 */
export interface CaptureRequest {
  content?: string;
  display_name?: string;
  file_path?: string;
  file_type?: string;
  source_meta?: CaptureSourceMeta;
}

/**
 * 快速捕获响应 (对应 Rust: CaptureResponse)
 */
export interface CaptureResponse {
  resource_id: number;
  resource_uuid: string;
}

/**
 * 生成演示数据响应 (对应 Rust: SeedResponse)
 */
export interface SeedResponse {
  tasks_created: number;
  resources_created: number;
}

/**
 * 关联资源到任务请求 (对应 Rust: LinkResourceRequest)
 */
export interface LinkResourceRequest {
  task_id: number;
  resource_id: number;
  /** 可见范围: "this" | "subtree" | "global" */
  visibility_scope?: string;
  /** 本地别名，可在任务上下文中给资源起个别名 */
  local_alias?: string;
}

/**
 * 关联/取消关联资源响应 (对应 Rust: LinkResourceResponse)
 */
export interface LinkResourceResponse {
  success: boolean;
}

/**
 * 获取任务关联资源响应 (对应 Rust: TaskResourcesResponse)
 */
export interface TaskResourcesResponse {
  resources: Resource[];
}

// ============================================
// Clipboard Types (对应 Rust: ClipboardContent, ReadClipboardResponse)
// ============================================

/**
 * 剪贴板内容类型 (对应 Rust: ClipboardContent)
 */
export type ClipboardContent =
  | { type: "Image"; data: { file_path: string; file_name: string } }
  | { type: "Files"; data: { paths: string[] } }
  | { type: "Text"; data: { content: string } }
  | { type: "Html"; data: { content: string; plain_text: string | null } }
  | { type: "Empty" };

/**
 * 读取剪贴板响应 (对应 Rust: ReadClipboardResponse)
 */
export interface ReadClipboardResponse {
  content: ClipboardContent;
}

// ============================================
// WebSocket Progress Types (对应 Python: PythonMessage)
// ============================================

/**
 * 资源处理阶段
 */
export const processingStageValues = ["todo", "chunking", "embedding", "done"] as const;
export type ProcessingStage = (typeof processingStageValues)[number];

/**
 * WebSocket 进度消息 (对应 Python: PythonMessage)
 */
export interface PythonProgress {
  resource_id: number;
  event: "ingest" | "decompose" | "tag" | "report";
  status: ProcessingStage;
  percentage?: number;
  error?: string;
}
