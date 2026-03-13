import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

export function LocalModelCard() {
  const [modelPath, setModelPath] = useState("");
  const [enableLocal, setEnableLocal] = useState(false);
  const { t } = useLanguage();

  return (
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
  );
}
