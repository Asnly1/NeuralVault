import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Pin, Loader2 } from "lucide-react";
import { ThinkingBlock } from "../ThinkingBlock";
import type { ChatMessage } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";

interface MessageBubbleProps {
  message: ChatMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  showPinButton: boolean;
  isPinning: boolean;
  onPin: () => void;
}

export function MessageBubble({
  message,
  isLastMessage,
  isStreaming,
  showPinButton,
  isPinning,
  onPin,
}: MessageBubbleProps) {
  const { t } = useLanguage();
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 group relative",
        isUser && "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-secondary" : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? "U" : "◆"}
      </div>
      <div
        className={cn(
          "rounded-lg p-3 text-sm max-w-[80%]",
          isUser ? "bg-secondary" : "bg-muted"
        )}
      >
        {/* Thinking content */}
        {!isUser && message.thinkingSummary && (
          <ThinkingBlock
            content={message.thinkingSummary}
            isStreaming={isStreaming && isLastMessage}
          />
        )}
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && message.usage && (
          <div className="mt-2 text-xs text-muted-foreground">
            {t("workspace", "tokenUsage")}{" "}
            {t("workspace", "tokenUsageInput")} {message.usage.input_tokens} /{" "}
            {t("workspace", "tokenUsageOutput")} {message.usage.output_tokens} /{" "}
            {t("workspace", "tokenUsageReasoning")} {message.usage.reasoning_tokens} /{" "}
            {t("workspace", "tokenUsageTotal")} {message.usage.total_tokens}
          </div>
        )}
      </div>
      {/* Pin button */}
      {showPinButton && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -bottom-1 right-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onPin}
          disabled={isPinning}
          title={t("workspace", "pinToContext")}
        >
          {isPinning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}
