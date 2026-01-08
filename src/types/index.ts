import { z } from "zod";

// ============================================
// Node/Edge 核心类型 (对应 Rust db/types.rs)
// ============================================

export const nodeTypeValues = ["topic", "task", "resource"] as const;
export type NodeType = (typeof nodeTypeValues)[number];

export const taskStatusValues = ["todo", "done", "cancelled"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const taskPriorityValues = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof taskPriorityValues)[number];

export const resourceSubtypeValues = ["text", "image", "pdf", "url", "epub", "other"] as const;
export type ResourceSubtype = (typeof resourceSubtypeValues)[number];

export const reviewStatusValues = ["unreviewed", "reviewed", "rejected"] as const;
export type ReviewStatus = (typeof reviewStatusValues)[number];

export const syncStatusValues = ["pending", "synced", "dirty", "error"] as const;
export type SyncStatus = (typeof syncStatusValues)[number];

export const processingStageValues = ["todo", "chunking", "embedding", "done"] as const;
export type ProcessingStage = (typeof processingStageValues)[number];

export const relationTypeValues = ["contains", "related_to"] as const;
export type RelationType = (typeof relationTypeValues)[number];

// NodeRecord Schema (对应 Rust NodeRecord)
export const nodeRecordSchema = z.object({
  node_id: z.number(),
  uuid: z.string(),
  user_id: z.number(),
  title: z.string(),
  summary: z.string().nullable(),
  node_type: z.enum(nodeTypeValues),
  task_status: z.enum(taskStatusValues).nullable(),
  priority: z.enum(taskPriorityValues).nullable(),
  due_date: z.coerce.date().nullable(),
  done_date: z.coerce.date().nullable(),
  file_hash: z.string().nullable(),
  file_path: z.string().nullable(),
  file_content: z.string().nullable(),
  user_note: z.string().nullable(),
  resource_subtype: z.enum(resourceSubtypeValues).nullable(),
  source_meta: z.string().nullable(),
  indexed_hash: z.string().nullable(),
  processing_hash: z.string().nullable(),
  sync_status: z.enum(syncStatusValues),
  last_indexed_at: z.string().nullable(),
  last_error: z.string().nullable(),
  processing_stage: z.enum(processingStageValues),
  review_status: z.enum(reviewStatusValues),
  is_pinned: z.boolean(),
  pinned_at: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
  is_deleted: z.boolean(),
  deleted_at: z.string().nullable(),
});

export type NodeRecord = z.infer<typeof nodeRecordSchema>;

// 兼容性别名：渐进式迁移，后续可移除
/** @deprecated 使用 NodeRecord 替代，通过 node_id 访问 */
export type Task = NodeRecord & {
  // 为了向后兼容，添加 task_id 别名（必需，由 API 层填充）
  task_id: number;
  // 旧代码使用 status 而非 task_status（必需，由 API 层填充）
  status: TaskStatus;
  // 旧代码使用 description 而非 summary
  description: string | null;
};

/** @deprecated 使用 NodeRecord 替代，通过 node_id 访问 */
export type Resource = NodeRecord & {
  // 为了向后兼容，添加 resource_id 别名（必需，由 API 层填充）
  resource_id: number;
  // 旧代码使用 content 而非 file_content
  content: string | null;
  // 旧代码使用 classification_status（必需，由 API 层填充）
  classification_status: string;
  // 旧代码使用 display_name
  display_name: string | null;
  // 旧代码使用 file_type 而非 resource_subtype（必需，由 API 层填充）
  file_type: ResourceSubtype | null;
};

// EdgeRecord Schema (对应 Rust EdgeRecord)
export const edgeRecordSchema = z.object({
  edge_id: z.number(),
  source_node_id: z.number(),
  target_node_id: z.number(),
  relation_type: z.enum(relationTypeValues),
  confidence_score: z.number().nullable(),
  is_manual: z.boolean(),
  created_at: z.coerce.date().nullable(),
});

export type EdgeRecord = z.infer<typeof edgeRecordSchema>;

// Dashboard Schema
export const dashboardSchema = z.object({
  tasks: z.array(nodeRecordSchema).default([]),
  resources: z.array(nodeRecordSchema).default([]),
});

export type DashboardData = z.infer<typeof dashboardSchema>;

// ============================================
// 页面与导航
// ============================================

export type PageType = "dashboard" | "workspace" | "warehouse" | "calendar" | "settings";

export const navItems: { key: PageType; icon: string; label: string }[] = [
  { key: "dashboard", icon: "◈", label: "看板" },
  { key: "warehouse", icon: "📦", label: "仓库" },
  { key: "workspace", icon: "⬡", label: "工作台" },
  { key: "calendar", icon: "📅", label: "日历" },
  { key: "settings", icon: "⚙", label: "设置" },
];

// ============================================
// 常量配置
// ============================================

export const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "高", color: "var(--priority-high)" },
  medium: { label: "中", color: "var(--priority-medium)" },
  low: { label: "低", color: "var(--priority-low)" },
};

export const resourceSubtypeIcons: Record<ResourceSubtype, string> = {
  text: "📄",
  image: "🖼️",
  pdf: "📕",
  url: "🔗",
  epub: "📖",
  other: "📎",
};

/** @deprecated 使用 resourceSubtypeIcons 替代 */
export const resourceTypeIcons = resourceSubtypeIcons;

export const nodeTypeIcons: Record<NodeType, string> = {
  topic: "🏷️",
  task: "☑️",
  resource: "📄",
};

// ============================================
// API Request/Response Types
// ============================================

/** 创建任务请求 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
}

/** 创建任务响应 */
export interface CreateTaskResponse {
  node: NodeRecord;
}

