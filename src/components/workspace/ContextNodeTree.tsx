import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, FolderOpen, Folder, Trash2 } from "lucide-react";
import { NodeRecord, resourceSubtypeIcons } from "@/types";
import { listTargetNodes } from "@/api";

interface ContextNodeTreeProps {
  nodes: NodeRecord[];
  currentResourceId?: number;
  onNodeClick: (node: NodeRecord) => void;
  onRemoveFromContext?: (resourceId: number) => Promise<void>;
  level?: number;
}

interface ContextNodeItemProps {
  node: NodeRecord;
  isActive: boolean;
  onNodeClick: (node: NodeRecord) => void;
  onRemoveFromContext?: (resourceId: number) => Promise<void>;
  level: number;
}

// 获取节点图标
function getNodeIcon(node: NodeRecord, isExpanded: boolean) {
  if (node.node_type === "topic") {
    return isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />;
  }
  if (node.node_type === "task") {
    return <span className="text-sm">📋</span>;
  }
  // resource
  return (
    <span className="text-sm">
      {node.resource_subtype ? resourceSubtypeIcons[node.resource_subtype] : "📎"}
    </span>
  );
}

// 单个节点项
function ContextNodeItem({ node, isActive, onNodeClick, onRemoveFromContext, level }: ContextNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [childNodes, setChildNodes] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // 只有 Topic 和 Task 才能展开
  const canExpand = node.node_type === "topic" || node.node_type === "task";

  // 加载子节点
  const loadChildren = useCallback(async () => {
    if (hasLoaded) return;
    setLoading(true);
    try {
      const result = await listTargetNodes(node.node_id, "contains");
      setChildNodes(result.nodes);
      setHasLoaded(true);
    } catch (err) {
      console.error("Failed to load child nodes:", err);
    } finally {
      setLoading(false);
    }
  }, [node.node_id, hasLoaded]);

  // 展开时加载子节点
  useEffect(() => {
    if (isExpanded && !hasLoaded) {
      loadChildren();
    }
  }, [isExpanded, hasLoaded, loadChildren]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleClick = () => {
    // 点击资源时选中，点击 Topic/Task 时展开
    if (node.node_type === "resource") {
      onNodeClick(node);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveFromContext) {
      void onRemoveFromContext(node.node_id);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
          isActive ? "bg-secondary" : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={handleClick}
      >
        {/* 展开/折叠按钮 */}
        {canExpand ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={handleToggle}
          >
            {loading ? (
              <span className="animate-spin">⏳</span>
            ) : isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <div className="w-5" /> // 占位
        )}

        {/* 图标 */}
        <span className="shrink-0">
          {getNodeIcon(node, isExpanded)}
        </span>

        {/* 标题 */}
        <span className="flex-1 truncate text-sm">
          {node.title || "未命名"}
        </span>

        {/* 删除按钮 - 仅顶层资源显示 */}
        {level === 0 && onRemoveFromContext && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 子节点 */}
      {isExpanded && childNodes.length > 0 && (
        <ContextNodeTree
          nodes={childNodes}
          onNodeClick={onNodeClick}
          onRemoveFromContext={onRemoveFromContext}
          level={level + 1}
        />
      )}
    </div>
  );
}

// 节点树组件
export function ContextNodeTree({
  nodes,
  currentResourceId,
  onNodeClick,
  onRemoveFromContext,
  level = 0,
}: ContextNodeTreeProps) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <ContextNodeItem
          key={node.node_id}
          node={node}
          isActive={currentResourceId === node.node_id}
          onNodeClick={onNodeClick}
          onRemoveFromContext={onRemoveFromContext}
          level={level}
        />
      ))}
    </div>
  );
}
