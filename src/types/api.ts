import type { TaskStatus, TaskPriority, RelationType, NodeRecord } from "./node";

// ============================================
// Task API Types
// ============================================

export interface CreateTaskRequest {
  title: string;
  user_note?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
}

export interface CreateTaskResponse {
  node: NodeRecord;
}

// ============================================
// Capture API Types
// ============================================

export interface CaptureSourceMeta {
  url?: string;
  window_title?: string;
  process_name?: string;
  captured_at?: string;
}

export interface CaptureRequest {
  content?: string;
  file_path?: string;
  file_type?: string;
  source_meta?: CaptureSourceMeta;
}

export interface CaptureResponse {
  node_id: number;
  node_uuid: string;
}

// ============================================
// Node Linking API Types
// ============================================

export interface LinkNodesRequest {
  source_node_id: number;
  target_node_id: number;
  relation_type: RelationType;
  confidence_score?: number;
  is_manual?: boolean;
}

export interface LinkNodesResponse {
  success: boolean;
}

export interface NodeListResponse {
  nodes: NodeRecord[];
}

// ============================================
// Clipboard Types
// ============================================

export type ClipboardContent =
  | { type: "Image"; data: { file_path: string; file_name: string } }
  | { type: "Files"; data: { paths: string[] } }
  | { type: "Text"; data: { content: string } }
  | { type: "Html"; data: { content: string; plain_text: string | null } }
  | { type: "Empty" };

export interface ReadClipboardResponse {
  content: ClipboardContent;
}
