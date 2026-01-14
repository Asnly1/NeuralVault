//! 聊天相关命令类型

use serde::{Deserialize, Serialize};

use crate::db::{BindingType, SessionType};

/// 创建聊天会话请求
#[derive(Debug, Deserialize)]
pub struct CreateChatSessionRequest {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
    pub session_type: Option<SessionType>,
    pub context_node_ids: Option<Vec<i64>>,
    pub binding_type: Option<BindingType>,
}

/// 创建聊天会话响应
#[derive(Debug, Serialize)]
pub struct CreateChatSessionResponse {
    pub session_id: i64,
}

/// 列出聊天会话请求
#[derive(Debug, Deserialize)]
pub struct ListChatSessionsRequest {
    pub node_id: Option<i64>,
    pub include_deleted: Option<bool>,
}

/// 更新聊天会话请求
#[derive(Debug, Deserialize)]
pub struct UpdateChatSessionRequest {
    pub session_id: i64,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub chat_model: Option<String>,
}

/// 删除聊天会话请求
#[derive(Debug, Deserialize)]
pub struct DeleteChatSessionRequest {
    pub session_id: i64,
}

/// 创建聊天消息请求
#[derive(Debug, Deserialize)]
pub struct CreateChatMessageRequest {
    pub session_id: i64,
    pub user_content: String,
    pub thinking_summary: Option<String>,
    pub assistant_content: Option<String>,
    pub thinking_effort: Option<String>,
    pub attachment_node_ids: Option<Vec<i64>>,
}

/// 创建聊天消息响应
#[derive(Debug, Serialize)]
pub struct CreateChatMessageResponse {
    pub message_id: i64,
}

/// 更新聊天消息请求
#[derive(Debug, Deserialize)]
pub struct UpdateChatMessageRequest {
    pub message_id: i64,
    pub user_content: Option<String>,
    pub thinking_summary: Option<String>,
    pub assistant_content: Option<String>,
    pub thinking_effort: Option<String>,
}

/// 删除聊天消息请求
#[derive(Debug, Deserialize)]
pub struct DeleteChatMessageRequest {
    pub message_id: i64,
}

/// 添加消息附件请求
#[derive(Debug, Deserialize)]
pub struct AddMessageAttachmentsRequest {
    pub message_id: i64,
    pub node_ids: Vec<i64>,
}

/// 移除消息附件请求
#[derive(Debug, Deserialize)]
pub struct RemoveMessageAttachmentRequest {
    pub message_id: i64,
    pub node_id: i64,
}

/// 设置会话绑定请求
#[derive(Debug, Deserialize)]
pub struct SetSessionBindingsRequest {
    pub session_id: i64,
    pub node_ids: Vec<i64>,
    pub binding_type: BindingType,
}

/// 聊天消息附件信息
#[derive(Debug, Serialize)]
pub struct ChatMessageAttachmentPayload {
    pub node_id: i64,
}

