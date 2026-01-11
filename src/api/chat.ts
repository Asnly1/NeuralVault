import { apiCall, apiCallVoid } from "./client";
import type {
  AIConfigStatus,
  SetApiKeyRequest,
  SetDefaultModelRequest,
  SendChatRequest,
  ChatStreamAck,
  CreateChatSessionRequest,
  CreateChatSessionResponse,
  ListChatSessionsRequest,
  ChatSession,
  UpdateChatSessionRequest,
  DeleteChatSessionRequest,
  CreateChatMessageRequest,
  CreateChatMessageResponse,
  ChatMessagePayload,
  UpdateChatMessageRequest,
  DeleteChatMessageRequest,
  AddMessageAttachmentsRequest,
  RemoveMessageAttachmentRequest,
  SetSessionBindingsRequest,
  SetClassificationModeRequest,
} from "../types";

// ============================================
// AI Configuration
// ============================================

export const getAIConfigStatus = (): Promise<AIConfigStatus> =>
  apiCall("get_ai_config_status");

export const saveApiKey = (request: SetApiKeyRequest): Promise<void> =>
  apiCallVoid("save_api_key", { request });

export const removeApiKey = (provider: string): Promise<void> =>
  apiCallVoid("remove_api_key", { provider });

export const setDefaultModel = (request: SetDefaultModelRequest): Promise<void> =>
  apiCallVoid("set_default_model", { request });

export const setClassificationMode = (request: SetClassificationModeRequest): Promise<void> =>
  apiCallVoid("set_classification_mode", { request });

// ============================================
// Chat Streaming
// ============================================

export const sendChatMessage = (request: SendChatRequest): Promise<ChatStreamAck> =>
  apiCall("send_chat_message", { request });

// ============================================
// Chat Session CRUD
// ============================================

export const createChatSession = (
  request: CreateChatSessionRequest
): Promise<CreateChatSessionResponse> =>
  apiCall("create_chat_session", { payload: request });

export const getChatSession = (sessionId: number): Promise<ChatSession> =>
  apiCall("get_chat_session", { sessionId });

export const listChatSessions = (request: ListChatSessionsRequest): Promise<ChatSession[]> =>
  apiCall("list_chat_sessions", { payload: request });

export const updateChatSession = (request: UpdateChatSessionRequest): Promise<void> =>
  apiCallVoid("update_chat_session_command", { payload: request });

export const deleteChatSession = (request: DeleteChatSessionRequest): Promise<void> =>
  apiCallVoid("delete_chat_session", { payload: request });

// ============================================
// Chat Message CRUD
// ============================================

export const createChatMessage = (
  request: CreateChatMessageRequest
): Promise<CreateChatMessageResponse> =>
  apiCall("create_chat_message", { payload: request });

export const listChatMessages = (sessionId: number): Promise<ChatMessagePayload[]> =>
  apiCall("list_chat_messages_command", { sessionId });

export const updateChatMessage = (request: UpdateChatMessageRequest): Promise<void> =>
  apiCallVoid("update_chat_message", { payload: request });

export const deleteChatMessage = (request: DeleteChatMessageRequest): Promise<void> =>
  apiCallVoid("delete_chat_message", { payload: request });

// ============================================
// Message Attachments
// ============================================

export const addMessageAttachments = (request: AddMessageAttachmentsRequest): Promise<void> =>
  apiCallVoid("add_message_attachments", { payload: request });

export const removeMessageAttachment = (request: RemoveMessageAttachmentRequest): Promise<void> =>
  apiCallVoid("remove_message_attachment", { payload: request });

// ============================================
// Session Bindings
// ============================================

export const setSessionBindings = (request: SetSessionBindingsRequest): Promise<void> =>
  apiCallVoid("set_session_bindings_command", { payload: request });
