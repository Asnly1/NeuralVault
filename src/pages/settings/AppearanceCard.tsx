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
import { Separator } from "@/components/ui/separator";
import { Palette } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AppearanceCardProps {
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
}

export function AppearanceCard({ theme, onThemeChange }: AppearanceCardProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
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
            onValueChange={(val: "light" | "dark" | "system") => onThemeChange(val)}
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
  );
}
