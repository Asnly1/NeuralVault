import { useState, useEffect, useRef } from "react";
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
import { X, Send, Loader2, Settings } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAIConfig, useChatMessage } from "@/contexts/AIContext";
import { AI_PROVIDER_INFO, type ModelOption, type ThinkingEffort } from "@/types";
import { createChatSession } from "@/api";

interface TemporaryChatPanelProps {
  initialMessage?: string;
  onClose: () => void;
  onNavigateToSettings?: () => void;
}

/**
 * 临时聊天面板 - 用于 Dashboard 的独立聊天会话
 * 不绑定到任何 Task 或 Resource
 */
export function TemporaryChatPanel({
  initialMessage,
  onClose,
  onNavigateToSettings,
}: TemporaryChatPanelProps) {
  const { t } = useLanguage();
  const { configuredProviders, selectedModel, setSelectedModel } = useAIConfig();
  const {
    messages,
    isChatLoading,
    chatError: error,
    sendMessage,
    clearMessages,
  } = useChatMessage();

  const [chatInput, setChatInput] = useState("");
  const [thinkingEffort, _setThinkingEffort] = useState<ThinkingEffort>("low");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // 构建可用模型列表
  const availableModels: ModelOption[] = configuredProviders.flatMap(
    (provider) =>
      AI_PROVIDER_INFO[provider].models.map((m) => ({
        provider,
        model_id: m.id,
        display_name: `${AI_PROVIDER_INFO[provider].icon} ${m.name}`,
      }))
  );

  // 创建临时会话并发送初始消息
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initSession = async () => {
      // 清空之前的消息
      clearMessages();

      // 如果有初始消息且有选中的模型，创建会话并发送
      if (initialMessage && selectedModel) {
        setIsInitializing(true);
        try {
          // 创建临时会话
          const response = await createChatSession({
            session_type: "temporary",
            title: initialMessage.slice(0, 50),
          });
          setSessionId(response.session_id);

          // 发送初始消息 - 使用 resource_id 作为会话锚点
          // 注意：临时会话没有关联的 task 或 resource，但 sendMessage 需要至少一个
          // 这里我们用一个 hack：将 session_id 作为 resource_id
          await sendMessage(initialMessage, {
            resource_id: response.session_id,
            thinking_effort: thinkingEffort,
          });
        } catch (e) {
          console.error("Failed to initialize chat session:", e);
        } finally {
          setIsInitializing(false);
        }
      }
    };

    initSession();
  }, [initialMessage, selectedModel]);

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedModel || isChatLoading) return;

    const content = chatInput;
    setChatInput("");

    try {
      if (!sessionId) {
        // 如果还没有会话，先创建一个
        const response = await createChatSession({
          session_type: "temporary",
          title: content.slice(0, 50),
        });
        setSessionId(response.session_id);

        await sendMessage(content, {
          resource_id: response.session_id,
          thinking_effort: thinkingEffort,
        });
      } else {
        await sendMessage(content, {
          resource_id: sessionId,
          thinking_effort: thinkingEffort,
        });
      }
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && selectedModel) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  // 没有配置模型时显示提示
  if (availableModels.length === 0) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-medium">AI 助手</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 未配置提示 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Settings className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            {t("workspace", "configureApiFirst")}
          </p>
          {onNavigateToSettings && (
            <Button onClick={onNavigateToSettings}>
              {t("workspace", "goToSettings")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">AI 助手</h2>
          {/* 模型选择 */}
          <Select
            value={selectedModel ? `${selectedModel.provider}:${selectedModel.model_id}` : ""}
            onValueChange={(value) => {
              const [provider, modelId] = value.split(":");
              const model = availableModels.find(
                (m) => m.provider === provider && m.model_id === modelId
              );
              if (model) setSelectedModel(model);
            }}
          >
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue placeholder={t("workspace", "selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem
                  key={`${model.provider}:${model.model_id}`}
                  value={`${model.provider}:${model.model_id}`}
                  className="text-xs"
                >
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {isInitializing && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在初始化会话...
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.usage && (
                  <p className="text-[10px] opacity-60 mt-1">
                    {t("workspace", "tokenUsage")} {msg.usage.total_tokens}
                  </p>
                )}
              </div>
            </div>
          ))}

          {isChatLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}

          {error && (
            <div className="text-destructive text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex items-center gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("workspace", "aiPlaceholder")}
            disabled={!selectedModel || isChatLoading}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!chatInput.trim() || !selectedModel || isChatLoading}
          >
            {isChatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
