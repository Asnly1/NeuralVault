import { apiCall, apiCallVoid, apiCallArray } from "./client";
import { nodeRecordSchema, type NodeRecord } from "../types";
import type { CaptureRequest, CaptureResponse } from "../types";
import { listTargetNodes } from "./node";

// ============================================
// Resource 捕获
// ============================================

export const quickCapture = (request: CaptureRequest): Promise<CaptureResponse> =>
  apiCall("capture_resource", { payload: request });

// ============================================
// Resource CRUD
// ============================================

export const fetchAllResources = (): Promise<NodeRecord[]> =>
  apiCallArray("get_all_resources", nodeRecordSchema);

export const getResourceById = (nodeId: number): Promise<NodeRecord> =>
  apiCall("get_resource_by_id", { nodeId }, nodeRecordSchema);

export const softDeleteResource = (nodeId: number): Promise<void> =>
  apiCallVoid("soft_delete_resource_command", { nodeId });

export const hardDeleteResource = (nodeId: number): Promise<void> =>
  apiCallVoid("hard_delete_resource_command", { nodeId });

// ============================================
// Resource 更新
// ============================================

export const updateResourceContent = (nodeId: number, content: string): Promise<void> =>
  apiCallVoid("update_resource_content_command", { nodeId, content });

export const updateResourceTitle = (nodeId: number, title: string): Promise<void> =>
  apiCallVoid("update_resource_title_command", { nodeId, title });

export const updateResourceUserNote = (nodeId: number, userNote: string): Promise<void> =>
  apiCallVoid("update_resource_user_note_command", { nodeId, userNote });

// ============================================
// Resource Processing
// ============================================

export const processPendingResources = (): Promise<number> =>
  apiCall("process_pending_resources_command");

// ============================================
// Resource 关联查询
// ============================================

/** 获取任务关联的资源 */
export const fetchTaskResources = async (taskNodeId: number): Promise<NodeRecord[]> => {
  const response = await listTargetNodes(taskNodeId, "contains");
  return response.nodes.filter((n) => n.node_type === "resource");
};
