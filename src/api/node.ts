import { apiCall, apiCallVoid, apiCallArray } from "./client";
import {
  nodeRecordSchema,
  edgeRecordSchema,
  edgeWithNodeSchema,
  type EdgeWithNode,
  type EdgeRecord,
  type NodeRecord,
  type ReviewStatus,
  type RelationType,
} from "../types";
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
  apiCallVoid("update_node_pinned", { nodeId, isPinned });

/** 更新节点审核状态 */
export const updateNodeReviewStatus = (nodeId: number, reviewStatus: ReviewStatus): Promise<void> =>
  apiCallVoid("update_node_review_status", { nodeId, reviewStatus });

/** 资源 -> 主题 */
export const convertResourceToTopic = (nodeId: number): Promise<NodeRecord> =>
  apiCall("convert_resource_to_topic_command", { nodeId }, nodeRecordSchema);

/** 资源 -> 任务 */
export const convertResourceToTask = (nodeId: number): Promise<NodeRecord> =>
  apiCall("convert_resource_to_task_command", { nodeId }, nodeRecordSchema);

/** 主题 -> 任务 */
export const convertTopicToTask = (nodeId: number): Promise<NodeRecord> =>
  apiCall("convert_topic_to_task_command", { nodeId }, nodeRecordSchema);

/** 任务 -> 主题 */
export const convertTaskToTopic = (nodeId: number): Promise<NodeRecord> =>
  apiCall("convert_task_to_topic_command", { nodeId }, nodeRecordSchema);

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
      sourceNodeId,
      targetNodeId,
      relationType,
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
      sourceNodeId,
      targetNodeId,
      relationType,
    } as LinkNodesRequest,
  });

/** 获取目标节点列表（通过关系类型） */
export const listTargetNodes = (
  sourceNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> =>
  apiCall("list_target_nodes_command", {
    sourceNodeId,
    relationType,
  });

/** 获取源节点列表（通过关系类型） */
export const listSourceNodes = (
  targetNodeId: number,
  relationType: RelationType
): Promise<NodeListResponse> =>
  apiCall("list_source_nodes_command", {
    targetNodeId,
    relationType,
  });

/** 获取目标节点的边信息（含来源节点） */
export const listEdgesForTarget = (
  targetNodeId: number,
  relationType: RelationType
): Promise<EdgeWithNode[]> =>
  apiCallArray("list_edges_for_target_command", edgeWithNodeSchema, {
    targetNodeId,
    relationType,
  });

/** 确认边为人工 */
export const confirmEdge = (
  sourceNodeId: number,
  targetNodeId: number,
  relationType: RelationType
): Promise<void> =>
  apiCallVoid("confirm_edge_command", {
    payload: {
      sourceNodeId,
      targetNodeId,
      relationType,
    } as LinkNodesRequest,
  });

/** 获取所有边（用于图谱） */
export const listAllEdges = (): Promise<EdgeRecord[]> =>
  apiCallArray("list_all_edges_command", edgeRecordSchema);
