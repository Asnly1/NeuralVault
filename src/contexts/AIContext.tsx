/**
 * AI 配置和聊天状态管理 Context
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  getAIConfigStatus,
  saveApiKey,
  removeApiKey,
  setDefaultModel,
  sendChatMessage,
  createChatSession,
  listChatSessions,
  listChatMessages,
} from "@/api";
import {
  AIProvider,
  AI_PROVIDER_INFO,
  type AIConfigStatus,
  type ModelOption,
  type ChatMessage,
  type ChatUsage,
  type ChatMessagePayload,
  type ThinkingEffort,
} from "@/types";
import { listen } from "@tauri-apps/api/event";

interface AIContextType {
  // 配置状态
  config: AIConfigStatus | null;
  loading: boolean;
  error: string | null;

  // 已配置的 providers
  configuredProviders: AIProvider[];

  // 当前选择的模型
  selectedModel: ModelOption | null;
  setSelectedModel: (model: ModelOption | null) => void;

  // Chat 状态
  messages: ChatMessage[];
  isChatLoading: boolean;

  // Actions
  saveKey: (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ) => Promise<void>;
  removeKey: (provider: AIProvider) => Promise<void>;
  saveDefaultModel: (provider: AIProvider, model: string) => Promise<void>;
  sendMessage: (
    content: string,
    context?: {
      session_type: "task" | "resource";
      task_id?: number;
      resource_id?: number;
      images?: number[];
      files?: number[];
      thinking_effort?: ThinkingEffort;
    }
  ) => Promise<void>;
  clearMessages: () => void;
  loadSessionMessages: (context: {
    session_type: "task" | "resource";
    task_id?: number;
    resource_id?: number;
  }) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);
const enabledProviders: AIProvider[] = ["openai"];

export function AIContextProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AIConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sessionMap, setSessionMap] = useState<Map<string, number>>(new Map());
  const loadTokenRef = useRef(0);

  const refreshConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await getAIConfigStatus();
      setConfig(status);

      // 恢复默认模型选择
      if (status.default_provider && status.default_model) {
        const provider = status.default_provider as AIProvider;
        if (!enabledProviders.includes(provider)) {
          return;
        }
        const providerInfo = AI_PROVIDER_INFO[provider];
        if (providerInfo) {
          const modelInfo = providerInfo.models.find(
            (m) => m.id === status.default_model
          );
          setSelectedModel({
            provider,
            model_id: status.default_model,
            display_name: modelInfo
              ? `${providerInfo.icon} ${modelInfo.name}`
              : status.default_model,
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  // 获取已配置的 providers
  const configuredProviders: AIProvider[] = config
    ? (enabledProviders.filter(
        (p) => config.providers[p]?.has_key && config.providers[p]?.enabled
      ) as AIProvider[])
    : [];

  const saveKey = async (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ) => {
    await saveApiKey({
      provider,
      api_key: apiKey,
      base_url: baseUrl,
    });
    await refreshConfig();
  };

  const removeKey = async (provider: AIProvider) => {
    await removeApiKey(provider);
    // 如果删除的是当前选中的 provider，清除选择
    if (selectedModel?.provider === provider) {
      setSelectedModel(null);
    }
    await refreshConfig();
  };

  const saveDefaultModel = async (provider: AIProvider, model: string) => {
    await setDefaultModel({ provider, model });
    await refreshConfig();
  };

  const ensureSession = useCallback(
    async (context: {
      session_type: "task" | "resource";
      task_id?: number;
      resource_id?: number;
    }) => {
      const key =
        context.session_type === "task"
          ? `task:${context.task_id ?? "none"}`
          : `resource:${context.resource_id ?? "none"}`;
      const existing = sessionMap.get(key);
      if (existing) return existing;

      const response = await createChatSession({
        session_type: context.session_type,
        task_id: context.task_id,
        resource_id: context.resource_id,
      });
      setSessionMap((prev) => {
        const next = new Map(prev);
        next.set(key, response.session_id);
        return next;
      });
      return response.session_id;
    },
    [sessionMap]
  );

  const toChatMessages = useCallback((turns: ChatMessagePayload[]): ChatMessage[] => {
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
          timestamp,
          usage: turn.usage,
        });
      }
    }
    return output;
  }, []);

  const loadSessionMessages = useCallback(
    async (context: {
      session_type: "task" | "resource";
      task_id?: number;
      resource_id?: number;
    }) => {
      const loadToken = ++loadTokenRef.current;
      try {
        const key =
          context.session_type === "task"
            ? `task:${context.task_id ?? "none"}`
            : `resource:${context.resource_id ?? "none"}`;
        const cached = sessionMap.get(key);
        let sessionId = cached;

        if (!sessionId) {
          const sessions = await listChatSessions({
            session_type: context.session_type,
            task_id: context.task_id,
            resource_id: context.resource_id,
            include_deleted: false,
          });
          if (!sessions.length) {
            if (loadToken === loadTokenRef.current) {
              setMessages([]);
            }
            return;
          }
          sessionId = sessions[0].session_id;
          setSessionMap((prev) => {
            const next = new Map(prev);
            next.set(key, sessionId!);
            return next;
          });
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
    [sessionMap, toChatMessages]
  );

  const sendMessage = async (
    content: string,
    context?: {
      session_type: "task" | "resource";
      task_id?: number;
      resource_id?: number;
      images?: number[];
      files?: number[];
      thinking_effort?: ThinkingEffort;
    }
  ) => {
    const unlistenRef: { current: null | (() => void) } = { current: null };
    if (!selectedModel) {
      throw new Error("No model selected");
    }

    if (!context) {
      throw new Error("Chat session context is required");
    }

    loadTokenRef.current += 1;

    const sessionId = await ensureSession({
      session_type: context.session_type,
      task_id: context.task_id,
      resource_id: context.resource_id,
    });

    const userMessage: ChatMessage = {
      role: "user",
      content,
      timestamp: new Date(),
      attachments: [
        ...(context.images || []).map((resourceId) => ({ resource_id: resourceId })),
        ...(context.files || []).map((resourceId) => ({ resource_id: resourceId })),
      ],
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsChatLoading(true);
    setError(null);

    try {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const applyUsage = (usage: ChatUsage) => {
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
      };

      const setupListener = async () => {
        unlistenRef.current = await listen<{
          session_id: number;
          type: string;
          delta?: string;
          usage?: ChatUsage;
          message?: unknown;
        }>("chat-stream", (event) => {
          if (event.payload.session_id !== sessionId) return;

          if (event.payload.type === "delta" && event.payload.delta) {
            setMessages((prev) => {
              const next = [...prev];
              const lastIndex = next.length - 1;
              if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
                next[lastIndex] = {
                  ...next[lastIndex],
                  content: next[lastIndex].content + event.payload.delta,
                };
              }
              return next;
            });
          }

          if (event.payload.type === "usage" && event.payload.usage) {
            applyUsage(event.payload.usage);
            setIsChatLoading(false);
            if (unlistenRef.current) unlistenRef.current();
          }

          if (event.payload.type === "error") {
            setError("Chat failed");
            setIsChatLoading(false);
            if (unlistenRef.current) unlistenRef.current();
          }
        });
      };

      await setupListener();

      await sendChatMessage({
        session_id: sessionId,
        provider: selectedModel.provider,
        model: selectedModel.model_id,
        task_type: "chat",
        content,
        images: context.images,
        files: context.files,
        thinking_effort: context.thinking_effort,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1));
      setIsChatLoading(false);
      if (unlistenRef.current) unlistenRef.current();
      throw e;
    } finally {
      setIsChatLoading(false);
    }
  };

  const clearMessages = () => setMessages([]);

  return (
    <AIContext.Provider
      value={{
        config,
        loading,
        error,
        configuredProviders,
        selectedModel,
        setSelectedModel,
        messages,
        isChatLoading,
        saveKey,
        removeKey,
        saveDefaultModel,
        sendMessage,
        clearMessages,
        loadSessionMessages,
        refreshConfig,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAI must be used within AIContextProvider");
  }
  return context;
}