/** 快速捕获来源元信息 */
export interface CaptureSourceMeta {
  url?: string;
  window_title?: string;
  process_name?: string;
  captured_at?: string;
}

/** 快速捕获请求 */
export interface CaptureRequest {
  content?: string;
  title?: string;
  file_path?: string;
  file_type?: string;
  source_meta?: CaptureSourceMeta;
}

/** 快速捕获响应 */
export interface CaptureResponse {
  node_id: number;
  node_uuid: string;
}

/** 链接节点请求 */
export interface LinkNodesRequest {
  source_node_id: number;
  target_node_id: number;
  relation_type: RelationType;
  confidence_score?: number;
  is_manual?: boolean;
}

/** 链接节点响应 */
export interface LinkNodesResponse {
  success: boolean;
}

/** 节点列表响应 */
export interface NodeListResponse {
  nodes: NodeRecord[];
}

// ============================================
// Clipboard Types
// ============================================

export type ClipboardContent =
  | { type: "Image"; data: { file_path: string; file_name: string } }
  | { type: "Files"; data: { paths: string[] } }
  | { type: "Text"; data: { content: string } }
  | { type: "Html"; data: { content: string; plain_text: string | null } }
  | { type: "Empty" };

export interface ReadClipboardResponse {
  content: ClipboardContent;
}

// ============================================
// Ingest Progress Types
// ============================================

export interface IngestProgress {
  node_id: number;
  status: ProcessingStage;
  percentage?: number;
  error?: string;
}

// ============================================
// Search Types
// ============================================

export interface SemanticSearchResult {
  node_id: number;
  chunk_index: number;
  chunk_text: string;
  score: number;
  page_number?: number;
}

// ============================================
// AI Provider Types
// ============================================

export const aiProviderValues = ["openai", "anthropic", "gemini", "grok", "deepseek", "qwen"] as const;
export type AIProvider = (typeof aiProviderValues)[number];

export const thinkingEffortValues = ["none", "low", "high"] as const;
export type ThinkingEffort = (typeof thinkingEffortValues)[number];

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
    defaultBaseUrl: null,
    models: [{ id: "gpt-5.2-2025-12-11", name: "GPT-5.2" }],
  },
  anthropic: {
    name: "Claude",
    icon: "claude-color.svg",
    defaultBaseUrl: null,
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    ],
  },
  gemini: {
    name: "Gemini",
    icon: "gemini-color.svg",
    defaultBaseUrl: null,
    models: [
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
    ],
  },
  grok: {
    name: "Grok",
    icon: "grok.svg",
    defaultBaseUrl: null,
    models: [
      { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 Reasoning" },
      { id: "grok-4-1-fast-non-reasoning", name: "Grok 4.1 Non-Reasoning" },
    ],
  },
  deepseek: {
    name: "Deepseek",
    icon: "deepseek-color.svg",
    defaultBaseUrl: "https://api.deepseek.com",
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
      { id: "qwen3-max-preview", name: "Qwen 3 Max" },
      { id: "qwen-plus", name: "Qwen 3 Plus" },
    ],
  },
};

// ============================================
// AI Configuration Types
// ============================================

export interface AIProviderStatus {
  has_key: boolean;
  enabled: boolean;
  base_url: string | null;
}

export interface AIConfigStatus {
  providers: Record<string, AIProviderStatus>;
  default_provider: string | null;
  default_model: string | null;
}

export interface SetApiKeyRequest {
  provider: string;
  api_key: string;
  base_url?: string;
}

export interface SetDefaultModelRequest {
  provider: string;
  model: string;
}

// ============================================
// Chat Types
// ============================================

export interface ChatMessagePayload {
  message_id: number;
  user_content: string;
  assistant_content?: string | null;
  attachments: { node_id: number }[];
  usage?: ChatUsage;
  created_at?: string;
}

export interface SendChatRequest {
  session_id: number;
  provider: string;
  model: string;
  task_type: string;
  content: string;
  images?: number[];
  files?: number[];
  thinking_effort?: ThinkingEffort;
}

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface ChatStreamAck {
  ok: boolean;
}

export interface ChatSession {
  session_id: number;
  node_id?: number | null;
  session_type: "temporary" | "persistent";
  title?: string | null;
  summary?: string | null;
  chat_model?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_deleted: boolean;
  deleted_at?: string | null;
  user_id: number;
}

export interface CreateChatSessionRequest {
  node_id?: number;
  session_type?: "temporary" | "persistent";
  title?: string;
  summary?: string;
  chat_model?: string;
  context_node_ids?: number[];
  binding_type?: "primary" | "implicit";
}

export interface CreateChatSessionResponse {
  session_id: number;
}

export interface ListChatSessionsRequest {
  node_id?: number;
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
  user_content: string;
  assistant_content?: string;
  attachment_node_ids?: number[];
}

export interface CreateChatMessageResponse {
  message_id: number;
}

export interface UpdateChatMessageRequest {
  message_id: number;
  user_content?: string;
  assistant_content?: string;
}

export interface DeleteChatMessageRequest {
  message_id: number;
}

export interface AddMessageAttachmentsRequest {
  message_id: number;
  node_ids: number[];
}

export interface RemoveMessageAttachmentRequest {
  message_id: number;
  node_id: number;
}

export interface SetSessionBindingsRequest {
  session_id: number;
  node_ids: number[];
  binding_type: "primary" | "implicit";
}

export interface ModelOption {
  provider: AIProvider;
  model_id: string;
  display_name: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  attachments?: { node_id: number }[];
  usage?: ChatUsage;
}

// ============================================
// Input Mode Types (Capture/Chat)
// ============================================

export type InputMode = "capture" | "chat";
