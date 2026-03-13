//! 数据库输入类型定义（用于插入/创建）

use serde::Deserialize;
use serde_json::Value;
use sqlx::types::Json;

use super::enums::*;
use super::records::SourceMeta;

/// 新建节点输入
pub struct NewNode<'a> {
    pub uuid: &'a str,
    pub user_id: i64,
    pub title: &'a str,
    pub summary: Option<&'a str>,
    pub node_type: NodeType,
    pub task_status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<&'a str>,
    pub done_date: Option<&'a str>,
    pub file_hash: Option<&'a str>,
    pub file_path: Option<&'a str>,
    pub file_content: Option<&'a str>,
    pub user_note: Option<&'a str>,
    pub resource_subtype: Option<ResourceSubtype>,
    pub source_meta: Option<Json<SourceMeta>>,
    pub embedded_hash: Option<&'a str>,
    pub processing_hash: Option<&'a str>,
    pub embedding_status: ResourceEmbeddingStatus,
    pub last_embedding_at: Option<&'a str>,
    pub last_embedding_error: Option<&'a str>,
    pub processing_stage: ResourceProcessingStage,
    pub review_status: ReviewStatus,
}

/// 新建边输入
pub struct NewEdge {
    pub source_node_id: i64,
    pub target_node_id: i64,
    pub relation_type: EdgeRelationType,
    pub confidence_score: Option<f64>,
    pub is_manual: bool,
}

/// 新建节点修订日志输入
pub struct NewNodeRevisionLog<'a> {
    pub node_id: i64,
    pub field_name: &'a str,
    pub old_value: Option<&'a str>,
    pub new_value: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub provider: Option<&'a str>,
    pub model: Option<&'a str>,
    pub confidence_score: Option<f64>,
}

/// 新建聊天会话输入
pub struct NewChatSession<'a> {
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub chat_model: Option<&'a str>,
    pub session_type: SessionType,
    pub user_id: i64,
}

/// 新建聊天消息输入
pub struct NewChatMessage<'a> {
    pub session_id: i64,
    pub user_content: &'a str,
    pub thinking_summary: Option<&'a str>,
    pub assistant_content: Option<&'a str>,
    pub thinking_effort: Option<&'a str>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
}

/// 新建消息附件输入
pub struct NewMessageAttachment {
    pub message_id: i64,
    pub node_id: i64,
}

/// Embedding 结果块
#[derive(Debug, Deserialize)]
pub struct EmbedChunkResult {
    pub chunk_text: String,
    pub chunk_index: i32,
    pub vector_id: String,
    pub embedding_hash: String,
    pub token_count: Option<i32>,
    pub vector_kind: String,
    pub embedding_model: String,
    pub chunk_meta: Option<Value>,
}
