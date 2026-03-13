import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAIConfig } from "@/contexts/AIContext";
import { type AIProvider, AI_PROVIDER_INFO } from "@/types";

const isKnownProvider = (provider: string): provider is AIProvider =>
  provider in AI_PROVIDER_INFO;

export function ProcessingConfigCard() {
  const { t } = useLanguage();
  const { config, loading, saveProcessingProviderModel } = useAIConfig();

  const [processingProvider, setProcessingProvider] = useState<AIProvider | "">("");
  const [processingModel, setProcessingModel] = useState("");
  const [processingSaving, setProcessingSaving] = useState(false);

  const processingProviders: AIProvider[] = config
    ? Object.keys(config.providers)
        .filter(isKnownProvider)
        .filter(
          (provider) =>
            config.providers[provider]?.has_key && config.providers[provider]?.enabled
        )
    : [];

  const processingProviderOptions: AIProvider[] = (() => {
    const options = new Set<AIProvider>(processingProviders);
    if (config?.processing_provider && isKnownProvider(config.processing_provider)) {
      options.add(config.processing_provider);
    }
    return Array.from(options);
  })();

  const processingProviderInfo = processingProvider
    ? AI_PROVIDER_INFO[processingProvider]
    : null;
  const processingModels = processingProviderInfo?.models ?? [];

  const isProcessingDirty = Boolean(
    config &&
      processingProvider &&
      processingModel &&
      (processingProvider !== config.processing_provider ||
        processingModel !== config.processing_model)
  );

  useEffect(() => {
    if (!config) return;
    if (config.processing_provider && isKnownProvider(config.processing_provider)) {
      setProcessingProvider(config.processing_provider);
    } else {
      setProcessingProvider("");
    }
    setProcessingModel(config.processing_model ?? "");
  }, [config?.processing_provider, config?.processing_model]);

  const handleProcessingProviderChange = (value: string) => {
    const provider = value as AIProvider;
    setProcessingProvider(provider);
    const providerInfo = AI_PROVIDER_INFO[provider];
    if (!providerInfo || providerInfo.models.length === 0) {
      setProcessingModel("");
      return;
    }
    setProcessingModel((current) => {
      const hasCurrent = providerInfo.models.some((model) => model.id === current);
      return hasCurrent ? current : providerInfo.models[0].id;
    });
  };

  const handleSaveProcessingModel = async () => {
    if (!processingProvider || !processingModel) return;
    setProcessingSaving(true);
    try {
      await saveProcessingProviderModel(processingProvider, processingModel);
    } catch (e) {
      console.error("Failed to save processing model:", e);
    } finally {
      setProcessingSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t("settings", "processingConfig")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">
            {t("common", "loading")}...
          </p>
        ) : processingProviderOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("settings", "processingNoProvider")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">
                  {t("settings", "processingProvider")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "processingProviderDesc")}
                </p>
              </div>
              <Select
                value={processingProvider}
                onValueChange={handleProcessingProviderChange}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={t("settings", "processingSelectProvider")} />
                </SelectTrigger>
                <SelectContent>
                  {processingProviderOptions.map((provider) => {
                    const info = AI_PROVIDER_INFO[provider];
                    return (
                      <SelectItem key={provider} value={provider}>
                        {info ? info.name : provider}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">
                  {t("settings", "processingModel")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "processingModelDesc")}
                </p>
              </div>
              <Select
                value={processingModel}
                onValueChange={(value) => setProcessingModel(value)}
                disabled={!processingProvider || processingModels.length === 0}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={t("settings", "processingSelectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {processingModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveProcessingModel}
                disabled={!isProcessingDirty || processingSaving}
              >
                {processingSaving
                  ? `${t("common", "loading")}...`
                  : t("settings", "processingSave")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
