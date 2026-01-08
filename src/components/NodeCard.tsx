import { cn } from "@/lib/utils";
import { getNodeTypeIcon, getNodeTypeLabel } from "@/lib/nodeUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Star,
  StarOff,
} from "lucide-react";
import {
  NodeRecord,
  priorityConfig,
  resourceSubtypeIcons,
} from "../types";
import { format } from "date-fns";

interface NodeCardProps {
  node: NodeRecord;
  onClick?: () => void;
  showReviewActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onTogglePinned?: () => void;
}

export function NodeCard({
  node,
  onClick,
  showReviewActions,
  onApprove,
  onReject,
  onTogglePinned,
}: NodeCardProps) {
  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all hover:shadow-md border-border/50",
        onClick && "hover:border-primary/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
              node.node_type === "topic" && "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
              node.node_type === "task" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
              node.node_type === "resource" && "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            )}
          >
            {getNodeTypeIcon(node.node_type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-sm truncate">{node.title}</h3>
              {node.is_pinned && (
                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
              )}
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {getNodeTypeLabel(node.node_type)}
              </Badge>

              {/* Task specific: status & priority */}
              {node.node_type === "task" && node.task_status && (
                <Badge
                  variant={node.task_status === "done" ? "secondary" : "default"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {node.task_status}
                </Badge>
              )}
              {node.node_type === "task" && node.priority && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={{ borderColor: priorityConfig[node.priority].color }}
                >
                  {priorityConfig[node.priority].label}
                </Badge>
              )}

              {/* Resource specific: subtype */}
              {node.node_type === "resource" && node.resource_subtype && (
                <span>
                  {resourceSubtypeIcons[node.resource_subtype]} {node.resource_subtype}
                </span>
              )}

              {/* Date */}
              {node.created_at && (
                <span className="ml-auto">
                  {format(new Date(node.created_at), "yyyy-MM-dd")}
                </span>
              )}
            </div>

            {/* Summary */}
            {node.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {node.summary}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        </div>
      </CardContent>
    </Card>
  );
}
