import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function ShortcutsCard() {
  const { t } = useLanguage();

  const shortcuts = [
    { label: t("settings", "shortcutQuickCapture"), keys: "Alt + Space" },
    { label: t("settings", "shortcutSearch"), keys: "Ctrl/Cmd + K" },
    { label: t("settings", "shortcutSave"), keys: "Ctrl/Cmd + S" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          {t("settings", "shortcuts")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("settings", "shortcutsHint")}
          </p>
          {shortcuts.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <p className="text-sm font-medium">{item.label}</p>
              <Badge variant="secondary" className="font-mono">
                {item.keys}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
