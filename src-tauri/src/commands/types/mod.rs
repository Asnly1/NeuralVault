//! 命令类型模块
//!
//! 拆分为四个子模块：
//! - `resource`: 资源相关类型
//! - `task`: 任务相关类型
//! - `chat`: 聊天相关类型
//! - `common`: 通用类型

mod chat;
mod common;
mod resource;
mod task;

// 导出资源相关类型
pub use resource::{
    CaptureRequest, CaptureResponse, CaptureSourceMeta, ClipboardContent, ReadClipboardResponse,
};

// 导出任务相关类型
pub use task::{CreateTaskRequest, CreateTaskResponse};

// 导出聊天相关类型
pub use chat::{
    AddMessageAttachmentsRequest, ChatMessageAttachmentPayload, CreateChatMessageRequest,
    CreateChatMessageResponse, CreateChatSessionRequest, CreateChatSessionResponse,
    DeleteChatMessageRequest, DeleteChatSessionRequest, ListChatSessionsRequest,
    RemoveMessageAttachmentRequest, SetSessionBindingsRequest, UpdateChatMessageRequest,
    UpdateChatSessionRequest,
};

// 导出通用类型
pub use common::{DashboardData, LinkNodesRequest, LinkNodesResponse, NodeListResponse};

