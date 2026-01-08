import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  dashboardSchema,
  nodeRecordSchema,
  type NodeRecord,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type CaptureRequest,
  type CaptureResponse,
  type LinkNodesRequest,
  type LinkNodesResponse,
  type NodeListResponse,
  type ReadClipboardResponse,
  type ReviewStatus,
  type RelationType,
  type AIConfigStatus,
  type SetApiKeyRequest,
  type SetDefaultModelRequest,
  type SendChatRequest,
  type ChatStreamAck,
  type CreateChatSessionRequest,
  type CreateChatSessionResponse,
  type ListChatSessionsRequest,
  type ChatSession,
  type UpdateChatSessionRequest,
  type DeleteChatSessionRequest,
  type CreateChatMessageRequest,
  type CreateChatMessageResponse,
  type ChatMessagePayload,
  type UpdateChatMessageRequest,
  type DeleteChatMessageRequest,
  type AddMessageAttachmentsRequest,
  type RemoveMessageAttachmentRequest,
  type SetSessionBindingsRequest,
  type SemanticSearchResult,
  type DashboardData,
} from "../types";

// ============================================
// Dashboard API
// ============================================

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const raw = await invoke("get_dashboard");
  return dashboardSchema.parse(raw);
};

// ============================================
// Node API (通用节点操作)
// ============================================

/** 获取所有收藏节点 */
export const fetchPinnedNodes = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_pinned_nodes");
  return z.array(nodeRecordSchema).parse(raw);
};

/** 获取所有待审核节点 */
export const fetchUnreviewedNodes = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_unreviewed_nodes");
  return z.array(nodeRecordSchema).parse(raw);
};

/** 更新节点收藏状态 */
export const updateNodePinned = async (
  nodeId: number,
  isPinned: boolean
): Promise<void> => {
  return await invoke("update_node_pinned", { nodeId, isPinned });
};

/** 更新节点审核状态 */
export const updateNodeReviewStatus = async (
  nodeId: number,
  reviewStatus: ReviewStatus
): Promise<void> => {
  return await invoke("update_node_review_status", { nodeId, reviewStatus });
};

/** 链接两个节点 */
export const linkNodes = async (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: RelationType
): Promise<LinkNodesResponse> => {
  return await invoke("link_nodes_command", {
    payload: {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation_type: relationType,
    } as LinkNodesRequest,
  });
};

/** 取消链接两个节点 */
export const unlinkNodes = async (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: RelationType
): Promise<LinkNodesResponse> => {
  return await invoke("unlink_nodes_command", {
    payload: {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation_type: relationType,
    } as LinkNodesRequest,
  });
};

/** 获取目标节点列表（通过关系类型） */
export const listTargetNodes = async (
  sourceNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> => {
  return await invoke("list_target_nodes_command", { sourceNodeId, relationType });
};

/** 获取源节点列表（通过关系类型） */
export const listSourceNodes = async (
  targetNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> => {
  return await invoke("list_source_nodes_command", { targetNodeId, relationType });
};

// ============================================
// Task API
// ============================================

export const createTask = async (
  request: CreateTaskRequest
): Promise<CreateTaskResponse> => {
  return await invoke("create_task", { payload: request });
};

export const softDeleteTask = async (nodeId: number): Promise<void> => {
  return await invoke("soft_delete_task_command", { nodeId });
};

export const hardDeleteTask = async (nodeId: number): Promise<void> => {
  return await invoke("hard_delete_task_command", { nodeId });
};

export const markTaskAsDone = async (nodeId: number): Promise<void> => {
  return await invoke("mark_task_as_done_command", { nodeId });
};

export const markTaskAsTodo = async (nodeId: number): Promise<void> => {
  return await invoke("mark_task_as_todo_command", { nodeId });
};

export const updateTaskPriority = async (
  nodeId: number,
  priority: string
): Promise<void> => {
  return await invoke("update_task_priority_command", { nodeId, priority });
};

export const updateTaskDueDate = async (
  nodeId: number,
  dueDate: string | null
): Promise<void> => {
  return await invoke("update_task_due_date_command", { nodeId, dueDate });
};

export const updateTaskTitle = async (
  nodeId: number,
  title: string
): Promise<void> => {
  return await invoke("update_task_title_command", { nodeId, title });
};

export const updateTaskDescription = async (
  nodeId: number,
  description: string | null
): Promise<void> => {
  return await invoke("update_task_description_command", { nodeId, description });
};

export const fetchTasksByDate = async (date: string): Promise<NodeRecord[]> => {
  const raw = await invoke("get_tasks_by_date", { date });
  return z.array(nodeRecordSchema).parse(raw);
};

export const fetchAllTasks = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("get_all_tasks");
  return z.array(nodeRecordSchema).parse(raw);
};

export const fetchActiveTasks = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("get_active_tasks");
  return z.array(nodeRecordSchema).parse(raw);
};

// ============================================
// Resource API
// ============================================

export const quickCapture = async (
  request: CaptureRequest
): Promise<CaptureResponse> => {
  return await invoke("capture_resource", { payload: request });
};

export const fetchAllResources = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("get_all_resources");
  return z.array(nodeRecordSchema).parse(raw);
};

export const getResourceById = async (nodeId: number): Promise<NodeRecord> => {
  const raw = await invoke("get_resource_by_id", { nodeId });
  return nodeRecordSchema.parse(raw);
};

export const softDeleteResource = async (nodeId: number): Promise<void> => {
  return await invoke("soft_delete_resource_command", { nodeId });
};

export const hardDeleteResource = async (nodeId: number): Promise<void> => {
  return await invoke("hard_delete_resource_command", { nodeId });
};

