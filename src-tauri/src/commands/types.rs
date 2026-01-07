use serde::{Deserialize, Serialize};

use crate::db::{ResourceRecord, TaskPriority, TaskRecord, TaskStatus};

// ========== 捕获相关 ==========

#[derive(Debug, Deserialize)]
pub struct CaptureSourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CaptureRequest {
    pub content: Option<String>,
    pub display_name: Option<String>,
    pub file_path: Option<String>,
    pub file_type: Option<String>,
    pub source_meta: Option<CaptureSourceMeta>,
}

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub resource_id: i64,
    pub resource_uuid: String,
}

// ========== 任务相关 ==========

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String, // 必填：任务标题
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateTaskResponse {
    pub task: TaskRecord,
}

// ========== Dashboard ==========

#[derive(Debug, Serialize)]
pub struct DashboardData {
    pub tasks: Vec<TaskRecord>,
    pub resources: Vec<ResourceRecord>,
}

#[derive(Debug, Serialize)]
pub struct SeedResponse {
    pub tasks_created: usize,
    pub resources_created: usize,
}

// ========== 资源关联 ==========

/// 关联资源到任务的请求
#[derive(Debug, Deserialize)]
pub struct LinkResourceRequest {
    pub task_id: i64,
    pub resource_id: i64,
}

/// 关联/取消关联资源的响应
#[derive(Debug, Serialize)]
pub struct LinkResourceResponse {
    pub success: bool,
}

/// 获取任务资源列表响应
#[derive(Debug, Serialize)]
pub struct TaskResourcesResponse {
    pub resources: Vec<ResourceRecord>,
}

// ========== 剪贴板 ==========

/// 剪贴板内容类型
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data")]
// serde在序列化时将额外创建两个键
// 例子：ClipboardContent::Image { file_path: "/tmp/a.png".into(), file_name: "a.png".into() }
// {
//     "type": "Image",
//     "data": {
//       "file_path": "/tmp/a.png",
//       "file_name": "a.png"
//     }
//   }
pub enum ClipboardContent {
    /// 图片：返回保存后的文件路径
    Image { file_path: String, file_name: String },
    /// 文件列表：返回文件路径数组
    Files { paths: Vec<String> },
    /// 纯文本
    Text { content: String },
    /// HTML 内容
    Html { content: String, plain_text: Option<String> },
    /// 剪贴板为空
    Empty,
}

/// 读取剪贴板响应
#[derive(Debug, Serialize)]
pub struct ReadClipboardResponse {
    pub content: ClipboardContent,
}

// ========== Chat Session / Message ==========

#[derive(Debug, Deserialize)]
pub struct CreateChatSessionRequest {
    pub task_id: Option<i64>,
    pub topic_id: Option<i64>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
    pub context_resource_ids: Option<Vec<i64>>,
}

#[derive(Debug, Serialize)]
pub struct CreateChatSessionResponse {
    pub session_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListChatSessionsRequest {
    pub task_id: Option<i64>,
    pub topic_id: Option<i64>,
    pub resource_id: Option<i64>,
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
    pub attachment_resource_ids: Option<Vec<i64>>,
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
    pub resource_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveMessageAttachmentRequest {
    pub message_id: i64,
    pub resource_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct SetSessionContextResourcesRequest {
    pub session_id: i64,
    pub resource_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct ChatMessageAttachmentPayload {
    pub resource_id: i64,
}

#[derive(Debug, Serialize)]
pub struct ChatUsagePayload {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct ChatMessagePayload {
    pub message_id: i64,
    pub user_content: String,
    pub assistant_content: Option<String>,
    pub attachments: Vec<ChatMessageAttachmentPayload>,
    pub usage: Option<ChatUsagePayload>,
    pub created_at: Option<String>,
}
