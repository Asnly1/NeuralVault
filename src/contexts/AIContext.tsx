/**
 * AI 配置和聊天状态管理 Context
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  getAIConfigStatus,
  saveApiKey,
  removeApiKey,
  setDefaultModel,
  sendChatMessage,
} from "@/api";
import {
  AIProvider,
  aiProviderValues,
  AI_PROVIDER_INFO,
  type AIConfigStatus,
  type ModelOption,
  type ChatMessage,
  type ChatMessagePayload,
} from "@/types";

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
  sendMessage: (content: string, contextResourceIds?: number[]) => Promise<void>;
  clearMessages: () => void;
  refreshConfig: () => Promise<void>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIContextProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AIConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const refreshConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await getAIConfigStatus();
      setConfig(status);

      // 恢复默认模型选择
      if (status.default_provider && status.default_model) {
        const provider = status.default_provider as AIProvider;
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
    ? (aiProviderValues.filter(
        (p) => config.providers[p]?.has_key && config.providers[p]?.enabled
      ) as AIProvider[])
    : [];

  const saveKey = async (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ) => {
    try {
      await saveApiKey({
        provider,
        api_key: apiKey,
        base_url: baseUrl,
      });
      await refreshConfig();
    } catch (e) {
      throw e;
    }
  };

  const removeKey = async (provider: AIProvider) => {
    try {
      await removeApiKey(provider);
      // 如果删除的是当前选中的 provider，清除选择
      if (selectedModel?.provider === provider) {
        setSelectedModel(null);
      }
      await refreshConfig();
    } catch (e) {
      throw e;
    }
  };

  const saveDefaultModel = async (provider: AIProvider, model: string) => {
    try {
      await setDefaultModel({ provider, model });
      await refreshConfig();
    } catch (e) {
      throw e;
    }
  };

  const sendMessage = async (
    content: string,
    contextResourceIds?: number[]
  ) => {
    if (!selectedModel) {
      throw new Error("No model selected");
    }

    const userMessage: ChatMessage = {
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsChatLoading(true);
    setError(null);

    try {
      // 构建消息历史
      const messagePayloads: ChatMessagePayload[] = messages
        .concat(userMessage)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await sendChatMessage({
        provider: selectedModel.provider,
        model: selectedModel.model_id,
        messages: messagePayloads,
        context_resource_ids: contextResourceIds,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      // 移除失败的用户消息
      setMessages((prev) => prev.slice(0, -1));
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
