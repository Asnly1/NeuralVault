//! 数据库记录类型定义（FromRow）

use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::FromRow;

use super::enums::*;

/// 资源来源元数据
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
pub struct SourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub captured_at: Option<String>,
}

/// 节点记录
#[derive(Debug, FromRow, Serialize)]
pub struct NodeRecord {
    pub node_id: i64,
    pub uuid: String,
    pub user_id: i64,
    pub title: String,
    pub summary: Option<String>,
    pub node_type: NodeType,
    pub task_status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
    pub done_date: Option<String>,
    pub file_hash: Option<String>,
    pub file_path: Option<String>,
    pub file_content: Option<String>,
    pub user_note: Option<String>,
    pub resource_subtype: Option<ResourceSubtype>,
    pub source_meta: Option<Json<SourceMeta>>,
    pub embedded_hash: Option<String>,
    pub processing_hash: Option<String>,
    pub embedding_status: ResourceEmbeddingStatus,
    pub last_embedding_at: Option<String>,
    pub last_embedding_error: Option<String>,
    pub processing_stage: ResourceProcessingStage,
    pub review_status: ReviewStatus,
    pub is_pinned: bool,
    pub pinned_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
}

/// 边记录
#[derive(Debug, FromRow, Serialize)]
pub struct EdgeRecord {
    pub edge_id: i64,
    pub source_node_id: i64,
    pub target_node_id: i64,
    pub relation_type: EdgeRelationType,
    pub confidence_score: Option<f64>,
    pub is_manual: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
}

/// 节点修订日志记录
#[derive(Debug, FromRow, Serialize)]
pub struct NodeRevisionLogRecord {
    pub revision_id: i64,
    pub node_id: i64,
    pub field_name: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub reason: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub confidence_score: Option<f64>,
    pub created_at: Option<String>,
}

/// 聊天会话记录
#[derive(Debug, FromRow, Serialize)]
pub struct ChatSessionRecord {
    pub session_id: i64,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
    pub session_type: SessionType,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

/// 聊天消息记录
#[derive(Debug, FromRow, Serialize)]
pub struct ChatMessageRecord {
    pub message_id: i64,
    pub session_id: i64,
    pub user_content: String,
    pub thinking_summary: Option<String>,
    pub assistant_content: Option<String>,
    pub thinking_effort: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub created_at: Option<String>,
}

