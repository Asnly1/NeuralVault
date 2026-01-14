/**
 * Chat 组合 hook
 *
 * 组合多个 Context 提供便捷的聊天功能
 */
import { useCallback } from "react";
import { useAIConfig } from "@/contexts/AIConfigContext";
import { useChatMessage } from "@/contexts/ChatMessageContext";
import type { ThinkingEffort, ModelOption, ChatMessage, AIProvider, RagScope } from "@/types";

interface ChatContext {
  session_id?: number;
  task_id?: number;
  resource_id?: number;
  images?: number[];
  files?: number[];
  thinking_effort?: ThinkingEffort;
  context_resource_ids?: number[];
  rag_scope?: RagScope;
}

export interface UseChatReturn {
  // 配置状态
  isConfigured: boolean;
  selectedModel: ModelOption | null;
  setSelectedModel: (model: ModelOption | null) => void;
  configuredProviders: AIProvider[];

  // 消息状态
  messages: ChatMessage[];
  isChatLoading: boolean;
  error: string | null;

  // 操作
  sendMessage: (content: string, context: ChatContext) => Promise<void>;
  loadMessages: (
    context: { session_id?: number; task_id?: number; resource_id?: number },
    options?: { context_resource_ids?: number[] }
  ) => Promise<void>;
  clearMessages: () => void;
}

/**
 * 组合的 Chat hook
 *
 * @example
 * const { messages, sendMessage, isConfigured } = useChat();
 *
 * if (!isConfigured) {
 *   return <SetupPrompt />;
 * }
 *
 * return <ChatUI messages={messages} onSend={sendMessage} />;
 */
export function useChat(): UseChatReturn {
  const config = useAIConfig();
  const message = useChatMessage();

  const isConfigured = config.configuredProviders.length > 0 && config.selectedModel !== null;

  const sendMessage = useCallback(
    async (content: string, context: ChatContext) => {
      if (!config.selectedModel) {
        throw new Error("No model selected");
      }
      await message.sendMessage(content, context);
    },
    [config.selectedModel, message]
  );

  return {
    // 配置状态
    isConfigured,
    selectedModel: config.selectedModel,
    setSelectedModel: config.setSelectedModel,
    configuredProviders: config.configuredProviders,

    // 消息状态
    messages: message.messages,
    isChatLoading: message.isChatLoading,
    error: message.chatError,

    // 操作
    sendMessage,
    loadMessages: message.loadSessionMessages,
    clearMessages: message.clearMessages,
  };
}
