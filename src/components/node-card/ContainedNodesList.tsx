import { getNodeTypeIcon } from "@/lib/nodeUtils";
import { type NodeRecord, resourceSubtypeIcons } from "@/types";

interface ContainedNodesListProps {
  containedNodes: NodeRecord[];
  onNodeClick?: (node: NodeRecord) => void;
  maxVisible?: number;
}

function getNodeIcon(node: NodeRecord) {
  if (node.node_type === "resource" && node.resource_subtype) {
    return resourceSubtypeIcons[node.resource_subtype];
  }
  return getNodeTypeIcon(node.node_type);
}

export function ContainedNodesList({
  containedNodes,
  onNodeClick,
  maxVisible = 3,
}: ContainedNodesListProps) {
  if (containedNodes.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t text-xs">
      <div className="text-muted-foreground mb-1">包含 ({containedNodes.length})</div>
      <div className="space-y-1">
        {containedNodes.slice(0, maxVisible).map((childNode) => (
          <button
            key={childNode.node_id}
            className="w-full flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted transition-colors text-left"
            onClick={(e) => {
              e.stopPropagation();
              onNodeClick?.(childNode);
            }}
          >
            <span className="text-[10px]">
              {getNodeIcon(childNode)}
            </span>
            <span className="truncate flex-1">
              {childNode.title || "未命名"}
            </span>
          </button>
        ))}
        {containedNodes.length > maxVisible && (
          <div className="text-muted-foreground text-[10px] px-1">
            +{containedNodes.length - maxVisible} 更多...
          </div>
        )}
      </div>
    </div>
  );
}
