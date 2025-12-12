import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Palette, Globe, Key, Monitor, Keyboard, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SettingsPageProps {
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [apiKey, setApiKey] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [enableLocal, setEnableLocal] = useState(false);
  const shortcut = "Alt + Space";
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Header */}
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("settings", "title")}</h1>
        <p className="text-muted-foreground">{t("settings", "subtitle")}</p>
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
            <CardDescription>{t("settings", "themeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">{t("settings", "themeMode")}</label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "themeDesc")}
                </p>
              </div>
              <Select value={theme} onValueChange={(val: "light" | "dark" | "system") => onThemeChange(val)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">☀️ {t("settings", "light")}</SelectItem>
                  <SelectItem value="dark">🌙 {t("settings", "dark")}</SelectItem>
                  <SelectItem value="system">💻 {t("settings", "system")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Language Selection */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t("settings", "language")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "languageDesc")}
                </p>
              </div>
              <Select value={language} onValueChange={(val: "zh" | "en") => setLanguage(val)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">🇨🇳 中文 (Chinese)</SelectItem>
                  <SelectItem value="en">🇺🇸 English</SelectItem>
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
            <CardDescription>{t("settings", "apiDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">OpenAI API Key</label>
              <Input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings", "apiDesc")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Local Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              {t("settings", "localModel")}
            </CardTitle>
            <CardDescription>{t("settings", "localDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">{t("settings", "enableLocal")}</label>
                <p className="text-xs text-muted-foreground">
                  {t("settings", "useOllama")}
                </p>
              </div>
              <Switch
                checked={enableLocal}
                onCheckedChange={setEnableLocal}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ollama URL</label>
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

        {/* Shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              {t("settings", "shortcuts")}
            </CardTitle>
            <CardDescription>{t("settings", "shortcutsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t("settings", "quickCaptureDesc")}</p>
              </div>
              <Badge variant="secondary" className="font-mono">
                {shortcut}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              {t("settings", "about")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-semibold">NeuralVault</p>
            <Badge variant="outline">{t("settings", "versionMVP")}</Badge>
            <p className="text-sm text-muted-foreground pt-2">
              {t("settings", "aboutDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
