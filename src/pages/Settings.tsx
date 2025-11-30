import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [enableLocal, setEnableLocal] = useState(false);
  const shortcut = "Alt + Space";

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Header */}
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground">配置你的 NeuralVault</p>
      </header>

      <Separator />

      {/* Settings Content */}
      <div className="flex-1 space-y-6 overflow-auto">
        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🔑</span>
              API 配置
            </CardTitle>
            <CardDescription>配置 AI 模型的 API 密钥</CardDescription>
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
                用于云端 AI 模型调用
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Local Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🖥️</span>
              本地模型
            </CardTitle>
            <CardDescription>使用本地运行的 LLM 模型</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">启用本地模型</label>
                <p className="text-xs text-muted-foreground">
                  使用 Ollama 运行本地 LLM
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
              <span>⌨️</span>
              快捷键
            </CardTitle>
            <CardDescription>查看和配置快捷键</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">快速捕获</p>
                <p className="text-xs text-muted-foreground">
                  呼出悬浮输入窗
                </p>
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
              <span>ℹ️</span>
              关于
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-semibold">NeuralVault</p>
            <Badge variant="outline">Version 0.1.0 (MVP)</Badge>
            <p className="text-sm text-muted-foreground pt-2">
              本地优先的智能第二大脑，基于 RAG 的个人助理。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
