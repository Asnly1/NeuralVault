import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Key } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAIConfig } from "@/contexts/AIContext";
import { type AIProvider } from "@/types";
import { APIKeyCard } from "./APIKeyCard";

const VISIBLE_PROVIDERS: AIProvider[] = ["gemini"];

export function APIConfigCard() {
  const { t } = useLanguage();
  const { config, saveKey, removeKey, loading } = useAIConfig();

  return (
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
          VISIBLE_PROVIDERS.map((provider) => {
            const providerStatus = config?.providers[provider];
            return (
              <APIKeyCard
                key={provider}
                provider={provider}
                hasKey={providerStatus?.has_key ?? false}
                enabled={providerStatus?.enabled ?? false}
                baseUrl={providerStatus?.base_url ?? null}
                onSave={saveKey}
                onRemove={removeKey}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
