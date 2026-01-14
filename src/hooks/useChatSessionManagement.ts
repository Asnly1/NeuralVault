import { useState, useCallback, useEffect, useMemo } from "react";
import { listChatSessions, deleteChatSession } from "@/api";
import { useChatSession, useChatMessage } from "@/contexts/AIContext";
import type { ChatSession } from "@/types";

interface SessionContext {
  task_id?: number;
  resource_id?: number;
}

export interface ChatSessionState {
  sessions: ChatSession[];
  activeSessionId: number | undefined;
  isSessionsLoading: boolean;
  visibleSessions: ChatSession[];
  hasSessionContext: boolean;
}

export interface ChatSessionActions {
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: number) => Promise<void>;
  createNewSession: () => void;
  deleteSession: (sessionId: number, skipConfirm?: boolean) => Promise<void>;
}

export interface UseChatSessionManagementOptions {
  taskId?: number;
  resourceId?: number;
  contextResourceIds?: number[];
  getConfirmMessage?: () => string;
}

export interface UseChatSessionManagementReturn
  extends ChatSessionState,
    ChatSessionActions {}

export function useChatSessionManagement(
  options: UseChatSessionManagementOptions
): UseChatSessionManagementReturn {
  const {
    taskId,
    resourceId,
    contextResourceIds = [],
    getConfirmMessage,
  } = options;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  const { getActiveSessionId, setActiveSessionId } = useChatSession();
  const { loadSessionMessages, clearMessages, isChatLoading } = useChatMessage();

  const hasSessionContext = !!taskId || !!resourceId;
  const anchorNodeId = taskId || resourceId;

  const sessionContext = useMemo<SessionContext>(
    () => ({ task_id: taskId, resource_id: resourceId }),
    [taskId, resourceId]
  );

  const activeSessionId = hasSessionContext
    ? getActiveSessionId(sessionContext)
    : undefined;

  const visibleSessions = useMemo(() => sessions.slice(0, 3), [sessions]);

  const loadSessions = useCallback(async () => {
    if (!anchorNodeId) {
      setSessions([]);
      return;
    }
    setIsSessionsLoading(true);
    try {
      const result = await listChatSessions({
        node_id: anchorNodeId,
        include_deleted: false,
      });
      setSessions(result);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
      setSessions([]);
    } finally {
      setIsSessionsLoading(false);
    }
  }, [anchorNodeId]);

  const selectSession = useCallback(
    async (sessionId: number) => {
      if (!hasSessionContext || isChatLoading) return;
      if (activeSessionId === sessionId) return;

      setActiveSessionId(sessionContext, sessionId);
      try {
        await loadSessionMessages(
          { ...sessionContext, session_id: sessionId },
          { context_resource_ids: contextResourceIds }
        );
      } catch (err) {
        console.error("Failed to load session messages:", err);
      }
    },
    [
      hasSessionContext,
      isChatLoading,
      activeSessionId,
      sessionContext,
      contextResourceIds,
      setActiveSessionId,
      loadSessionMessages,
    ]
  );

  const createNewSession = useCallback(() => {
    if (!hasSessionContext || isChatLoading) return;
    setActiveSessionId(sessionContext, null);
    clearMessages();
  }, [hasSessionContext, isChatLoading, sessionContext, setActiveSessionId, clearMessages]);

  const deleteSession = useCallback(
    async (sessionId: number, skipConfirm = false) => {
      if (!skipConfirm) {
        const message = getConfirmMessage?.() ?? "确定要删除该会话吗？";
        if (!window.confirm(message)) return;
      }

      try {
        await deleteChatSession({ session_id: sessionId });
        if (activeSessionId === sessionId) {
          setActiveSessionId(sessionContext, null);
          clearMessages();
        }
        await loadSessions();
      } catch (err) {
        console.error("Failed to delete chat session:", err);
      }
    },
    [
      activeSessionId,
      sessionContext,
      setActiveSessionId,
      clearMessages,
      loadSessions,
      getConfirmMessage,
    ]
  );

  // Initialize and reload on context change
  useEffect(() => {
    if (!hasSessionContext) {
      clearMessages();
      setSessions([]);
      return;
    }
    setActiveSessionId(sessionContext, null);
    clearMessages();
    void loadSessions();
  }, [hasSessionContext, anchorNodeId]);

  return {
    sessions,
    activeSessionId,
    isSessionsLoading,
    visibleSessions,
    hasSessionContext,
    loadSessions,
    selectSession,
    createNewSession,
    deleteSession,
  };
}
