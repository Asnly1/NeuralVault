import { useEffect, useState } from "react";
import { listTargetNodes } from "@/api";
import { NodeRecord, nodeTypeIcons, resourceSubtypeIcons } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";

interface RelatedNodesListProps {
  nodeId: number;
  onNodeClick?: (node: NodeRecord) => void;
}

export function RelatedNodesList({ nodeId, onNodeClick }: RelatedNodesListProps) {
  const { t } = useLanguage();
  const [containedNodes, setContainedNodes] = useState<NodeRecord[]>([]);
  const [relatedNodes, setRelatedNodes] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRelatedNodes = async () => {
      setLoading(true);
      try {
        const [containsRes, relatedRes] = await Promise.all([
          listTargetNodes(nodeId, "contains"),
          listTargetNodes(nodeId, "related_to"),
        ]);
        setContainedNodes(containsRes.nodes);
        setRelatedNodes(relatedRes.nodes);
      } catch (err) {
        console.error("Failed to load related nodes:", err);
      } finally {
        setLoading(false);
      }
    };

    loadRelatedNodes();
  }, [nodeId]);

  const getNodeIcon = (node: NodeRecord) => {
    if (node.node_type === "resource" && node.resource_subtype) {
      return resourceSubtypeIcons[node.resource_subtype];
    }
    return nodeTypeIcons[node.node_type];
  };

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">
        {t("common", "loading")}...
      </div>
    );
  }

  if (containedNodes.length === 0 && relatedNodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-3 pt-3 border-t">
      {containedNodes.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground font-medium">
            {t("workspace", "containedNodes")}
          </span>
          <div className="space-y-1 mt-1.5">
            {containedNodes.map((node) => (
              <button
                key={node.node_id}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-left"
                onClick={() => onNodeClick?.(node)}
              >
                <span>{getNodeIcon(node)}</span>
                <span className="truncate flex-1">{node.title || "未命名"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {relatedNodes.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground font-medium">
            {t("workspace", "relatedNodes")}
          </span>
          <div className="space-y-1 mt-1.5">
            {relatedNodes.map((node) => (
              <button
                key={node.node_id}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-left"
                onClick={() => onNodeClick?.(node)}
              >
                <span>{getNodeIcon(node)}</span>
                <span className="truncate flex-1">{node.title || "未命名"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
