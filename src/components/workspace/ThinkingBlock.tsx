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
  // 流式时自动展开，结束后自动折叠（除非用户手动操作过）
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  // 追踪用户是否手动点击过展开/折叠
  const [userToggled, setUserToggled] = useState(false);

  // 当流式结束时自动折叠（仅当用户没有手动操作过时）
  useEffect(() => {
    if (!isStreaming && isExpanded && !userToggled) {
      // 延迟折叠，让用户看到完整的思考内容
      const timer = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isExpanded, userToggled]);

  // 当开始流式时自动展开，并重置用户操作标记
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
      setUserToggled(false); // 新的流式开始，重置用户操作状态
    }
  }, [isStreaming]);

  // 用户手动切换时设置标记
  const handleToggle = () => {
    setUserToggled(true);
    setIsExpanded(!isExpanded);
  };

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        onClick={handleToggle}
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
