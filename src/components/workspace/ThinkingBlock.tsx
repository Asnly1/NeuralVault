import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const { t } = useLanguage();
  // 流式时展开，流式结束后折叠
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  // 当流式结束时自动折叠
  useEffect(() => {
    if (!isStreaming && isExpanded) {
      // 延迟折叠，让用户看到完整的思考内容
      const timer = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isExpanded]);

  // 当开始流式时自动展开
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Brain className="h-3 w-3" />
        <span>{t("workspace", "thinkingProcess")}</span>
        {isStreaming && (
          <span className="ml-1 animate-pulse">...</span>
        )}
      </button>
      {isExpanded && (
        <div
          className={cn(
            "mt-1.5 p-2 rounded bg-muted/30 text-xs text-muted-foreground/80 italic whitespace-pre-wrap border-l-2 border-muted-foreground/20",
            isStreaming && "animate-pulse"
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
