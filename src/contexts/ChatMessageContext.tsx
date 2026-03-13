/**
 * Chat 消息管理 Context
 * 职责：消息状态、流式响应处理、发送消息
 */
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { sendChatMessage as apiSendChatMessage, listChatMessages } from "@/api";
import { listen } from "@tauri-apps/api/event";
import type {
  ChatMessage,
  ChatUsage,
  ChatMessagePayload,
  ThinkingEffort,
  RagScope,
} from "@/types";
import { useChatSession } from "./ChatSessionContext";
import { useAIConfig } from "./AIConfigContext";

interface SendMessageContext {
  session_id?: number;
  task_id?: number;
  resource_id?: number;
  images?: number[];
  files?: number[];
  thinking_effort?: ThinkingEffort;
  context_resource_ids?: number[];
  rag_scope?: RagScope;
}

interface LoadContext {
  session_id?: number;
  task_id?: number;
  resource_id?: number;
}

export interface ChatMessageContextType {
  messages: ChatMessage[];
  isChatLoading: boolean;
  chatError: string | null;
  sendMessage: (content: string, context: SendMessageContext) => Promise<void>;
  loadSessionMessages: (
    context: LoadContext,
    options?: { context_resource_ids?: number[] }
  ) => Promise<void>;
  clearMessages: () => void;
}

const ChatMessageContext = createContext<ChatMessageContextType | undefined>(undefined);

// 将数据库消息转换为前端消息格式
const toChatMessages = (turns: ChatMessagePayload[]): ChatMessage[] => {
  const output: ChatMessage[] = [];
  for (const turn of turns) {
    const timestamp = turn.created_at ? new Date(turn.created_at) : new Date();
    if (turn.user_content) {
      output.push({
        role: "user",
        content: turn.user_content,
        timestamp,
        attachments: turn.attachments,
      });
    }
    if (turn.assistant_content) {
      output.push({
        role: "assistant",
        content: turn.assistant_content,
        thinkingSummary: turn.thinking_summary ?? undefined,
        timestamp,
        usage: turn.usage,
      });
    }
  }
  return output;
};

