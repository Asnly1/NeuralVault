import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAI } from "@/contexts/AIContext";
import { AI_PROVIDER_INFO, type ModelOption } from "@/types";
import { Send, Loader2, Settings } from "lucide-react";

interface ChatPanelProps {
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onNavigateToSettings?: () => void;
}

export function ChatPanel({
  width,
  tempWidth,
  isResizing,
  onMouseDown,
  onNavigateToSettings,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const {
    configuredProviders,
    selectedModel,
    setSelectedModel,
    messages,
    isChatLoading,
    sendMessage,
    error,
  } = useAI();
  const [chatInput, setChatInput] = useState("");

  const currentWidth = tempWidth !== null ? tempWidth : width;

  // 构建可用模型列表
  const availableModels: ModelOption[] = configuredProviders.flatMap(
    (provider) =>
      AI_PROVIDER_INFO[provider].models.map((m) => ({
        provider,
        model_id: m.id,
        display_name: `${AI_PROVIDER_INFO[provider].icon} ${m.name}`,
      }))
  );

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedModel || isChatLoading) return;
    const content = chatInput;
    setChatInput("");
    try {
      await sendMessage(content);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && selectedModel) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside
      style={{ width: `${currentWidth}px` }}
      className={cn(
        "border-l flex flex-col shrink-0 relative",
        !isResizing && "transition-all duration-300"
      )}
    >
      {/* Resize Handle */}
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors",
          isResizing && "bg-accent"
        )}
        onMouseDown={onMouseDown}
      >
        <div className="absolute top-0 left-0 w-4 h-full -ml-1.5" />
      </div>

      {/* Header with model selector */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{t("workspace", "aiAssistant")}</h3>
          <Select
            value={
              selectedModel
                ? `${selectedModel.provider}:${selectedModel.model_id}`
                : ""
            }
            onValueChange={(value) => {
              const [provider, model_id] = value.split(":");
              const model = availableModels.find(
                (m) => m.provider === provider && m.model_id === model_id
              );
              if (model) setSelectedModel(model);
            }}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder={t("workspace", "selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.length === 0 ? (
                <SelectItem value="none" disabled>
                  {t("workspace", "noModelsConfigured")}
                </SelectItem>
              ) : (
                availableModels.map((model) => (
                  <SelectItem
                    key={`${model.provider}:${model.model_id}`}
                    value={`${model.provider}:${model.model_id}`}
                  >
                    {model.display_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {t("workspace", "context")}
        </p>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isChatLoading ? (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                ◆
              </div>
              <div className="bg-muted rounded-lg p-3 text-sm">
                {configuredProviders.length > 0
                  ? t("workspace", "aiGreeting")
                  : t("workspace", "configureApiFirst")}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "user"
                      ? "bg-secondary"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {msg.role === "user" ? "U" : "◆"}
                </div>
                <div
                  className={cn(
                    "rounded-lg p-3 text-sm max-w-[80%] whitespace-pre-wrap",
                    msg.role === "user" ? "bg-secondary" : "bg-muted"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {isChatLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                ◆
              </div>
              <div className="bg-muted rounded-lg p-3 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("workspace", "thinking")}</span>
              </div>
            </div>
          )}
          {error && (
            <div className="text-destructive text-sm p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-4 border-t shrink-0">
        {configuredProviders.length === 0 ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={onNavigateToSettings}
          >
            <Settings className="h-4 w-4 mr-2" />
            {t("workspace", "goToSettings")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder={t("workspace", "inputPlaceholder")}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!selectedModel || isChatLoading}
              className="flex-1"
            />
            <Button
              size="icon"
              disabled={!chatInput.trim() || !selectedModel || isChatLoading}
              onClick={handleSend}
            >
              {isChatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
        {!selectedModel && configuredProviders.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {t("workspace", "selectModelFirst")}
          </p>
        )}
      </div>
    </aside>
  );
}
