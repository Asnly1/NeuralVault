import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { ChatSession } from "@/types";

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  isLoading: boolean;
  deleteLabel: string;
  onSelect: () => void;
  onDelete: () => void;
  formatTitle: (session: ChatSession) => string;
  formatSubtitle: (session: ChatSession) => string;
}

export function SessionItem({
  session,
  isActive,
  isLoading,
  deleteLabel,
  onSelect,
  onDelete,
  formatTitle,
  formatSubtitle,
}: SessionItemProps) {
  const subtitle = formatSubtitle(session);

  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        className={cn(
          "flex-1 text-left rounded-md border px-2 py-1.5 text-xs transition-colors",
          isActive ? "bg-accent border-accent" : "hover:bg-accent/50"
        )}
        onClick={onSelect}
        disabled={isLoading}
      >
        <div className="font-medium truncate">{formatTitle(session)}</div>
        {subtitle && (
          <div className="text-[10px] text-muted-foreground truncate">
            {subtitle}
          </div>
        )}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title={deleteLabel}
        disabled={isLoading}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
