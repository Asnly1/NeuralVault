use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::{FromRow, Pool, Sqlite, Type};

pub type DbPool = Pool<Sqlite>;

// sqlx::migrate!() 是一个宏（Macro）。它会在编译时查找你项目根目录下的 migrations 文件夹（你需要自己创建这个文件夹，并在里面放 .sql 文件）。
// 它会把这些 SQL 文件的内容"打包"进你最后编译出来的二进制可执行文件中。
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
// Type: 告诉 sqlx 枚举对应数据库里的什么类型。在 sqlx 中没有声明类型，默认为String
// Clone + Copy: 把数据直接进行按位复制，而不是移动所有权
// Clone: 表示这个类型可以被显式地复制（通过调用 .clone() 方法）
// Copy: 表示这个类型可以被隐式地复制（通过 = 赋值）
// Rust 规定： 如果一个类型想要支持隐式复制 (Copy)，它必须先支持显式复制 (Clone)。Copy 依赖于 Clone。
// 逻辑是：既然系统能自动帮你复制（Copy），那你手动复制（Clone）肯定也是没问题的。
#[sqlx(rename_all = "lowercase")]
//  这告诉 sqlx 把枚举变体映射为小写字符串存入数据库
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Todo,
    Done,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, FromRow, PartialEq, Serialize)]
// Debug: 允许你用 {:?} 格式化打印这个结构体
// FromRow: 告诉 sqlx 如何把数据库查询结果的一行自动"映射"成 Rust 结构体
// PartialEq 和 Eq: 允许比较两个TaskRecord 是否相等（使用 == 操作符）
// PartialEq：只满足对称性（a == b => b == a）和传递性（a == b && b == c => a == c）
// Eq：在 PartialEq 的基础上，还必须满足自反性（a == a）
// Nan != Nan, 所以f32和f64不能实现Eq
// Json<Value>包含浮点数，所以不能用Eq
pub struct TaskRecord {
    pub task_id: i64,
    pub uuid: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub status: TaskStatus,
    pub done_date: Option<String>,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

pub struct NewTask<'a> {
    pub uuid: &'a str,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<&'a str>,
    pub user_id: i64,
}

// HUD 来源元数据，存 JSON
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
// Serialize: 它会自动把你的 SourceMeta { url: Some("..."), ... } 变成类似 {"url": "...", "window_title": "..."} 的字符串
// Deserialize: 它会自动解析输入的 JSON 字符串，并尝试构建出一个合法的 SourceMeta 结构体实例。
pub struct SourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceSyncStatus {
    Pending,
    Synced,
    Dirty,
    Error,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceProcessingStage {
    Todo,
    Chunking,
    Embedding,
    Done,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResourceFileType {
    Text,
    Image,
    Pdf,
    Url,
    Epub,
    Other,
}

#[derive(Debug, FromRow, PartialEq, Eq, Serialize)]
pub struct ResourceRecord {
    pub resource_id: i64,
    pub uuid: String,
    pub source_meta: Option<Json<SourceMeta>>,
    pub summary: Option<String>,
    pub file_hash: String,
    pub file_type: ResourceFileType,
    pub content: Option<String>,
    pub display_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub indexed_hash: Option<String>,
    pub processing_hash: Option<String>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<String>,
    pub last_error: Option<String>,
    pub processing_stage: ResourceProcessingStage,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

pub struct NewResource<'a> {
    pub uuid: &'a str,
    pub source_meta: Option<&'a SourceMeta>,
    pub summary: Option<&'a str>,
    pub file_hash: &'a str,
    pub file_type: ResourceFileType,
    pub content: Option<&'a str>,
    pub display_name: Option<&'a str>,
    pub file_path: Option<&'a str>,
    pub file_size_bytes: Option<i64>,
    pub indexed_hash: Option<&'a str>,
    pub processing_hash: Option<&'a str>,
    pub sync_status: ResourceSyncStatus,
    pub last_indexed_at: Option<&'a str>,
    pub last_error: Option<&'a str>,
    pub processing_stage: ResourceProcessingStage,
    pub user_id: i64,
}

pub struct LinkResourceParams {
    pub task_id: i64,
    pub resource_id: i64,
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
    pub resource_id: i64,
    pub success: bool,
    pub chunks: Option<Vec<ChunkData>>,
    pub embedding_model: Option<String>,
    pub indexed_hash: Option<String>,
    pub error: Option<String>,
}

// ==========================================
// Topic 相关类型
// ==========================================

#[derive(Debug, PartialEq, Eq, Clone, Copy, Type, Serialize, Deserialize)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TopicReviewStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(Debug, FromRow, PartialEq, Eq, Serialize)]
pub struct TopicRecord {
    pub topic_id: i64,
    pub title: String,
    pub summary: Option<String>,
    pub is_system_default: bool,
    pub is_favourite: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub user_id: i64,
}

pub struct NewTopic<'a> {
    pub title: &'a str,
    pub summary: Option<&'a str>,
    pub is_system_default: bool,
    pub is_favourite: bool,
    pub user_id: i64,
}

#[derive(Debug, FromRow, PartialEq, Serialize)]
pub struct TopicResourceLinkRecord {
    pub topic_id: i64,
    pub resource_id: i64,
    pub confidence_score: Option<f64>,
    pub is_auto_generated: bool,
    pub review_status: TopicReviewStatus,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

pub struct NewTopicResourceLink {
    pub topic_id: i64,
    pub resource_id: i64,
    pub confidence_score: Option<f64>,
    pub is_auto_generated: bool,
    pub review_status: TopicReviewStatus,
}

#[derive(Debug, FromRow, PartialEq, Eq, Serialize)]
pub struct TaskTopicLinkRecord {
    pub task_id: i64,
    pub topic_id: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ==========================================
// Chat 相关类型
// ==========================================

#[derive(Debug, FromRow, Serialize)]
pub struct ChatSessionRecord {
    pub session_id: i64,
    pub task_id: Option<i64>,
    pub topic_id: Option<i64>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub user_id: i64,
}

pub struct NewChatSession<'a> {
    pub task_id: Option<i64>,
    pub topic_id: Option<i64>,
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub chat_model: Option<&'a str>,
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
    pub resource_id: i64,
}

pub struct NewMessageAttachment {
    pub message_id: i64,
    pub resource_id: i64,
}
