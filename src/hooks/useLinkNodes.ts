import { useState, useCallback } from "react";
import {
  fetchAllTopics,
  fetchAllTasks,
  listSourceNodes,
  linkNodes,
} from "@/api";
import type { NodeRecord } from "@/types";

export interface LinkNodesState {
  isOpen: boolean;
  linkingNode: NodeRecord | null;
  linkTargets: NodeRecord[];
  linkedParents: NodeRecord[];
  selectedParentId: string;
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

export interface LinkNodesActions {
  openDialog: (node: NodeRecord) => Promise<void>;
  closeDialog: () => void;
  setSelectedParent: (id: string) => void;
  createLink: () => Promise<boolean>;
}

export interface UseLinkNodesReturn extends LinkNodesState, LinkNodesActions {}

export interface UseLinkNodesOptions {
  onSuccess?: () => void;
  getErrorMessage?: (key: string) => string;
}

export function useLinkNodes(
  options: UseLinkNodesOptions = {}
): UseLinkNodesReturn {
  const { onSuccess, getErrorMessage } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [linkingNode, setLinkingNode] = useState<NodeRecord | null>(null);
  const [linkTargets, setLinkTargets] = useState<NodeRecord[]>([]);
  const [linkedParents, setLinkedParents] = useState<NodeRecord[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setLinkingNode(null);
    setLinkTargets([]);
    setLinkedParents([]);
    setSelectedParentId("");
    setError(null);
    setLoading(false);
    setSubmitting(false);
  }, []);

  const openDialog = useCallback(
    async (node: NodeRecord) => {
      setLinkingNode(node);
      setIsOpen(true);
      setSelectedParentId("");
      setError(null);
      setLinkTargets([]);
      setLinkedParents([]);
      setLoading(true);

      try {
        const [topics, tasks, parents] = await Promise.all([
          fetchAllTopics(),
          fetchAllTasks(),
          listSourceNodes(node.node_id, "contains"),
        ]);

        const existingParents = parents.nodes;
        const existingIds = new Set(existingParents.map((item) => item.node_id));
        const targetOptions = [...topics, ...tasks].filter(
          (item) => item.node_id !== node.node_id && !existingIds.has(item.node_id)
        );

        setLinkedParents(existingParents);
        setLinkTargets(targetOptions);
      } catch (err) {
        console.error("Failed to load link targets:", err);
        setError(getErrorMessage?.("linkLoadFailed") ?? "加载关联目标失败");
      } finally {
        setLoading(false);
      }
    },
    [getErrorMessage]
  );

  const createLink = useCallback(async (): Promise<boolean> => {
    if (!linkingNode || !selectedParentId) {
      setError(getErrorMessage?.("linkSelectError") ?? "请选择关联目标");
      return false;
    }

    setSubmitting(true);
    setError(null);

    try {
      await linkNodes(Number(selectedParentId), linkingNode.node_id, "contains");
      closeDialog();
      onSuccess?.();
      return true;
    } catch (err) {
      console.error("Failed to link nodes:", err);
      setError(getErrorMessage?.("linkFailed") ?? "关联失败");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [linkingNode, selectedParentId, closeDialog, onSuccess, getErrorMessage]);

  return {
    isOpen,
    linkingNode,
    linkTargets,
    linkedParents,
    selectedParentId,
    loading,
    submitting,
    error,
    openDialog,
    closeDialog,
    setSelectedParent: setSelectedParentId,
    createLink,
  };
}
