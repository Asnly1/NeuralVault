import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

import { type EdgeRecord, type EdgeWithNode, type NodeRecord } from "@/types";
import { NodeCard } from "@/components/node-card";
import {
  confirmEdge,
  fetchAllTopics,
  fetchAllTasks,
  fetchAllResources,
  fetchUnreviewedNodes,
  listAllEdges,
  listEdgesForTarget,
  listTargetNodes,
} from "@/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLinkNodes } from "@/hooks/useLinkNodes";
import { useNodeOperations } from "@/hooks/useNodeOperations";
import { LinkNodeDialog } from "./LinkNodeDialog";
import { WarehouseTabs, type WarehouseTab } from "./WarehouseTabs";
import { GraphPanel } from "./GraphPanel";

interface WarehousePageProps {
  onSelectNode: (node: NodeRecord) => void;
  onPinnedChange?: () => void;
  onDashboardRefresh?: () => Promise<void>;
}

export function WarehousePage({
  onSelectNode,
  onPinnedChange,
  onDashboardRefresh,
}: WarehousePageProps) {
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [activeTab, setActiveTab] = useState<WarehouseTab>("all");
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [graphNodes, setGraphNodes] = useState<NodeRecord[]>([]);
  const [graphEdges, setGraphEdges] = useState<EdgeRecord[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [edgeMap, setEdgeMap] = useState<Map<number, EdgeWithNode[]>>(new Map());
  const [containedNodesMap, setContainedNodesMap] = useState<Map<number, NodeRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const loadData = useCallback(async (tab: WarehouseTab) => {
    setLoading(true);
    setError(null);
    try {
      let loadedNodes: NodeRecord[] = [];
      switch (tab) {
        case "all": {
          const [topics, tasks, resources] = await Promise.all([
            fetchAllTopics(),
            fetchAllTasks(),
            fetchAllResources(),
          ]);
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

  const loadInboxCount = useCallback(async () => {
    try {
      const unreviewedNodes = await fetchUnreviewedNodes();
      setInboxCount(unreviewedNodes.length);
    } catch (err) {
      console.error("Failed to load inbox count:", err);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "list") {
      loadData(activeTab);
    }
  }, [activeTab, loadData, viewMode]);

  useEffect(() => {
    loadInboxCount();
  }, [loadInboxCount]);

  const loadGraphData = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const [topics, tasks, resources, edges] = await Promise.all([
        fetchAllTopics(),
        fetchAllTasks(),
        fetchAllResources(),
        listAllEdges(),
      ]);
      setGraphNodes([...topics, ...tasks, ...resources]);
      setGraphEdges(edges);
    } catch (err) {
      console.error("Failed to load graph data:", err);
      setGraphError(t("warehouse", "graphLoadFailed"));
    } finally {
      setGraphLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (viewMode === "graph") {
      void loadGraphData();
    }
  }, [loadGraphData, viewMode]);

  const refreshWarehouseData = useCallback(async () => {
    await loadData(activeTab);
    await loadInboxCount();
    await onDashboardRefresh?.();
  }, [activeTab, loadData, loadInboxCount, onDashboardRefresh]);

  // Link nodes hook
  const linkNodes = useLinkNodes({
    onSuccess: refreshWarehouseData,
    getErrorMessage: (key: string) => t("warehouse", key),
  });

  // Node operations hook
  const nodeOps = useNodeOperations({
    onSuccess: refreshWarehouseData,
    onPinnedChange,
  });

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
      <LinkNodeDialog {...linkNodes} />

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-medium">{t("warehouse", "title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5 bg-background">
            <Button
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              onClick={() => setViewMode("list")}
            >
              {t("warehouse", "viewList")}
            </Button>
            <Button
              size="sm"
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              onClick={() => setViewMode("graph")}
            >
              {t("warehouse", "viewGraph")}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (viewMode === "graph") {
                void loadGraphData();
              } else {
                void loadData(activeTab);
              }
            }}
            disabled={viewMode === "graph" ? graphLoading : loading}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                viewMode === "graph"
                  ? graphLoading && "animate-spin"
                  : loading && "animate-spin"
              )}
            />
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <>
          <WarehouseTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            inboxCount={inboxCount}
          />

          {/* Node list */}
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
                      onApprove={() => nodeOps.approveNode(node)}
                      onReject={() => nodeOps.rejectNode(node)}
                      onTogglePinned={() => nodeOps.togglePinned(node)}
                      onDelete={() => nodeOps.deleteNode(node)}
                      onConvert={(targetType) => nodeOps.convertNode(node, targetType)}
                      onLink={() => void linkNodes.openDialog(node)}
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
        </>
      ) : (
        <GraphPanel
          nodes={graphNodes}
          edges={graphEdges}
          loading={graphLoading}
          error={graphError}
          onNodeClick={onSelectNode}
          onRefresh={loadGraphData}
        />
      )}
    </div>
  );
}
