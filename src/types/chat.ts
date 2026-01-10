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
// Chat Message Types
// ============================================

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface ChatMessagePayload {
  message_id: number;
  user_content: string;
  assistant_content?: string | null;
  attachments: { node_id: number }[];
  usage?: ChatUsage;
  created_at?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  attachments?: { node_id: number }[];
  usage?: ChatUsage;
}

export interface SendChatRequest {
  session_id: number;
  provider: string;
  model: string;
  content: string;
  images?: number[];
  files?: number[];
  thinking_effort?: ThinkingEffort;
}

export interface ChatStreamAck {
  ok: boolean;
}

// ============================================
// Chat Session Types
// ============================================

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

// ============================================
// Chat Message CRUD Types
// ============================================

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

// ============================================
// Model Selection Types
// ============================================

export interface ModelOption {
  provider: AIProvider;
  model_id: string;
  display_name: string;
}
