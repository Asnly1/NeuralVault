import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchAllResources, listTargetNodes, linkNodes, unlinkNodes } from "@/api";
import type { NodeRecord } from "@/types";

export interface ContextResourcesState {
  contextResources: NodeRecord[]; // 包括Topic/Task/Resource
  allResources: NodeRecord[];
  availableResources: NodeRecord[];
  loadingResources: boolean;
  selectedResource: NodeRecord | null;
  contextResourceIds: number[];
}

export interface ContextResourcesActions {
  setSelectedResource: (resource: NodeRecord | null) => void;
  addToContext: (resource: NodeRecord) => Promise<void>;
  removeFromContext: (resourceId: number) => Promise<void>;
  refreshContext: () => Promise<void>;
  updateResource: (resource: NodeRecord) => void;
}

export interface UseContextResourcesReturn extends ContextResourcesState, ContextResourcesActions {}

interface UseContextResourcesOptions {
  selectedTask: NodeRecord | null;
  propSelectedResource: NodeRecord | null;
}

/**
 * 上下文资源管理 hook
 *
 * 管理 Workspace 的上下文资源列表
 */
export function useContextResources({
  selectedTask,
  propSelectedResource,
}: UseContextResourcesOptions): UseContextResourcesReturn {
  const [contextResources, setContextResources] = useState<NodeRecord[]>([]);
  const [allResources, setAllResources] = useState<NodeRecord[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<NodeRecord | null>(
    () => (propSelectedResource?.node_type === "resource" ? propSelectedResource : null)
  );

  // 检测模式：资源模式（直接从资源进入）或任务模式（从任务进入）
  const isResourceMode = !selectedTask && propSelectedResource?.node_type === "resource";
  const selectedContainer =
    selectedTask ?? (propSelectedResource?.node_type === "topic" ? propSelectedResource : null);

  // 计算派生状态
  const contextResourceIds = useMemo(
    () => contextResources.map((r) => r.node_id),
    [contextResources]
  );

  const availableResources = useMemo(
    () => allResources.filter((r) => !contextResourceIds.includes(r.node_id)),
    [allResources, contextResourceIds]
  );

  // 加载所有资源列表
  useEffect(() => {
    let ignore = false;
    fetchAllResources()
      .then((data) => {
        if (!ignore) setAllResources(data);
      })
      .catch((err) => {
        console.error("加载资源列表失败:", err);
        if (!ignore) setAllResources([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // 资源模式：直接使用 propSelectedResource
  useEffect(() => {
    if (isResourceMode && propSelectedResource) {
      setSelectedResource(propSelectedResource);
      setContextResources([propSelectedResource]);
    }
  }, [isResourceMode, propSelectedResource]);

  // 任务/主题模式：加载关联资源
  useEffect(() => {
    if (!selectedContainer) {
      if (!isResourceMode) {
        setContextResources([]);
        setSelectedResource(null);
      }
      return;
    }

    let ignore = false;

    const loadResources = async () => {
      setLoadingResources(true);
      try {
        // 加载所有 contains 关系的节点（包括 Topic/Task/Resource）
        const result = await listTargetNodes(selectedContainer.node_id, "contains");
        if (!ignore) {
          setContextResources(result.nodes);
          // 如果当前选中的资源不在列表中，清除选择
          if (selectedResource && !result.nodes.find((r) => r.node_id === selectedResource.node_id)) {
            setSelectedResource(null);
          }
        }
      } catch (err) {
        console.error("加载关联节点失败:", err);
        if (!ignore) {
          setContextResources([]);
        }
      } finally {
        if (!ignore) {
          setLoadingResources(false);
        }
      }
    };

    loadResources();

    return () => {
      ignore = true;
    };
  }, [selectedContainer, selectedResource, isResourceMode]);

  const addToContext = useCallback(
    async (resource: NodeRecord) => {
      if (!isResourceMode && selectedContainer) {
        try {
          await linkNodes(selectedContainer.node_id, resource.node_id, "contains");
        } catch (err) {
          console.error("保存上下文资源失败:", err);
          return;
        }
      }
      setContextResources((prev) => {
        if (prev.some((r) => r.node_id === resource.node_id)) {
          return prev;
        }
        return [...prev, resource];
      });
    },
    [isResourceMode, selectedTask]
  );

  const removeFromContext = useCallback(
    async (resourceId: number) => {
      if (!isResourceMode && selectedContainer) {
        try {
          await unlinkNodes(selectedContainer.node_id, resourceId, "contains");
        } catch (err) {
          console.error("移除上下文资源失败:", err);
          return;
        }
      }
      setContextResources((prev) => {
        const next = prev.filter((r) => r.node_id !== resourceId);
        if (selectedResource?.node_id === resourceId) {
          setSelectedResource(next[0] ?? null);
        }
        return next;
      });
    },
    [isResourceMode, selectedContainer, selectedResource]
  );

  const refreshContext = useCallback(async () => {
    if (!isResourceMode && selectedContainer) {
      try {
        // 加载所有 contains 关系的节点
        const result = await listTargetNodes(selectedContainer.node_id, "contains");
        setContextResources(result.nodes);
      } catch (err) {
        console.error("刷新上下文节点失败:", err);
      }
    }
  }, [isResourceMode, selectedContainer]);

  const updateResource = useCallback((updatedResource: NodeRecord) => {
    setSelectedResource((prev) =>
      prev?.node_id === updatedResource.node_id ? updatedResource : prev
    );
    setContextResources((prev) =>
      prev.map((r) => (r.node_id === updatedResource.node_id ? updatedResource : r))
    );
    setAllResources((prev) =>
      prev.map((r) => (r.node_id === updatedResource.node_id ? updatedResource : r))
    );
  }, []);

  return {
    // State
    contextResources,
    allResources,
    availableResources,
    loadingResources,
    selectedResource,
    contextResourceIds,
    // Actions
    setSelectedResource,
    addToContext,
    removeFromContext,
    refreshContext,
    updateResource,
  };
}
