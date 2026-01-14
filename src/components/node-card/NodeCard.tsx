import { cn } from "@/lib/utils";
import { getNodeTypeIcon, getNodeTypeLabel } from "@/lib/nodeUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import {
  type NodeRecord,
  priorityConfig,
  resourceSubtypeIcons,
  type EdgeWithNode,
} from "@/types";
import { format } from "date-fns";
import { NodeCardActions } from "./NodeCardActions";
import { EdgeItemList } from "./EdgeItemList";
import { ContainedNodesList } from "./ContainedNodesList";

interface NodeCardProps {
  node: NodeRecord;
  onClick?: () => void;
  showReviewActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onTogglePinned?: () => void;
  onDelete?: () => void;
  onConvert?: (targetType: "task" | "topic") => void;
  onLink?: () => void;
  edgeItems?: EdgeWithNode[];
  onConfirmEdge?: (edge: EdgeWithNode) => void;
  containedNodes?: NodeRecord[];
  onContainedNodeClick?: (node: NodeRecord) => void;
}

export function NodeCard({
  node,
  onClick,
  showReviewActions,
  onApprove,
  onReject,
  onTogglePinned,
  onDelete,
  onConvert,
  onLink,
  edgeItems,
  onConfirmEdge,
  containedNodes,
  onContainedNodeClick,
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

              {node.node_type === "resource" && node.resource_subtype && (
                <span>
                  {resourceSubtypeIcons[node.resource_subtype]} {node.resource_subtype}
                </span>
              )}

              {node.created_at && (
                <span className="ml-auto">
                  {format(new Date(node.created_at), "yyyy-MM-dd")}
                </span>
              )}
            </div>

            {node.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {node.summary}
              </p>
            )}
          </div>

          {/* Actions */}
          <NodeCardActions
            node={node}
            showReviewActions={showReviewActions}
            onApprove={onApprove}
            onReject={onReject}
            onTogglePinned={onTogglePinned}
            onDelete={onDelete}
            onConvert={onConvert}
            onLink={onLink}
          />
        </div>

        {edgeItems && (
          <EdgeItemList edgeItems={edgeItems} onConfirmEdge={onConfirmEdge} />
        )}

        {containedNodes && containedNodes.length > 0 && (
          <ContainedNodesList
            containedNodes={containedNodes}
            onNodeClick={onContainedNodeClick}
          />
        )}
      </CardContent>
    </Card>
  );
}
