import { apiCall, apiCallVoid, apiCallArray } from "./client";
import { nodeRecordSchema, type NodeRecord } from "../types";

// ============================================
// Topic CRUD
// ============================================

export const createTopic = (
  title: string,
  summary?: string
): Promise<{ node: NodeRecord }> =>
  apiCall("create_topic", { payload: { title, summary } });

export const fetchAllTopics = (): Promise<NodeRecord[]> =>
  apiCallArray("list_topics_command", nodeRecordSchema);

export const getTopic = (nodeId: number): Promise<NodeRecord> =>
  apiCall("get_topic_command", { topic_id: nodeId }, nodeRecordSchema);

// ============================================
// Topic 更新
// ============================================

export const updateTopicTitle = (nodeId: number, title: string): Promise<void> =>
  apiCallVoid("update_topic_title_command", { topic_id: nodeId, title });

export const updateTopicSummary = (nodeId: number, summary: string | null): Promise<void> =>
  apiCallVoid("update_topic_summary_command", { topic_id: nodeId, summary });

export const updateTopicFavourite = (nodeId: number, isFavourite: boolean): Promise<void> =>
  apiCallVoid("update_topic_favourite_command", {
    topic_id: nodeId,
    is_favourite: isFavourite,
  });
