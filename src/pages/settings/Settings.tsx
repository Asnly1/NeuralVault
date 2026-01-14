import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppearanceCard } from "./AppearanceCard";
import { APIConfigCard } from "./APIConfigCard";
import { ProcessingConfigCard } from "./ProcessingConfigCard";
import { LocalModelCard } from "./LocalModelCard";
import { ClassificationCard } from "./ClassificationCard";
import { ShortcutsCard } from "./ShortcutsCard";

interface SettingsPageProps {
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("settings", "title")}
        </h1>
      </header>

      <Separator />

      <div className="flex-1 space-y-6 overflow-auto">
        <AppearanceCard theme={theme} onThemeChange={onThemeChange} />
        <APIConfigCard />
        <ProcessingConfigCard />
        <LocalModelCard />
        <ClassificationCard />
        <ShortcutsCard />
      </div>
    </div>
  );
}
