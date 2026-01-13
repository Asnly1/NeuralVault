import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, Package, Tag, CheckSquare, FileText, RefreshCw } from "lucide-react";

import { type EdgeWithNode, NodeRecord } from "../types";
import { NodeCard } from "../components/NodeCard";
import {
  confirmEdge,
  convertResourceToTask,
  convertResourceToTopic,
  fetchAllTopics,
  fetchAllTasks,
  fetchAllResources,
  fetchUnreviewedNodes,
  listEdgesForTarget,
  softDeleteResource,
  softDeleteTask,
  softDeleteTopic,
  convertTaskToTopic,
  convertTopicToTask,
  updateNodeReviewStatus,
  updateNodePinned,
} from "../api";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

// 仓库页面的 Tab 类型
type WarehouseTab = "all" | "topics" | "tasks" | "resources" | "inbox";

interface WarehousePageProps {
  onSelectNode: (node: NodeRecord) => void;
}

// Tab 配置
const tabConfig: { key: WarehouseTab; icon: React.ReactNode }[] = [
  { key: "all", icon: <Package className="h-4 w-4" /> },
  { key: "topics", icon: <Tag className="h-4 w-4" /> },
  { key: "tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { key: "resources", icon: <FileText className="h-4 w-4" /> },
  { key: "inbox", icon: <Inbox className="h-4 w-4" /> },
];

export function WarehousePage({ onSelectNode }: WarehousePageProps) {
  const [activeTab, setActiveTab] = useState<WarehouseTab>("all");
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [edgeMap, setEdgeMap] = useState<Map<number, EdgeWithNode[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const loadInboxEdges = useCallback(async (inboxNodes: NodeRecord[]) => {
    const entries = await Promise.all(
      inboxNodes.map(async (node) => {
        try {
          const edges = await listEdgesForTarget(node.node_id, "contains");
          return [node.node_id, edges] as const;
        } catch (err) {
          console.error("Failed to load edges for inbox node:", err);
          return [node.node_id, []] as const;
        }
      })
    );
    setEdgeMap(new Map(entries));
  }, []);

  // 加载数据
  const loadData = useCallback(async (tab: WarehouseTab) => {
    setLoading(true);
    setError(null);
    try {
      switch (tab) {
        case "all": {
          // 并行获取所有类型的节点
          const [topics, tasks, resources] = await Promise.all([
            fetchAllTopics(),
            fetchAllTasks(),
            fetchAllResources(),
          ]);
          // 按创建时间倒序排列
          const allNodes = [...topics, ...tasks, ...resources].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });
          setNodes(allNodes);
          break;
        }
        case "topics":
          setNodes(await fetchAllTopics());
          break;
        case "tasks":
          setNodes(await fetchAllTasks());
          break;
        case "resources":
          setNodes(await fetchAllResources());
          break;
        case "inbox": {
          const inboxNodes = await fetchUnreviewedNodes();
          setNodes(inboxNodes);
          await loadInboxEdges(inboxNodes);
          break;
        }
      }
      if (tab !== "inbox") {
        setEdgeMap(new Map());
      }
    } catch (err) {
      console.error("Failed to load warehouse data:", err);
      setError("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取 Inbox 计数（用于显示徽章）
  const loadInboxCount = useCallback(async () => {
    try {
      const unreviewedNodes = await fetchUnreviewedNodes();
      setInboxCount(unreviewedNodes.length);
    } catch (err) {
      console.error("Failed to load inbox count:", err);
    }
  }, []);

  // Tab 切换时加载数据
  useEffect(() => {
    loadData(activeTab);
  }, [activeTab, loadData]);

  // 初始加载 inbox 计数
  useEffect(() => {
    loadInboxCount();
  }, [loadInboxCount]);

  // 审核通过
  const handleApprove = async (node: NodeRecord) => {
    try {
      await updateNodeReviewStatus(node.node_id, "reviewed");
      await loadData(activeTab);
      await loadInboxCount();
    } catch (err) {
      console.error("Failed to approve node:", err);
    }
  };

  // 审核拒绝
  const handleReject = async (node: NodeRecord) => {
    try {
      await updateNodeReviewStatus(node.node_id, "rejected");
      await loadData(activeTab);
      await loadInboxCount();
    } catch (err) {
      console.error("Failed to reject node:", err);
    }
  };

  // 切换收藏状态
  const handleTogglePinned = async (node: NodeRecord) => {
    try {
      await updateNodePinned(node.node_id, !node.is_pinned);
      await loadData(activeTab);
    } catch (err) {
      console.error("Failed to toggle pinned:", err);
    }
  };

  const handleDeleteNode = async (node: NodeRecord) => {
    if (!confirm("确定要删除该节点吗？")) return;
    try {
      if (node.node_type === "task") {
        await softDeleteTask(node.node_id);
      } else if (node.node_type === "resource") {
        await softDeleteResource(node.node_id);
      } else if (node.node_type === "topic") {
        await softDeleteTopic(node.node_id);
      }
      await loadData(activeTab);
      await loadInboxCount();
    } catch (err) {
      console.error("Failed to delete node:", err);
    }
  };

  const handleConvert = async (node: NodeRecord, targetType: "task" | "topic") => {
    try {
      if (node.node_type === "resource" && targetType === "task") {
        await convertResourceToTask(node.node_id);
      } else if (node.node_type === "resource" && targetType === "topic") {
        await convertResourceToTopic(node.node_id);
      } else if (node.node_type === "task" && targetType === "topic") {
        await convertTaskToTopic(node.node_id);
      } else if (node.node_type === "topic" && targetType === "task") {
        await convertTopicToTask(node.node_id);
      }
      await loadData(activeTab);
    } catch (err) {
      console.error("Failed to convert node:", err);
    }
  };

  const handleConfirmEdge = async (edge: EdgeWithNode) => {
    try {
      await confirmEdge(
        edge.edge.source_node_id,
        edge.edge.target_node_id,
        edge.edge.relation_type
      );
      setEdgeMap((prev) => {
        const next = new Map(prev);
        const list = next.get(edge.edge.target_node_id) ?? [];
        next.set(
          edge.edge.target_node_id,
          list.map((item) =>
            item.edge.edge_id === edge.edge.edge_id
              ? { ...item, edge: { ...item.edge, is_manual: true } }
              : item
          )
        );
        return next;
      });
    } catch (err) {
      console.error("Failed to confirm edge:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-medium">{t("warehouse", "title")}</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadData(activeTab)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Tab 栏 */}
      <div className="flex border-b px-4 py-2 gap-2">
        {tabConfig.map(({ key, icon }) => (
          <Button
            key={key}
            variant={activeTab === key ? "default" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setActiveTab(key)}
          >
            {icon}
            {t("warehouse", key)}
            {/* Inbox 显示未审核数量 */}
            {key === "inbox" && inboxCount > 0 && activeTab !== "inbox" && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {inboxCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* 节点列表 */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {t("common", "loading")}...
            </div>
          ) : error ? (
            <div className="text-destructive text-sm bg-destructive/10 p-4 rounded-md">
              {error}
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
              <Package className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm font-medium">{t("warehouse", "empty")}</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {nodes.map((node) => (
                <NodeCard
                  key={node.node_id}
                  node={node}
                  onClick={() => onSelectNode(node)}
                  showReviewActions={activeTab === "inbox"}
                  onApprove={() => handleApprove(node)}
                  onReject={() => handleReject(node)}
                  onTogglePinned={() => handleTogglePinned(node)}
                  onDelete={() => handleDeleteNode(node)}
                  onConvert={(targetType) => handleConvert(node, targetType)}
                  edgeItems={
                    activeTab === "inbox" ? edgeMap.get(node.node_id) : undefined
                  }
                  onConfirmEdge={activeTab === "inbox" ? handleConfirmEdge : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
