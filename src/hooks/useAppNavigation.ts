import { useState, useCallback } from "react";
import type { PageType, NodeRecord } from "@/types";

interface UseAppNavigationReturn {
  currentPage: PageType;
  selectedTask: NodeRecord | null;
  selectedResource: NodeRecord | null;
  setCurrentPage: (page: PageType) => void;
  selectTask: (task: NodeRecord) => void;
  selectResource: (resource: NodeRecord) => void;
  selectNode: (node: NodeRecord) => void;
  backToDashboard: () => void;
}

/**
 * 应用导航状态管理 hook
 *
 * 管理页面导航和选中的任务/资源
 */
export function useAppNavigation(): UseAppNavigationReturn {
  const [currentPage, setCurrentPage] = useState<PageType>("dashboard");
  const [selectedTask, setSelectedTask] = useState<NodeRecord | null>(null);
  const [selectedResource, setSelectedResource] = useState<NodeRecord | null>(null);

  const selectTask = useCallback((task: NodeRecord) => {
    setSelectedTask(task);
    setSelectedResource(null);
    setCurrentPage("workspace");
  }, []);

  const selectResource = useCallback((resource: NodeRecord) => {
    setSelectedResource(resource);
    setSelectedTask(null);
    setCurrentPage("workspace");
  }, []);

  const selectNode = useCallback((node: NodeRecord) => {
    if (node.node_type === "task") {
      setSelectedTask(node);
      setSelectedResource(null);
    } else if (node.node_type === "resource" || node.node_type === "topic") {
      setSelectedResource(node);
      setSelectedTask(null);
    }
    setCurrentPage("workspace");
  }, []);

  const backToDashboard = useCallback(() => {
    setSelectedTask(null);
    setSelectedResource(null);
    setCurrentPage("dashboard");
  }, []);

  return {
    currentPage,
    selectedTask,
    selectedResource,
    setCurrentPage,
    selectTask,
    selectResource,
    selectNode,
    backToDashboard,
  };
}
