import { z } from "zod";

// ============================================
// 枚举类型
// ============================================

export const nodeTypeValues = ["topic", "task", "resource"] as const;
export type NodeType = (typeof nodeTypeValues)[number];

export const taskStatusValues = ["todo", "done", "cancelled"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const taskPriorityValues = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof taskPriorityValues)[number];

export const resourceSubtypeValues = ["text", "image", "pdf", "url", "epub", "other"] as const;
export type ResourceSubtype = (typeof resourceSubtypeValues)[number];

export const reviewStatusValues = ["unreviewed", "reviewed", "rejected"] as const;
export type ReviewStatus = (typeof reviewStatusValues)[number];

export const embeddingStatusValues = ["pending", "synced", "dirty", "error"] as const;
export type EmbeddingStatus = (typeof embeddingStatusValues)[number];

export const processingStageValues = ["todo", "chunking", "embedding", "done"] as const;
export type ProcessingStage = (typeof processingStageValues)[number];

export const relationTypeValues = ["contains", "related_to"] as const;
export type RelationType = (typeof relationTypeValues)[number];

// ============================================
// Zod Schemas
// ============================================

const sqliteDateSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const parsedUtc = new Date(`${normalized}Z`);
    if (!Number.isNaN(parsedUtc.getTime())) return parsedUtc;
  }
  return value;
}, z.date());

export const sourceMetaSchema = z.object({
  url: z.string().nullable().optional(),
  window_title: z.string().nullable().optional(),
  process_name: z.string().nullable().optional(),
  captured_at: z.string().nullable().optional(),
});

export type SourceMeta = z.infer<typeof sourceMetaSchema>;

export const nodeRecordSchema = z.object({
  node_id: z.number(),
  uuid: z.string(),
  user_id: z.number(),
  title: z.string(),
  summary: z.string().nullable(),
  node_type: z.enum(nodeTypeValues),
  task_status: z.enum(taskStatusValues).nullable(),
  priority: z.enum(taskPriorityValues).nullable(),
  due_date: sqliteDateSchema.nullable(),
  done_date: sqliteDateSchema.nullable(),
  file_hash: z.string().nullable(),
  file_path: z.string().nullable(),
  file_content: z.string().nullable(),
  user_note: z.string().nullable(),
  resource_subtype: z.enum(resourceSubtypeValues).nullable(),
  source_meta: sourceMetaSchema.nullable(),
  embedded_hash: z.string().nullable(),
  processing_hash: z.string().nullable(),
  embedding_status: z.enum(embeddingStatusValues),
  last_embedding_at: z.string().nullable(),
  last_embedding_error: z.string().nullable(),
  processing_stage: z.enum(processingStageValues),
  review_status: z.enum(reviewStatusValues),
  is_pinned: z.boolean(),
  pinned_at: z.string().nullable(),
  created_at: sqliteDateSchema.nullable(),
  updated_at: sqliteDateSchema.nullable(),
  is_deleted: z.boolean(),
  deleted_at: z.string().nullable(),
});

export type NodeRecord = z.infer<typeof nodeRecordSchema>;

export const edgeRecordSchema = z.object({
  edge_id: z.number(),
  source_node_id: z.number(),
  target_node_id: z.number(),
  relation_type: z.enum(relationTypeValues),
  confidence_score: z.number().nullable(),
  is_manual: z.boolean(),
  created_at: sqliteDateSchema.nullable(),
});

export type EdgeRecord = z.infer<typeof edgeRecordSchema>;

export const edgeWithNodeSchema = z.object({
  edge: edgeRecordSchema,
  node: nodeRecordSchema,
});

export type EdgeWithNode = z.infer<typeof edgeWithNodeSchema>;

export const dashboardSchema = z.object({
  tasks: z.array(nodeRecordSchema).default([]),
  resources: z.array(nodeRecordSchema).default([]),
});

export type DashboardData = z.infer<typeof dashboardSchema>;

// ============================================
// Ingest Progress Types
// ============================================

export interface IngestProgress {
  node_id: number;
  status: ProcessingStage;
  percentage?: number;
  error?: string;
}

// ============================================
// Search Types
// ============================================

export interface NodeSearchSummary {
  node_id: number;
  node_type: NodeType;
  title: string;
  summary: string | null;
}

export interface SemanticSearchResult {
  node: NodeSearchSummary;
  score: number;
}
