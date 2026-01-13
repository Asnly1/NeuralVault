import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Palette,
  Key,
  Keyboard,
  Eye,
  EyeOff,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAIConfig } from "@/contexts/AIContext";
import { type AIProvider, AI_PROVIDER_INFO } from "@/types";

interface SettingsPageProps {
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
}

interface APIKeyCardProps {
  provider: AIProvider;
  hasKey: boolean;
  enabled: boolean;
  baseUrl: string | null;
  onSave: (provider: AIProvider, apiKey: string, baseUrl?: string) => Promise<void>;
  onRemove: (provider: AIProvider) => Promise<void>;
}

function APIKeyCard({
  provider,
  hasKey,
  enabled,
  baseUrl,
  onSave,
  onRemove,
}: APIKeyCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState(baseUrl || "");
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();

  const providerInfo = AI_PROVIDER_INFO[provider];

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await onSave(
        provider,
        apiKey,
        customBaseUrl.trim() || providerInfo.defaultBaseUrl || undefined
      );
      setApiKey("");
      setEditing(false);
    } catch (e) {
      console.error("Failed to save API key:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    try {
      await onRemove(provider);
    } catch (e) {
      console.error("Failed to remove API key:", e);
    }
  };

  const handleCancel = () => {
    setApiKey("");
    setCustomBaseUrl(baseUrl || "");
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <img
          src={`/assets/${providerInfo.icon}`}
          alt={providerInfo.name}
          className="w-8 h-8"
        />
        <div>
          <p className="font-medium">{providerInfo.name}</p>
          {hasKey && enabled ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              {t("settings", "configured")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("settings", "notConfigured")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-48 pr-8"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-0 top-0 h-full w-8"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {providerInfo.defaultBaseUrl && (
              <Input
                type="text"
                placeholder="Base URL (optional)"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                className="w-40"
              />
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSave}
              disabled={!apiKey.trim() || saving}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {hasKey ? t("settings", "update") : t("settings", "configure")}
            </Button>
            {hasKey && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [modelPath, setModelPath] = useState("");
  const [enableLocal, setEnableLocal] = useState(false);
  const shortcut = "Alt + Space";
  const { language, setLanguage, t } = useLanguage();
  const {
    config,
    saveKey,
    removeKey,
    loading,
    classificationMode,
    saveClassificationMode,
    saveProcessingProviderModel,
  } = useAIConfig();
  const visibleProviders: AIProvider[] = ["gemini"];
  const [processingProvider, setProcessingProvider] = useState<AIProvider | "">("");
  const [processingModel, setProcessingModel] = useState("");
  const [processingSaving, setProcessingSaving] = useState(false);

  const isKnownProvider = (provider: string): provider is AIProvider =>
    provider in AI_PROVIDER_INFO;

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
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Header */}
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("settings", "title")}
        </h1>
      </header>

      <Separator />

      {/* Settings Content */}
      <div className="flex-1 space-y-6 overflow-auto">
        {/* Appearance Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t("settings", "appearance")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">
                  {t("settings", "themeMode")}
                </label>
              </div>
              <Select
                value={theme}
                onValueChange={(val: "light" | "dark" | "system") =>
                  onThemeChange(val)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("settings", "light")}</SelectItem>
                  <SelectItem value="dark">{t("settings", "dark")}</SelectItem>
                  <SelectItem value="system">{t("settings", "system")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Language Selection */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  {t("settings", "language")}
                </label>
              </div>
              <Select
                value={language}
                onValueChange={(val: "zh" | "en") => setLanguage(val)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("settings", "apiConfig")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-muted-foreground text-sm">
                {t("common", "loading")}...
              </p>
            ) : (
              visibleProviders.map((provider) => {
                const AIProviderStatus = config?.providers[provider];
                return (
                  <APIKeyCard
                    key={provider}
                    provider={provider}
                    hasKey={AIProviderStatus?.has_key ?? false}
                    enabled={AIProviderStatus?.enabled ?? false}
                    baseUrl={AIProviderStatus?.base_url ?? null}
                    onSave={saveKey}
                    onRemove={removeKey}
                  />
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Processing Provider/Model */}
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

        {/* Local Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <img src="/assets/ollama.svg" alt="Ollama" className="h-5 w-5" />
              {t("settings", "localModel")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">
                  {t("settings", "enableLocal")}
                </label>
              </div>
              <Switch checked={enableLocal} onCheckedChange={setEnableLocal} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Local URL</label>
              <Input
                type="text"
                placeholder="http://127.0.0.1:11434"
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                disabled={!enableLocal}
              />
            </div>
          </CardContent>
        </Card>

        {/* Classification Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("settings", "classification")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">
                  {t("settings", "classificationMode")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "classificationDesc")}
                </p>
              </div>
              <Select
                value={classificationMode ?? "manual"}
                onValueChange={(val: "manual" | "aggressive") => saveClassificationMode(val)}
                disabled={!config || loading}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t("settings", "classificationManual")}</SelectItem>
                  <SelectItem value="aggressive">{t("settings", "classificationAggressive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              {t("settings", "shortcuts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings", "quickCaptureDesc")}
                </p>
              </div>
              <Badge variant="secondary" className="font-mono">
                {shortcut}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
