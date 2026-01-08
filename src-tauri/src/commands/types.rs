use serde::{Deserialize, Serialize};

use crate::db::{
    BindingType, NodeRecord, SessionType, TaskPriority, TaskStatus,
};

// ========== 捕获相关 ==========

#[derive(Debug, Deserialize)]
pub struct CaptureSourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub captured_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CaptureRequest {
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub file_type: Option<String>,
    pub source_meta: Option<CaptureSourceMeta>,
}

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub node_id: i64,
    pub node_uuid: String,
}

// ========== 任务相关 ==========

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
    pub user_note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateTaskResponse {
    pub node: NodeRecord,
}

// ========== Dashboard ==========

#[derive(Debug, Serialize)]
pub struct DashboardData {
    pub tasks: Vec<NodeRecord>,
    pub resources: Vec<NodeRecord>,
}

// ========== 关系 ==========

#[derive(Debug, Deserialize)]
pub struct LinkNodesRequest {
    pub source_node_id: i64,
    pub target_node_id: i64,
    pub relation_type: String,
    pub confidence_score: Option<f64>,
    pub is_manual: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct LinkNodesResponse {
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct NodeListResponse {
    pub nodes: Vec<NodeRecord>,
}

// ========== 剪贴板 ==========

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ClipboardContent {
    Image { file_path: String, file_name: String },
    Files { paths: Vec<String> },
    Text { content: String },
    Html { content: String, plain_text: Option<String> },
    Empty,
}

#[derive(Debug, Serialize)]
pub struct ReadClipboardResponse {
    pub content: ClipboardContent,
}

// ========== Chat Session / Message ==========

#[derive(Debug, Deserialize)]
pub struct CreateChatSessionRequest {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
    pub session_type: Option<SessionType>,
    pub context_node_ids: Option<Vec<i64>>,
    pub binding_type: Option<BindingType>,
}

#[derive(Debug, Serialize)]
pub struct CreateChatSessionResponse {
    pub session_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListChatSessionsRequest {
    pub node_id: Option<i64>,
    pub include_deleted: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChatSessionRequest {
    pub session_id: i64,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteChatSessionRequest {
    pub session_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateChatMessageRequest {
    pub session_id: i64,
    pub user_content: String,
    pub assistant_content: Option<String>,
    pub attachment_node_ids: Option<Vec<i64>>,
}

#[derive(Debug, Serialize)]
pub struct CreateChatMessageResponse {
    pub message_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChatMessageRequest {
    pub message_id: i64,
    pub user_content: Option<String>,
    pub assistant_content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteChatMessageRequest {
    pub message_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddMessageAttachmentsRequest {
    pub message_id: i64,
    pub node_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveMessageAttachmentRequest {
    pub message_id: i64,
    pub node_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct SetSessionBindingsRequest {
    pub session_id: i64,
    pub node_ids: Vec<i64>,
    pub binding_type: BindingType,
}

#[derive(Debug, Serialize)]
pub struct ChatMessageAttachmentPayload {
    pub node_id: i64,
}

#[derive(Debug, Serialize)]
pub struct ChatUsagePayload {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
}
