use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::{FromRow, Pool, Sqlite, Type};

pub type DbPool = Pool<Sqlite>;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Topic,
    Task,
    Resource,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Todo,
    Done,
    Cancelled,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceSubtype {
    Text,
    Image,
    Pdf,
    Url,
    Epub,
    Other,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingType {
    Summary,
    Content,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceSyncStatus {
    Pending,
    Synced,
    Dirty,
    Error,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceProcessingStage {
    Todo,
    Chunking,
    Embedding,
    Done,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ReviewStatus {
    Unreviewed,
    Reviewed,
    Rejected,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum EdgeRelationType {
    Contains,
    RelatedTo,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Temporary,
    Persistent,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum BindingType {
    Primary,
    Implicit,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
pub struct SourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub captured_at: Option<String>,
}

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
    pub indexed_hash: Option<String>,
    pub processing_hash: Option<String>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<String>,
    pub last_error: Option<String>,
    pub processing_stage: ResourceProcessingStage,
    pub review_status: ReviewStatus,
    pub is_pinned: bool,
    pub pinned_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
}

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
    pub indexed_hash: Option<&'a str>,
    pub processing_hash: Option<&'a str>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<&'a str>,
    pub last_error: Option<&'a str>,
    pub processing_stage: ResourceProcessingStage,
    pub review_status: ReviewStatus,
}

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

pub struct NewEdge {
    pub source_node_id: i64,
    pub target_node_id: i64,
    pub relation_type: EdgeRelationType,
    pub confidence_score: Option<f64>,
    pub is_manual: bool,
}

/// Python 处理后返回的 chunk 数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkData {
    pub chunk_text: String,
    pub chunk_index: i32,
    pub page_number: Option<i32>,
    pub qdrant_uuid: String,
    pub embedding_hash: String,
    pub token_count: Option<i32>,
}

/// Python 处理结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestionResultData {
    pub node_id: i64,
    pub success: bool,
    pub chunks: Option<Vec<ChunkData>>,
    pub embedding_model: Option<String>,
    pub indexed_hash: Option<String>,
    pub error: Option<String>,
}

// ==========================================
// Chat 相关类型
// ==========================================

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

pub struct NewChatSession<'a> {
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub chat_model: Option<&'a str>,
    pub session_type: SessionType,
    pub user_id: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ChatMessageRecord {
    pub message_id: i64,
    pub session_id: i64,
    pub user_content: String,
    pub assistant_content: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub created_at: Option<String>,
}

pub struct NewChatMessage<'a> {
    pub session_id: i64,
    pub user_content: &'a str,
    pub assistant_content: Option<&'a str>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct MessageAttachmentRecord {
    pub id: i64,
    pub message_id: i64,
    pub node_id: i64,
}

pub struct NewMessageAttachment {
    pub message_id: i64,
    pub node_id: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct SessionBindingRecord {
    pub session_id: i64,
    pub node_id: i64,
    pub binding_type: BindingType,
    pub created_at: Option<String>,
}
