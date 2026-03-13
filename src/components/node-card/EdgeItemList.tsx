import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getNodeTypeIcon } from "@/lib/nodeUtils";
import { type NodeRecord, resourceSubtypeIcons, type EdgeWithNode } from "@/types";

interface EdgeItemListProps {
  edgeItems: EdgeWithNode[];
  onConfirmEdge?: (edge: EdgeWithNode) => void;
}

function getEdgeNodeIcon(edgeNode: NodeRecord) {
  if (edgeNode.node_type === "resource" && edgeNode.resource_subtype) {
    return resourceSubtypeIcons[edgeNode.resource_subtype];
  }
  return getNodeTypeIcon(edgeNode.node_type);
}

export function EdgeItemList({ edgeItems, onConfirmEdge }: EdgeItemListProps) {
  return (
    <div className="mt-2 pt-2 border-t text-xs">
      <div className="text-muted-foreground mb-1">关联 Edge</div>
      {edgeItems.length === 0 ? (
        <div className="text-muted-foreground">暂无关联</div>
      ) : (
        <div className="space-y-1">
          {edgeItems.map((edgeItem) => (
            <div
              key={edgeItem.edge.edge_id}
              className="flex items-center gap-2"
            >
              <span className="text-[10px]">
                {getEdgeNodeIcon(edgeItem.node)}
              </span>
              <span className="truncate flex-1">
                {edgeItem.node.title || "未命名"}
              </span>
              {edgeItem.edge.confidence_score !== null && (
                <span className="text-[10px] text-muted-foreground">
                  {edgeItem.edge.confidence_score.toFixed(2)}
                </span>
              )}
              {edgeItem.edge.is_manual ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  已确认
                </Badge>
              ) : (
                onConfirmEdge && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmEdge(edgeItem);
                    }}
                  >
                    确认
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
