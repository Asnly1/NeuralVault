import { useCallback } from "react";
import {
  updateNodeReviewStatus,
  updateNodePinned,
  convertResourceToTask,
  convertResourceToTopic,
  convertTaskToTopic,
  convertTopicToTask,
  confirmEdge,
} from "@/api/node";
import { softDeleteTask } from "@/api/task";
import { softDeleteResource } from "@/api/resource";
import { softDeleteTopic } from "@/api/topic";
import type { NodeRecord, EdgeWithNode } from "@/types";

export interface UseNodeOperationsOptions {
  onSuccess?: () => void;
  onPinnedChange?: () => void;
}

export interface NodeOperationsActions {
  approveNode: (node: NodeRecord) => Promise<void>;
  rejectNode: (node: NodeRecord) => Promise<void>;
  togglePinned: (node: NodeRecord) => Promise<void>;
  deleteNode: (node: NodeRecord, skipConfirm?: boolean) => Promise<boolean>;
  convertNode: (node: NodeRecord, targetType: "task" | "topic") => Promise<NodeRecord | null>;
  confirmEdgeRelation: (edge: EdgeWithNode) => Promise<void>;
}

export function useNodeOperations(
  options: UseNodeOperationsOptions = {}
): NodeOperationsActions {
  const { onSuccess, onPinnedChange } = options;

  const approveNode = useCallback(
    async (node: NodeRecord) => {
      await updateNodeReviewStatus(node.node_id, "reviewed");
      onSuccess?.();
    },
    [onSuccess]
  );

  const rejectNode = useCallback(
    async (node: NodeRecord) => {
      await updateNodeReviewStatus(node.node_id, "rejected");
      onSuccess?.();
    },
    [onSuccess]
  );

  const togglePinned = useCallback(
    async (node: NodeRecord) => {
      await updateNodePinned(node.node_id, !node.is_pinned);
      onSuccess?.();
      onPinnedChange?.();
    },
    [onSuccess, onPinnedChange]
  );

  const deleteNode = useCallback(
    async (node: NodeRecord, skipConfirm = false): Promise<boolean> => {
      if (!skipConfirm && !window.confirm("确定要删除该节点吗？")) {
        return false;
      }

      switch (node.node_type) {
        case "task":
          await softDeleteTask(node.node_id);
          break;
        case "resource":
          await softDeleteResource(node.node_id);
          break;
        case "topic":
          await softDeleteTopic(node.node_id);
          break;
      }
      onSuccess?.();
      return true;
    },
    [onSuccess]
  );

  const convertNode = useCallback(
    async (
      node: NodeRecord,
      targetType: "task" | "topic"
    ): Promise<NodeRecord | null> => {
      let result: NodeRecord | null = null;

      if (node.node_type === "resource" && targetType === "task") {
        result = await convertResourceToTask(node.node_id);
      } else if (node.node_type === "resource" && targetType === "topic") {
        result = await convertResourceToTopic(node.node_id);
      } else if (node.node_type === "task" && targetType === "topic") {
        result = await convertTaskToTopic(node.node_id);
      } else if (node.node_type === "topic" && targetType === "task") {
        result = await convertTopicToTask(node.node_id);
      }

      onSuccess?.();
      return result;
    },
    [onSuccess]
  );

  const confirmEdgeRelation = useCallback(async (edge: EdgeWithNode) => {
    await confirmEdge(
      edge.edge.source_node_id,
      edge.edge.target_node_id,
      edge.edge.relation_type
    );
  }, []);

  return {
    approveNode,
    rejectNode,
    togglePinned,
    deleteNode,
    convertNode,
    confirmEdgeRelation,
  };
}
