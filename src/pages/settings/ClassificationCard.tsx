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

export function ClassificationCard() {
  const { t } = useLanguage();
  const { config, loading, classificationMode, saveClassificationMode } = useAIConfig();

  return (
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
  );
}
