import { apiCall, apiCallVoid, apiCallArray } from "./client";
import { nodeRecordSchema, type NodeRecord, type ReviewStatus, type RelationType } from "../types";
import type { LinkNodesRequest, LinkNodesResponse, NodeListResponse } from "../types";

// ============================================
// Node 通用操作
// ============================================

/** 获取所有收藏节点 */
export const fetchPinnedNodes = (): Promise<NodeRecord[]> =>
  apiCallArray("list_pinned_nodes", nodeRecordSchema);

/** 获取所有待审核节点 */
export const fetchUnreviewedNodes = (): Promise<NodeRecord[]> =>
  apiCallArray("list_unreviewed_nodes", nodeRecordSchema);

/** 更新节点收藏状态 */
export const updateNodePinned = (nodeId: number, isPinned: boolean): Promise<void> =>
  apiCallVoid("update_node_pinned", { node_id: nodeId, is_pinned: isPinned });

/** 更新节点审核状态 */
export const updateNodeReviewStatus = (nodeId: number, reviewStatus: ReviewStatus): Promise<void> =>
  apiCallVoid("update_node_review_status", { node_id: nodeId, review_status: reviewStatus });

// ============================================
// 节点关联操作
// ============================================

/** 链接两个节点 */
export const linkNodes = (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: RelationType
): Promise<LinkNodesResponse> =>
  apiCall("link_nodes_command", {
    payload: {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation_type: relationType,
    } as LinkNodesRequest,
  });

/** 取消链接两个节点 */
export const unlinkNodes = (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: RelationType
): Promise<LinkNodesResponse> =>
  apiCall("unlink_nodes_command", {
    payload: {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation_type: relationType,
    } as LinkNodesRequest,
  });

/** 获取目标节点列表（通过关系类型） */
export const listTargetNodes = (
  sourceNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> =>
  apiCall("list_target_nodes_command", {
    source_node_id: sourceNodeId,
    relation_type: relationType,
  });

/** 获取源节点列表（通过关系类型） */
export const listSourceNodes = (
  targetNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> =>
  apiCall("list_source_nodes_command", {
    target_node_id: targetNodeId,
    relation_type: relationType,
  });