export const updateResourceContent = async (
  nodeId: number,
  content: string
): Promise<void> => {
  return await invoke("update_resource_content_command", { nodeId, content });
};

export const updateResourceTitle = async (
  nodeId: number,
  title: string
): Promise<void> => {
  return await invoke("update_resource_title_command", { nodeId, title });
};

/** 获取任务关联的资源 */
export const fetchTaskResources = async (taskNodeId: number): Promise<NodeRecord[]> => {
  const response = await listTargetNodes(taskNodeId, "contains");
  return response.nodes.filter((n) => n.node_type === "resource");
};

// ============================================
// Topic API
// ============================================

export const createTopic = async (
  title: string,
  summary?: string
): Promise<{ node: NodeRecord }> => {
  return await invoke("create_topic", { payload: { title, summary } });
};

export const fetchAllTopics = async (): Promise<NodeRecord[]> => {
  const raw = await invoke("list_topics_command");
  return z.array(nodeRecordSchema).parse(raw);
};

export const getTopic = async (nodeId: number): Promise<NodeRecord> => {
  const raw = await invoke("get_topic_command", { topicId: nodeId });
  return nodeRecordSchema.parse(raw);
};

export const updateTopicTitle = async (
  nodeId: number,
  title: string
): Promise<void> => {
  return await invoke("update_topic_title_command", { topicId: nodeId, title });
};

export const updateTopicSummary = async (
  nodeId: number,
  summary: string | null
): Promise<void> => {
  return await invoke("update_topic_summary_command", { topicId: nodeId, summary });
};

export const updateTopicFavourite = async (
  nodeId: number,
  isFavourite: boolean
): Promise<void> => {
  return await invoke("update_topic_favourite_command", { topicId: nodeId, isFavourite });
};

// ============================================
// HUD API
// ============================================

export const toggleHUD = async (): Promise<void> => {
  return await invoke("toggle_hud");
};

export const hideHUD = async (): Promise<void> => {
  return await invoke("hide_hud");
};

// ============================================
// Clipboard API
// ============================================

export const readClipboard = async (): Promise<ReadClipboardResponse> => {
  return await invoke("read_clipboard");
};

// ============================================
// File System API
// ============================================

export const getAssetsPath = async (): Promise<string> => {
  return await invoke("get_assets_path");
};

// ============================================
// AI Configuration API
// ============================================

export const getAIConfigStatus = async (): Promise<AIConfigStatus> => {
  return await invoke("get_ai_config_status");
};

export const saveApiKey = async (request: SetApiKeyRequest): Promise<void> => {
  return await invoke("save_api_key", { request });
};

export const removeApiKey = async (provider: string): Promise<void> => {
  return await invoke("remove_api_key", { provider });
};

export const setDefaultModel = async (
  request: SetDefaultModelRequest
): Promise<void> => {
  return await invoke("set_default_model", { request });
};

export const sendChatMessage = async (
  request: SendChatRequest
): Promise<ChatStreamAck> => {
  return await invoke("send_chat_message", { request });
};

// ============================================
// Chat Session / Message API
// ============================================

export const createChatSession = async (
  request: CreateChatSessionRequest
): Promise<CreateChatSessionResponse> => {
  return await invoke("create_chat_session", { payload: request });
};

export const getChatSession = async (sessionId: number): Promise<ChatSession> => {
  return await invoke("get_chat_session", { sessionId });
};

export const listChatSessions = async (
  request: ListChatSessionsRequest
): Promise<ChatSession[]> => {
  return await invoke("list_chat_sessions", { payload: request });
};

export const updateChatSession = async (
  request: UpdateChatSessionRequest
): Promise<void> => {
  return await invoke("update_chat_session_command", { payload: request });
};

export const deleteChatSession = async (
  request: DeleteChatSessionRequest
): Promise<void> => {
  return await invoke("delete_chat_session", { payload: request });
};

export const createChatMessage = async (
  request: CreateChatMessageRequest
): Promise<CreateChatMessageResponse> => {
  return await invoke("create_chat_message", { payload: request });
};

export const listChatMessages = async (
  sessionId: number
): Promise<ChatMessagePayload[]> => {
  return await invoke("list_chat_messages_command", { sessionId });
};

export const updateChatMessage = async (
  request: UpdateChatMessageRequest
): Promise<void> => {
  return await invoke("update_chat_message", { payload: request });
};

export const deleteChatMessage = async (
  request: DeleteChatMessageRequest
): Promise<void> => {
  return await invoke("delete_chat_message", { payload: request });
};

export const addMessageAttachments = async (
  request: AddMessageAttachmentsRequest
): Promise<void> => {
  return await invoke("add_message_attachments", { payload: request });
};

export const removeMessageAttachment = async (
  request: RemoveMessageAttachmentRequest
): Promise<void> => {
  return await invoke("remove_message_attachment", { payload: request });
};

export const setSessionBindings = async (
  request: SetSessionBindingsRequest
): Promise<void> => {
  return await invoke("set_session_bindings_command", { payload: request });
};

// ============================================
// Search API
// ============================================

export const searchSemantic = async (
  query: string,
  scopeNodeIds?: number[],
  embeddingType?: "summary" | "content",
  limit?: number
): Promise<SemanticSearchResult[]> => {
  return await invoke("search_semantic", {
    query,
    scopeNodeIds,
    embeddingType,
    limit,
  });
};

export const searchKeyword = async (
  query: string,
  nodeType?: "topic" | "task" | "resource",
  limit?: number
): Promise<NodeRecord[]> => {
  return await invoke("search_keyword", {
    query,
    nodeType,
    limit,
  });
};

// Re-export types for convenience
export type { NodeRecord, SemanticSearchResult };
