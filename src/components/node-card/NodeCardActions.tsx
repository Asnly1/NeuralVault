import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  X,
  Star,
  StarOff,
  Trash2,
  MoreHorizontal,
  Link2,
} from "lucide-react";
import type { NodeRecord } from "@/types";

interface NodeCardActionsProps {
  node: NodeRecord;
  showReviewActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onTogglePinned?: () => void;
  onDelete?: () => void;
  onConvert?: (targetType: "task" | "topic") => void;
  onLink?: () => void;
}

interface ConvertOption {
  type: "task" | "topic";
  label: string;
}

function getConvertOptions(node: NodeRecord): ConvertOption[] {
  if (node.node_type === "resource") {
    return [
      { type: "task", label: "转为任务" },
      { type: "topic", label: "转为主题" },
    ];
  }
  if (node.node_type === "task") {
    return [{ type: "topic", label: "转为主题" }];
  }
  if (node.node_type === "topic") {
    return [{ type: "task", label: "转为任务" }];
  }
  return [];
}

export function NodeCardActions({
  node,
  showReviewActions,
  onApprove,
  onReject,
  onTogglePinned,
  onDelete,
  onConvert,
  onLink,
}: NodeCardActionsProps) {
  const convertOptions = onConvert ? getConvertOptions(node) : [];

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {onLink && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onLink();
          }}
          title="手动关联"
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      )}

      {convertOptions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
              title="转换类型"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              节点转换
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {convertOptions.map((option) => (
              <DropdownMenuItem
                key={option.type}
                className="cursor-pointer text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert?.(option.type);
                }}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onTogglePinned && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinned();
          }}
          title={node.is_pinned ? "取消收藏" : "收藏"}
        >
          {node.is_pinned ? (
            <StarOff className="h-3.5 w-3.5" />
          ) : (
            <Star className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      {showReviewActions && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
            onClick={(e) => {
              e.stopPropagation();
              onApprove?.();
            }}
            title="通过审核"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
            onClick={(e) => {
              e.stopPropagation();
              onReject?.();
            }}
            title="拒绝"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
