// ============================================
// API Client
// ============================================
export { apiCall, apiCallVoid, apiCallArray, ApiError, ApiValidationError } from "./client";

// ============================================
// System API (Dashboard, HUD, Clipboard, Assets)
// ============================================
export { fetchDashboardData, toggleHUD, hideHUD, readClipboard, getAssetsPath } from "./system";

// ============================================
// Node API (通用节点操作)
// ============================================
export {
  fetchPinnedNodes,
  fetchUnreviewedNodes,
  updateNodePinned,
  updateNodeReviewStatus,
  linkNodes,
  unlinkNodes,
  listTargetNodes,
  listSourceNodes,
} from "./node";

// ============================================
// Task API
// ============================================
export {
  createTask,
  softDeleteTask,
  hardDeleteTask,
  markTaskAsDone,
  markTaskAsTodo,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskTitle,
  updateTaskDescription,
  fetchTasksByDate,
  fetchAllTasks,
  fetchActiveTasks,
} from "./task";

// ============================================
// Resource API
// ============================================
export {
  quickCapture,
  fetchAllResources,
  getResourceById,
  softDeleteResource,
  hardDeleteResource,
  updateResourceContent,
  updateResourceTitle,
  updateResourceUserNote,
  fetchTaskResources,
  processPendingResources,
} from "./resource";

// ============================================
// Topic API
// ============================================
export {
  createTopic,
  fetchAllTopics,
  getTopic,
  updateTopicTitle,
  updateTopicSummary,
  updateTopicFavourite,
} from "./topic";

// ============================================
// Chat & AI API
// ============================================
export {
  getAIConfigStatus,
  saveApiKey,
  removeApiKey,
  setProcessingProviderModel,
  setClassificationMode,
  sendChatMessage,
  createChatSession,
  getChatSession,
  listChatSessions,
  updateChatSession,
  deleteChatSession,
  createChatMessage,
  listChatMessages,
  updateChatMessage,
  deleteChatMessage,
  addMessageAttachments,
  removeMessageAttachment,
  setSessionBindings,
} from "./chat";

// ============================================
// Search API
// ============================================
export { searchSemantic, searchKeyword, warmupEmbedding } from "./search";

// Re-export types for convenience
export type { NodeRecord, SemanticSearchResult } from "../types";
