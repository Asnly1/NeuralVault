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
    scopeNodeIds,
    embeddingType,
    limit,
  });

export const searchKeyword = (
  query: string,
  nodeType?: "topic" | "task" | "resource",
  limit?: number
): Promise<NodeRecord[]> =>
  apiCall("search_keyword", {
    query,
    nodeType,
    limit,
  });
