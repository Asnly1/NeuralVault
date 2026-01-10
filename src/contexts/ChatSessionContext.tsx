/**
 * Chat 会话管理 Context
 * 职责：会话创建、缓存、绑定
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { createChatSession, listChatSessions, setSessionBindings } from "@/api";

interface SessionContext {
  task_id?: number;
  resource_id?: number;
}

export interface ChatSessionContextType {
  /** 确保会话存在，返回 session_id */
  ensureSession: (context: SessionContext, contextResourceIds?: number[]) => Promise<number>;
  /** 同步会话的上下文资源绑定 */
  syncSessionBindings: (sessionId: number, nodeIds: number[]) => Promise<void>;
  /** 获取已缓存的 session_id */
  getSessionId: (context: SessionContext) => number | undefined;
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

  const getSessionId = useCallback(
    (context: SessionContext): number | undefined => {
      const key = buildSessionKey(context);
      return sessionMap.get(key);
    },
    [sessionMap]
  );

  const ensureSession = useCallback(
    async (context: SessionContext, contextResourceIds?: number[]): Promise<number> => {
      const key = buildSessionKey(context);
      if (key === "unknown") {
        throw new Error("task_id or resource_id is required");
      }

      // 检查缓存
      const existing = sessionMap.get(key);
      if (existing) return existing;

      // 优先使用 task_id，否则使用 resource_id
      const nodeId = context.task_id ?? context.resource_id;

      // 查找现有会话
      const sessions = await listChatSessions({
        node_id: nodeId,
        include_deleted: false,
      });

      if (sessions.length > 0) {
        const sessionId = sessions[0].session_id;
        setSessionMap((prev) => new Map(prev).set(key, sessionId));
        return sessionId;
      }

      // 创建新会话
      const response = await createChatSession({
        node_id: nodeId,
        title: undefined,
        summary: undefined,
        chat_model: undefined,
        context_node_ids: contextResourceIds,
      });

      setSessionMap((prev) => new Map(prev).set(key, response.session_id));
      return response.session_id;
    },
    [sessionMap]
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
        ensureSession,
        syncSessionBindings,
        getSessionId,
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
