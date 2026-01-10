import { useEffect, useState } from "react";
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
import { useAIConfig, useChatMessage } from "@/contexts/AIContext";
import { AI_PROVIDER_INFO, type ModelOption, type ThinkingEffort } from "@/types";
import { Send, Loader2, Settings, Pin } from "lucide-react";
import { quickCapture, linkNodes } from "@/api";

interface ChatPanelProps {
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onNavigateToSettings?: () => void;
  taskId?: number;
  resourceId?: number;
  contextResourceIds: number[];
  onContextRefresh?: () => void;
}

export function ChatPanel({
  width,
  tempWidth,
  isResizing,
  onMouseDown,
  onNavigateToSettings,
  taskId,
  resourceId,
  contextResourceIds,
  onContextRefresh,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const { configuredProviders, selectedModel, setSelectedModel } = useAIConfig();
  const {
    messages,
    isChatLoading,
    chatError: error,
    sendMessage,
    loadSessionMessages,
    clearMessages,
  } = useChatMessage();
  const [chatInput, setChatInput] = useState("");
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>("low");
  const [pinningIndex, setPinningIndex] = useState<number | null>(null);
  const hasSessionContext = !!taskId || !!resourceId;
  const anchorNodeId = taskId || resourceId;

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
    if (!hasSessionContext) return;
    const content = chatInput;
    setChatInput("");
    try {
      await sendMessage(content, {
        task_id: taskId,
        resource_id: resourceId,
        thinking_effort: thinkingEffort,
        context_resource_ids: contextResourceIds,
      });
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

  // Pin 对话到上下文（创建资源并关联）
  const handlePinToContext = async (assistantMsgIndex: number) => {
    // 找到对应的用户消息（应该在 assistant 消息之前）
    const assistantMsg = messages[assistantMsgIndex];
    const userMsg = messages[assistantMsgIndex - 1];

    if (!userMsg || userMsg.role !== "user" || !assistantMsg) return;
    if (!anchorNodeId) return;

    setPinningIndex(assistantMsgIndex);
    try {
      // 1. 创建 Resource 保存对话内容
      const content = `## 提问\n${userMsg.content}\n\n## 回答\n${assistantMsg.content}`;
      const title = userMsg.content.slice(0, 50) + (userMsg.content.length > 50 ? "..." : "");

      const response = await quickCapture({
        content,
        file_type: "text",
        title: title,
      });

      // 2. 关联到当前上下文节点
      if (response.node_id) {
        await linkNodes(anchorNodeId, response.node_id, "contains");
      }

      // 3. 刷新上下文列表
      onContextRefresh?.();
    } catch (e) {
      console.error("Failed to pin conversation:", e);
    } finally {
      setPinningIndex(null);
    }
  };

  useEffect(() => {
    if (!hasSessionContext) {
      clearMessages();
      return;
    }
    void loadSessionMessages({
      task_id: taskId,
      resource_id: resourceId,
    }, {
      context_resource_ids: contextResourceIds,
    });
  }, [
    taskId,
    resourceId,
    contextResourceIds,
    loadSessionMessages,
    clearMessages,
    hasSessionContext,
  ]);

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
          <div className="flex items-center gap-2">
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
            <Select
              value={thinkingEffort}
              onValueChange={(value) => setThinkingEffort(value as ThinkingEffort)}
            >
              <SelectTrigger className="w-[110px] h-8 text-xs">
                <SelectValue placeholder={t("workspace", "thinkingEffort")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("workspace", "effortNone")}</SelectItem>
                <SelectItem value="low">{t("workspace", "effortLow")}</SelectItem>
                <SelectItem value="high">{t("workspace", "effortHigh")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  "flex gap-3 group relative",
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
                  {msg.role === "assistant" && msg.usage && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t("workspace", "tokenUsage")}{" "}
                      {msg.usage.input_tokens}/{msg.usage.output_tokens}/
                      {msg.usage.total_tokens}
                    </div>
                  )}
                </div>
                {/* Pin 按钮：仅在 assistant 消息且有前序 user 消息时显示 */}
                {msg.role === "assistant" && idx > 0 && messages[idx - 1]?.role === "user" && anchorNodeId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -bottom-1 right-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handlePinToContext(idx)}
                    disabled={pinningIndex === idx}
                    title={t("workspace", "pinToContext")}
                  >
                    {pinningIndex === idx ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
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
              disabled={
                !chatInput.trim() ||
                !selectedModel ||
                isChatLoading ||
                !hasSessionContext
              }
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
