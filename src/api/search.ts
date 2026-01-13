import { apiCall } from "./client";
import type { NodeRecord, SemanticSearchResult } from "../types";

// ============================================
// Search API
// ============================================

export const searchSemantic = (
  query: string,
  scopeNodeIds?: number[],
  embeddingType?: "summary" | "content",
  limit?: number
): Promise<SemanticSearchResult[]> =>
  apiCall("search_semantic", {
    query,
    scope_node_ids: scopeNodeIds,
    embedding_type: embeddingType,
    limit,
  });

export const searchKeyword = (
  query: string,
  nodeType?: "topic" | "task" | "resource",
  limit?: number
): Promise<NodeRecord[]> =>
  apiCall("search_keyword", {
    query,
    node_type: nodeType,
    limit,
  });
