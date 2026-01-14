import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Trash2, Check, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { type AIProvider, AI_PROVIDER_INFO } from "@/types";

export interface APIKeyCardProps {
  provider: AIProvider;
  hasKey: boolean;
  enabled: boolean;
  baseUrl: string | null;
  onSave: (provider: AIProvider, apiKey: string, baseUrl?: string) => Promise<void>;
  onRemove: (provider: AIProvider) => Promise<void>;
}

export function APIKeyCard({
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