export function ChatMessageProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const loadTokenRef = useRef(0);

  const { createSession, getActiveSessionId, setActiveSessionId, syncSessionBindings } =
    useChatSession();
  const { selectedModel } = useAIConfig();

  // ============================================
  // 流处理辅助函数
  // ============================================

  const appendDeltaToLastAssistant = useCallback((delta: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
        next[lastIndex] = {
          ...next[lastIndex],
          content: next[lastIndex].content + delta,
        };
      }
      return next;
    });
  }, []);

  const applyUsageToLastAssistant = useCallback((usage: ChatUsage) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], usage };
          break;
        }
      }
      return next;
    });
  }, []);

  const appendThinkingDeltaToLastAssistant = useCallback((delta: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
        next[lastIndex] = {
          ...next[lastIndex],
          thinkingSummary: (next[lastIndex].thinkingSummary || "") + delta,
        };
      }
      return next;
    });
  }, []);

  const setupStreamListener = useCallback(
    async (
      sessionId: number,
      unlistenRef: { current: null | (() => void) }
    ) => {
      unlistenRef.current = await listen<{
        session_id: number;
        type: string;
        delta?: string;
        usage?: ChatUsage;
        message?: unknown;
      }>("chat-stream", (event) => {
        if (event.payload.session_id !== sessionId) return;

        if (event.payload.type === "answer_delta" && event.payload.delta) {
          appendDeltaToLastAssistant(event.payload.delta);
        }

        if (event.payload.type === "thinking_delta" && event.payload.delta) {
          appendThinkingDeltaToLastAssistant(event.payload.delta);
        }

        if (event.payload.type === "usage" && event.payload.usage) {
          applyUsageToLastAssistant(event.payload.usage);
          setIsChatLoading(false);
          if (unlistenRef.current) unlistenRef.current();
        }

        if (event.payload.type === "error") {
          setChatError("Chat failed");
          setIsChatLoading(false);
          if (unlistenRef.current) unlistenRef.current();
        }
      });
    },
    [appendDeltaToLastAssistant, appendThinkingDeltaToLastAssistant, applyUsageToLastAssistant]
  );

  // ============================================
  // 消息加载
  // ============================================

  const loadSessionMessages = useCallback(
    async (
      context: LoadContext,
      options?: { context_resource_ids?: number[] }
    ) => {
      const loadToken = ++loadTokenRef.current;

      try {
        const hasAnchor = !!context.task_id || !!context.resource_id;
        const sessionId =
          context.session_id ??
          (hasAnchor ? getActiveSessionId(context) : undefined);

        if (!sessionId) {
          if (loadToken === loadTokenRef.current) {
            setMessages([]);
          }
          return;
        }

        if (context.session_id && hasAnchor) {
          setActiveSessionId(context, context.session_id);
        }

        if (options?.context_resource_ids) {
          await syncSessionBindings(sessionId, options.context_resource_ids);
        }

        const turns = await listChatMessages(sessionId);
        if (loadToken !== loadTokenRef.current) return;

        setMessages(toChatMessages(turns));
      } catch (e) {
        if (loadToken === loadTokenRef.current) {
          setMessages([]);
        }
        console.error("Failed to load chat history:", e);
      }
    },
    [getActiveSessionId, setActiveSessionId, syncSessionBindings]
  );

  // ============================================
  // 发送消息
  // ============================================

  const sendMessage = useCallback(
    async (content: string, context: SendMessageContext) => {
      const unlistenRef: { current: null | (() => void) } = { current: null };

      // 前置校验
      if (!selectedModel) {
        throw new Error("No model selected");
      }
      const hasAnchor = !!context.task_id || !!context.resource_id;

      loadTokenRef.current += 1;

      const sessionContext = { task_id: context.task_id, resource_id: context.resource_id };
      let sessionId =
        context.session_id ?? (hasAnchor ? getActiveSessionId(sessionContext) : undefined);

      if (!sessionId) {
        if (!hasAnchor) {
          throw new Error("session_id or task_id/resource_id is required");
        }
        sessionId = await createSession(sessionContext);
      }

      if (hasAnchor) {
        setActiveSessionId(sessionContext, sessionId);
      }

      // 同步上下文资源
      if (context.context_resource_ids) {
        await syncSessionBindings(sessionId, context.context_resource_ids);
      }

      // 添加用户消息到 UI
      const userMessage: ChatMessage = {
        role: "user",
        content,
        timestamp: new Date(),
        attachments: [
          ...(context.images || []).map((nodeId) => ({ node_id: nodeId })),
          ...(context.files || []).map((nodeId) => ({ node_id: nodeId })),
        ],
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsChatLoading(true);
      setChatError(null);

      try {
        // 添加空的 assistant 消息占位
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", timestamp: new Date() },
        ]);

        // 设置流监听器
        await setupStreamListener(sessionId, unlistenRef);

        // 发送请求到后端
        await apiSendChatMessage({
          session_id: sessionId,
          provider: selectedModel.provider,
          model: selectedModel.model_id,
          content,
          images: context.images,
          files: context.files,
          thinking_effort: context.thinking_effort,
          rag_scope: context.rag_scope,
        });
      } catch (e) {
        setChatError(e instanceof Error ? e.message : "Chat failed");
        setMessages((prev) => prev.slice(0, -1)); // 移除失败的 assistant 消息
        setIsChatLoading(false);
        if (unlistenRef.current) unlistenRef.current();
        throw e;
      }
    },
    [
      selectedModel,
      createSession,
      getActiveSessionId,
      setActiveSessionId,
      syncSessionBindings,
      setupStreamListener,
    ]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setChatError(null);
  }, []);

  return (
    <ChatMessageContext.Provider
      value={{
        messages,
        isChatLoading,
        chatError,
        sendMessage,
        loadSessionMessages,
        clearMessages,
      }}
    >
      {children}
    </ChatMessageContext.Provider>
  );
}

export function useChatMessage(): ChatMessageContextType {
  const context = useContext(ChatMessageContext);
  if (!context) {
    throw new Error("useChatMessage must be used within ChatMessageProvider");
  }
  return context;
}
