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
// Ingest Progress Types (对应 Python: IngestProgress)
// ============================================

/**
 * 资源处理阶段
 */
export const processingStageValues = ["todo", "chunking", "embedding", "done"] as const;
export type ProcessingStage = (typeof processingStageValues)[number];

/**
 * 进度消息 (对应 Python: IngestProgress)
 */
export interface IngestProgress {
  resource_id: number;
  status: ProcessingStage;
  percentage?: number;
  error?: string;
}

// ============================================
// AI Provider Types
// ============================================

export const aiProviderValues = [
  "openai",
  "anthropic",
  "gemini",
  "grok",
  "deepseek",
  "qwen",
] as const;

export type AIProvider = (typeof aiProviderValues)[number];

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ProviderInfo {
  name: string;
  icon: string;
  defaultBaseUrl: string | null;
  models: ModelInfo[];
}

export const AI_PROVIDER_INFO: Record<AIProvider, ProviderInfo> = {
  openai: {
    name: "ChatGPT",
    icon: "openai.svg",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
  },
  anthropic: {
    name: "Claude",
    icon: "claude-color.svg",
    defaultBaseUrl: null,
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
    ],
  },
  gemini: {
    name: "Gemini",
    icon: "gemini-color.svg",
    defaultBaseUrl: null,
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    ],
  },
  grok: {
    name: "Grok",
    icon: "grok.svg",
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [{ id: "grok-beta", name: "Grok Beta" }],
  },
  deepseek: {
    name: "Deepseek",
    icon: "deepseek-color.svg",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "Deepseek Chat" },
      { id: "deepseek-reasoner", name: "Deepseek Reasoner" },
    ],
  },
  qwen: {
    name: "Qwen",
    icon: "qwen-color.svg",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen-turbo", name: "Qwen Turbo" },
      { id: "qwen-plus", name: "Qwen Plus" },
      { id: "qwen-max", name: "Qwen Max" },
    ],
  },
};

// ============================================
// AI Configuration Types (对应 Rust: ai_config.rs)
// ============================================

/**
 * Provider 状态信息（不包含明文 key）
 */
export interface AIProviderStatus {
  has_key: boolean;
  enabled: boolean;
  base_url: string | null;
}

/**
 * AI 配置状态响应
 */
export interface AIConfigStatus {
  providers: Record<string, AIProviderStatus>;
  default_provider: string | null;
  default_model: string | null;
}

/**
 * 保存 API Key 请求
 */
export interface SetApiKeyRequest {
  provider: string;
  api_key: string;
  base_url?: string;
}

/**
 * 设置默认模型请求
 */
export interface SetDefaultModelRequest {
  provider: string;
  model: string;
}

/**
 * 聊天消息
 */
export interface ChatMessagePayload {
  message_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: { resource_id: number }[];
  created_at?: string;
}

/**
 * 发送聊天请求
 */
export interface SendChatRequest {
  session_id: number;
  provider: string;
  model: string;
  task_type: string;
  content: string;
  images?: number[];
  files?: number[];
}

/**
 * 聊天响应
 */
export interface ChatStreamAck {
  ok: boolean;
}

export interface ChatSession {
  session_id: number;
  session_type: "task" | "resource";
  task_id?: number | null;
  resource_id?: number | null;
  title?: string | null;
  summary?: string | null;
  chat_model?: string | null;
  created_at?: string | null;
  is_deleted: boolean;
  deleted_at?: string | null;
  user_id: number;
}

export interface CreateChatSessionRequest {
  session_type: "task" | "resource";
  task_id?: number;
  resource_id?: number;
  title?: string;
  summary?: string;
  chat_model?: string;
}

export interface CreateChatSessionResponse {
  session_id: number;
}

export interface ListChatSessionsRequest {
  session_type: "task" | "resource";
  task_id?: number;
  resource_id?: number;
  include_deleted?: boolean;
}

export interface UpdateChatSessionRequest {
  session_id: number;
  title?: string;
  summary?: string;
  chat_model?: string;
}

export interface DeleteChatSessionRequest {
  session_id: number;
}

export interface CreateChatMessageRequest {
  session_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  ref_resource_id?: number;
  ref_chunk_id?: number;
  attachment_resource_ids?: number[];
}

export interface CreateChatMessageResponse {
  message_id: number;
}

export interface UpdateChatMessageRequest {
  message_id: number;
  content: string;
}

export interface DeleteChatMessageRequest {
  message_id: number;
}

export interface AddMessageAttachmentsRequest {
  message_id: number;
  resource_ids: number[];
}

export interface RemoveMessageAttachmentRequest {
  message_id: number;
  resource_id: number;
}

/**
 * 模型选项（用于 UI 显示）
 */
export interface ModelOption {
  provider: AIProvider;
  model_id: string;
  display_name: string;
}

/**
 * 聊天消息（带时间戳，用于 UI 显示）
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  attachments?: { resource_id: number }[];
}
