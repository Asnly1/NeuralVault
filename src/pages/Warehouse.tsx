import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  listSourceNodes,
  listTargetNodes,
  linkNodes,
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
import { getNodeTypeIcon } from "@/lib/nodeUtils";

// 仓库页面的 Tab 类型
type WarehouseTab = "all" | "topics" | "tasks" | "resources" | "inbox";

interface WarehousePageProps {
  onSelectNode: (node: NodeRecord) => void;
  onPinnedChange?: () => void; // 收藏状态变更后通知父组件
}

// Tab 配置
const tabConfig: { key: WarehouseTab; icon: React.ReactNode }[] = [
  { key: "all", icon: <Package className="h-4 w-4" /> },
  { key: "topics", icon: <Tag className="h-4 w-4" /> },
  { key: "tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { key: "resources", icon: <FileText className="h-4 w-4" /> },
  { key: "inbox", icon: <Inbox className="h-4 w-4" /> },
];

export function WarehousePage({ onSelectNode, onPinnedChange }: WarehousePageProps) {
  const [activeTab, setActiveTab] = useState<WarehouseTab>("all");
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [edgeMap, setEdgeMap] = useState<Map<number, EdgeWithNode[]>>(new Map());
  const [containedNodesMap, setContainedNodesMap] = useState<Map<number, NodeRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkingNode, setLinkingNode] = useState<NodeRecord | null>(null);
  const [linkTargets, setLinkTargets] = useState<NodeRecord[]>([]);
  const [linkedParents, setLinkedParents] = useState<NodeRecord[]>([]);
  const [linkParentId, setLinkParentId] = useState<string>("");
  const [linkTargetsLoading, setLinkTargetsLoading] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const { t } = useLanguage();

  const loadInboxEdges = useCallback(async (inboxNodes: NodeRecord[]) => {
    const entries: [number, EdgeWithNode[]][] = await Promise.all(
      inboxNodes.map(async (node): Promise<[number, EdgeWithNode[]]> => {
        try {
          const edges = await listEdgesForTarget(node.node_id, "contains");
          return [node.node_id, edges];
        } catch (err) {
          console.error("Failed to load edges for inbox node:", err);
          return [node.node_id, []];
        }
      })
    );
    setEdgeMap(new Map(entries));
  }, []);

  // 加载每个节点的 contains 关联子节点
  const loadContainedNodes = useCallback(async (nodeList: NodeRecord[]) => {
    const entries: [number, NodeRecord[]][] = await Promise.all(
      nodeList.map(async (node): Promise<[number, NodeRecord[]]> => {
        try {
          const result = await listTargetNodes(node.node_id, "contains");
          return [node.node_id, result.nodes];
        } catch (err) {
          console.error("Failed to load contained nodes:", err);
          return [node.node_id, []];
        }
      })
    );
    setContainedNodesMap(new Map(entries));
  }, []);

  // 加载数据
  const loadData = useCallback(async (tab: WarehouseTab) => {
    setLoading(true);
    setError(null);
    try {
      let loadedNodes: NodeRecord[] = [];
      switch (tab) {
        case "all": {
          // 并行获取所有类型的节点
          const [topics, tasks, resources] = await Promise.all([
            fetchAllTopics(),
            fetchAllTasks(),
            fetchAllResources(),
          ]);
          // 按创建时间倒序排列
          loadedNodes = [...topics, ...tasks, ...resources].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });
          setNodes(loadedNodes);
          break;
        }
        case "topics":
          loadedNodes = await fetchAllTopics();
          setNodes(loadedNodes);
          break;
        case "tasks":
          loadedNodes = await fetchAllTasks();
          setNodes(loadedNodes);
          break;
        case "resources":
          loadedNodes = await fetchAllResources();
          setNodes(loadedNodes);
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
        // 加载每个节点的 contains 关联子节点
        if (loadedNodes.length > 0) {
          await loadContainedNodes(loadedNodes);
        }
      }
    } catch (err) {
      console.error("Failed to load warehouse data:", err);
      setError("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [loadContainedNodes, loadInboxEdges]);

  // 获取 Inbox 计数（用于显示徽章）
  const loadInboxCount = useCallback(async () => {
    try {
      const unreviewedNodes = await fetchUnreviewedNodes();
      setInboxCount(unreviewedNodes.length);
    } catch (err) {
      console.error("Failed to load inbox count:", err);
    }
  }, []);

  const handleLinkDialogChange = useCallback((open: boolean) => {
    setLinkDialogOpen(open);
    if (!open) {
      setLinkingNode(null);
      setLinkTargets([]);
      setLinkedParents([]);
      setLinkParentId("");
      setLinkError(null);
      setLinkTargetsLoading(false);
      setLinkSubmitting(false);
    }
  }, []);

  const openLinkDialog = useCallback(async (node: NodeRecord) => {
    setLinkingNode(node);
    setLinkDialogOpen(true);
    setLinkParentId("");
    setLinkError(null);
    setLinkTargets([]);
    setLinkedParents([]);
    setLinkTargetsLoading(true);
    try {
      const [topics, tasks, parents] = await Promise.all([
        fetchAllTopics(),
        fetchAllTasks(),
        listSourceNodes(node.node_id, "contains"),
      ]);
      const existingParents = parents.nodes;
      const existingIds = new Set(existingParents.map((item) => item.node_id));
      const options = [...topics, ...tasks].filter(
        (item) => item.node_id !== node.node_id && !existingIds.has(item.node_id)
      );
      setLinkedParents(existingParents);
      setLinkTargets(options);
    } catch (err) {
      console.error("Failed to load link targets:", err);
      setLinkError(t("warehouse", "linkLoadFailed"));
    } finally {
      setLinkTargetsLoading(false);
    }
  }, [t]);

  const handleCreateLink = useCallback(async () => {
    if (!linkingNode || !linkParentId) {
      setLinkError(t("warehouse", "linkSelectError"));
      return;
    }
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      await linkNodes(Number(linkParentId), linkingNode.node_id, "contains");
      handleLinkDialogChange(false);
      await loadData(activeTab);
      await loadInboxCount();
    } catch (err) {
      console.error("Failed to link nodes:", err);
      setLinkError(t("warehouse", "linkFailed"));
    } finally {
      setLinkSubmitting(false);
    }
  }, [linkingNode, linkParentId, handleLinkDialogChange, loadData, activeTab, loadInboxCount, t]);

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
      onPinnedChange?.(); // 通知侧边栏刷新
    } catch (err) {
      console.error("Failed to toggle pinned:", err);
    }
  };

  const handleDeleteNode = async (node: NodeRecord) => {
    if (!window.confirm("确定要删除该节点吗？")) return;
    try {
      console.log("Deleting node:", node.node_id, node.node_type);
      if (node.node_type === "task") {
        await softDeleteTask(node.node_id);
      } else if (node.node_type === "resource") {
        await softDeleteResource(node.node_id);
      } else if (node.node_type === "topic") {
        await softDeleteTopic(node.node_id);
      }
      console.log("Delete successful");
      await loadData(activeTab);
      await loadInboxCount();
    } catch (err) {
      console.error("Failed to delete node:", node.node_type, node.node_id, err);
      alert(`删除失败: ${err}`);
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
      <Dialog open={linkDialogOpen} onOpenChange={handleLinkDialogChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("warehouse", "linkNode")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {linkingNode && (
              <div className="text-xs text-muted-foreground">
                {t("warehouse", "currentNode")}:{" "}
                <span className="text-foreground">
                  {linkingNode.title || t("common", "untitled")}
                </span>
              </div>
            )}

            {linkedParents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("warehouse", "linkExistingParents")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {linkedParents.map((parent) => (
                    <Badge
                      key={parent.node_id}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {getNodeTypeIcon(parent.node_type, "h-3 w-3")}
                      <span className="max-w-[200px] truncate">
                        {parent.title || t("common", "untitled")}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="warehouse-link-target">
                {t("warehouse", "linkTarget")}
              </Label>
              <Select
                value={linkParentId}
                onValueChange={setLinkParentId}
                disabled={linkTargetsLoading}
              >
                <SelectTrigger id="warehouse-link-target">
                  <SelectValue placeholder={t("warehouse", "linkTargetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {linkTargetsLoading ? (
                    <SelectItem value="loading" disabled>
                      {t("warehouse", "linkLoadingTargets")}
                    </SelectItem>
                  ) : linkTargets.length === 0 ? (
                    <SelectItem value="empty" disabled>
                      {t("warehouse", "linkNoTargets")}
                    </SelectItem>
                  ) : (
                    linkTargets.map((target) => (
                      <SelectItem key={target.node_id} value={String(target.node_id)}>
                        <div className="flex items-center gap-2">
                          {getNodeTypeIcon(target.node_type, "h-3.5 w-3.5")}
                          <span className="truncate">
                            {target.title || t("common", "untitled")}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {linkError && (
              <div className="text-xs text-destructive">
                {linkError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => handleLinkDialogChange(false)}
              disabled={linkSubmitting}
            >
              {t("warehouse", "linkCancel")}
            </Button>
            <Button
              onClick={handleCreateLink}
              disabled={!linkParentId || linkSubmitting || linkTargetsLoading}
            >
              {linkSubmitting ? t("common", "loading") : t("warehouse", "linkConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                  onLink={() => void openLinkDialog(node)}
                  edgeItems={
                    activeTab === "inbox" ? edgeMap.get(node.node_id) : undefined
                  }
                  onConfirmEdge={activeTab === "inbox" ? handleConfirmEdge : undefined}
                  containedNodes={
                    activeTab !== "inbox" ? containedNodesMap.get(node.node_id) : undefined
                  }
                  onContainedNodeClick={onSelectNode}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
