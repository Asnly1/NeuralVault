// ============================================
// Node/Edge 核心类型
// ============================================
export {
  // 枚举值
  nodeTypeValues,
  taskStatusValues,
  taskPriorityValues,
  resourceSubtypeValues,
  reviewStatusValues,
  embeddingStatusValues,
  processingStageValues,
  relationTypeValues,
  // Schemas
  sourceMetaSchema,
  nodeRecordSchema,
  edgeRecordSchema,
  edgeWithNodeSchema,
  dashboardSchema,
} from "./node";

export type {
  NodeType,
  TaskStatus,
  TaskPriority,
  ResourceSubtype,
  ReviewStatus,
  EmbeddingStatus,
  ProcessingStage,
  RelationType,
  SourceMeta,
  NodeRecord,
  EdgeRecord,
  EdgeWithNode,
  DashboardData,
  IngestProgress,
  NodeSearchSummary,
  SemanticSearchResult,
} from "./node";

// ============================================
// API Request/Response Types
// ============================================
export type {
  CreateTaskRequest,
  CreateTaskResponse,
  CaptureSourceMeta,
  CaptureRequest,
  CaptureResponse,
  LinkNodesRequest,
  LinkNodesResponse,
  NodeListResponse,
  ClipboardContent,
  ReadClipboardResponse,
} from "./api";

// ============================================
// Chat & AI Types
// ============================================
export {
  aiProviderValues,
  thinkingEffortValues,
} from "./chat";

export type {
  AIProvider,
  ThinkingEffort,
  ClassificationMode,
  ModelInfo,
  ProviderInfo,
  AIProviderStatus,
  AIConfigStatus,
  SetApiKeyRequest,
  SetProcessingProviderModelRequest,
  SetClassificationModeRequest,
  ChatUsage,
  ChatMessagePayload,
  ChatMessage,
  RagScope,
  SendChatRequest,
  ChatStreamAck,
  ChatSession,
  CreateChatSessionRequest,
  CreateChatSessionResponse,
  ListChatSessionsRequest,
  UpdateChatSessionRequest,
  DeleteChatSessionRequest,
  CreateChatMessageRequest,
  CreateChatMessageResponse,
  UpdateChatMessageRequest,
  DeleteChatMessageRequest,
  AddMessageAttachmentsRequest,
  RemoveMessageAttachmentRequest,
  SetSessionBindingsRequest,
  ModelOption,
} from "./chat";

// ============================================
// 常量与配置
// ============================================
export {
  navItems,
  priorityConfig,
  resourceSubtypeIcons,
  nodeTypeIcons,
  AI_PROVIDER_INFO,
} from "./constants";

export type { PageType, InputMode } from "./constants";
