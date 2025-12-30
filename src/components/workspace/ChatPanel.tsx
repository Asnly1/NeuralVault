import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";

interface ChatPanelProps {
  chatInput: string;
  onChatInputChange: (value: string) => void;
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ChatPanel({
  chatInput,
  onChatInputChange,
  width,
  tempWidth,
  isResizing,
  onMouseDown,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const currentWidth = tempWidth !== null ? tempWidth : width;

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

      <div className="px-4 py-3 border-b shrink-0">
        <h3 className="font-semibold">{t("workspace", "aiAssistant")}</h3>
        <p className="text-xs text-muted-foreground">{t("workspace", "context")}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              ◆
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm">
              {t("workspace", "aiGreeting")}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder={t("workspace", "inputPlaceholder")}
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            className="flex-1"
          />
          <Button size="icon" disabled={!chatInput.trim()}>
            ↑
          </Button>
        </div>
      </div>
    </aside>
  );
}
