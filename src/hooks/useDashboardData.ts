import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { fetchDashboardData, fetchAllTasks, quickCapture, linkNodes } from "@/api";
import { getFileTypeFromPath } from "@/lib/utils";
import type { NodeRecord } from "@/types";

interface UseDashboardDataReturn {
  tasks: NodeRecord[];
  allTasks: NodeRecord[];
  resources: NodeRecord[];
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  reloadData: (fallbackMessage?: string) => Promise<void>;
  handleCapture: (content: string, filePath?: string) => Promise<void>;
  handleLinkResource: (resourceId: number, taskId: number) => Promise<void>;
}

/**
 * Dashboard 数据管理 hook
 *
 * 管理任务、资源数据的加载和刷新
 */
export function useDashboardData(): UseDashboardDataReturn {
  const [tasks, setTasks] = useState<NodeRecord[]>([]);
  const [allTasks, setAllTasks] = useState<NodeRecord[]>([]);
  const [resources, setResources] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadData = useCallback(async (fallbackMessage = "加载数据失败") => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData();
      setTasks(data.tasks);
      setResources(data.resources);
      const all = await fetchAllTasks();
      setAllTasks(all);
    } catch (err) {
      console.error(err);
      if (err instanceof z.ZodError) {
        setError("数据格式校验失败，请联系开发者");
      } else {
        setError(fallbackMessage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCapture = useCallback(
    async (content: string, filePath?: string) => {
      setError(null);
      try {
        if (filePath) {
          await quickCapture({
            file_path: filePath,
            file_type: getFileTypeFromPath(filePath),
            content: content || undefined,
          });
        } else if (content) {
          await quickCapture({
            content,
            file_type: "text",
          });
        }
        await reloadData();
      } catch (err) {
        console.error(err);
        setError("捕获失败");
      }
    },
    [reloadData]
  );

  const handleLinkResource = useCallback(
    async (resourceId: number, taskId: number) => {
      setError(null);
      try {
        await linkNodes(taskId, resourceId, "contains");
        await reloadData();
      } catch (err) {
        console.error(err);
        setError("关联资源失败");
      }
    },
    [reloadData]
  );

  // Initial data load
  useEffect(() => {
    reloadData("初始化数据失败");
  }, [reloadData]);

  return {
    tasks,
    allTasks,
    resources,
    loading,
    error,
    setError,
    reloadData,
    handleCapture,
    handleLinkResource,
  };
}
