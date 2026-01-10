/**
 * AI 配置管理 Context
 * 职责：API Key 管理、模型选择、配置刷新
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getAIConfigStatus, saveApiKey, removeApiKey, setDefaultModel } from "@/api";
import {
  AI_PROVIDER_INFO,
  type AIProvider,
  type AIConfigStatus,
  type ModelOption,
} from "@/types";

// 当前启用的 providers（可扩展）
const ENABLED_PROVIDERS: AIProvider[] = ["openai"];

export interface AIConfigContextType {
  config: AIConfigStatus | null;
  loading: boolean;
  error: string | null;
  configuredProviders: AIProvider[];
  selectedModel: ModelOption | null;
  setSelectedModel: (model: ModelOption | null) => void;
  saveKey: (provider: AIProvider, apiKey: string, baseUrl?: string) => Promise<void>;
  removeKey: (provider: AIProvider) => Promise<void>;
  saveDefaultModel: (provider: AIProvider, model: string) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const AIConfigContext = createContext<AIConfigContextType | undefined>(undefined);

export function AIConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AIConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await getAIConfigStatus();
      setConfig(status);

      // 恢复默认模型选择
      if (status.default_provider && status.default_model) {
        const provider = status.default_provider as AIProvider;
        if (ENABLED_PROVIDERS.includes(provider)) {
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
    ? (ENABLED_PROVIDERS.filter(
        (p) => config.providers[p]?.has_key && config.providers[p]?.enabled
      ) as AIProvider[])
    : [];

  const saveKey = useCallback(
    async (provider: AIProvider, apiKey: string, baseUrl?: string) => {
      await saveApiKey({
        provider,
        api_key: apiKey,
        base_url: baseUrl,
      });
      await refreshConfig();
    },
    [refreshConfig]
  );

  const removeKey = useCallback(
    async (provider: AIProvider) => {
      await removeApiKey(provider);
      // 如果删除的是当前选中的 provider，清除选择
      if (selectedModel?.provider === provider) {
        setSelectedModel(null);
      }
      await refreshConfig();
    },
    [refreshConfig, selectedModel]
  );

  const saveDefaultModel = useCallback(
    async (provider: AIProvider, model: string) => {
      await setDefaultModel({ provider, model });
      await refreshConfig();
    },
    [refreshConfig]
  );

  return (
    <AIConfigContext.Provider
      value={{
        config,
        loading,
        error,
        configuredProviders,
        selectedModel,
        setSelectedModel,
        saveKey,
        removeKey,
        saveDefaultModel,
        refreshConfig,
      }}
    >
      {children}
    </AIConfigContext.Provider>
  );
}

export function useAIConfig(): AIConfigContextType {
  const context = useContext(AIConfigContext);
  if (!context) {
    throw new Error("useAIConfig must be used within AIConfigProvider");
  }
  return context;
}
