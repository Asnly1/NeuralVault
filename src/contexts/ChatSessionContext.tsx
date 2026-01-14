/**
 * Chat 会话管理 Context
 * 职责：会话创建、缓存、绑定
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { createChatSession, setSessionBindings } from "@/api";

interface SessionContext {
  task_id?: number;
  resource_id?: number;
}

export interface ChatSessionContextType {
  /** 创建新会话并设为当前会话 */
  createSession: (context: SessionContext) => Promise<number>;
  /** 获取当前会话 session_id */
  getActiveSessionId: (context: SessionContext) => number | undefined;
  /** 设置当前会话 session_id */
  setActiveSessionId: (context: SessionContext, sessionId: number | null) => void;
  /** 同步会话的上下文资源绑定 */
  syncSessionBindings: (sessionId: number, nodeIds: number[]) => Promise<void>;
  /** 清除会话缓存 */
  clearSessionCache: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextType | undefined>(undefined);

const buildSessionKey = (context: SessionContext): string => {
  if (context.task_id) return `task:${context.task_id}`;
  if (context.resource_id) return `resource:${context.resource_id}`;
  return "unknown";
};

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionMap, setSessionMap] = useState<Map<string, number>>(new Map());

  const getActiveSessionId = useCallback(
    (context: SessionContext): number | undefined => {
      const key = buildSessionKey(context);
      if (key === "unknown") return undefined;
      return sessionMap.get(key);
    },
    [sessionMap]
  );

  const setActiveSessionId = useCallback(
    (context: SessionContext, sessionId: number | null) => {
      const key = buildSessionKey(context);
      if (key === "unknown") return;
      setSessionMap((prev) => {
        const next = new Map(prev);
        if (sessionId === null) {
          next.delete(key);
        } else {
          next.set(key, sessionId);
        }
        return next;
      });
    },
    []
  );

  const createSession = useCallback(
    async (context: SessionContext): Promise<number> => {
      const key = buildSessionKey(context);
      if (key === "unknown") {
        throw new Error("task_id or resource_id is required");
      }

      const nodeId = context.task_id ?? context.resource_id;
      if (!nodeId) {
        throw new Error("task_id or resource_id is required");
      }

      const response = await createChatSession({
        title: undefined,
        summary: undefined,
        chat_model: undefined,
        context_node_ids: [nodeId],
        binding_type: "primary",
      });

      setActiveSessionId(context, response.session_id);
      return response.session_id;
    },
    [setActiveSessionId]
  );

  const syncSessionBindings = useCallback(
    async (sessionId: number, nodeIds: number[]): Promise<void> => {
      try {
        await setSessionBindings({
          session_id: sessionId,
          node_ids: nodeIds,
          binding_type: "implicit",
        });
      } catch (e) {
        console.error("Failed to sync session context:", e);
      }
    },
    []
  );

  const clearSessionCache = useCallback(() => {
    setSessionMap(new Map());
  }, []);

  return (
    <ChatSessionContext.Provider
      value={{
        createSession,
        getActiveSessionId,
        setActiveSessionId,
        syncSessionBindings,
        clearSessionCache,
      }}
    >
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSession(): ChatSessionContextType {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return context;
}
