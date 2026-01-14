//! 资源相关命令类型

use serde::{Deserialize, Serialize};

/// 资源来源元数据（捕获时传入）
#[derive(Debug, Deserialize)]
pub struct CaptureSourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub captured_at: Option<String>,
}

/// 资源捕获请求
#[derive(Debug, Deserialize)]
pub struct CaptureRequest {
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub file_type: Option<String>,
    pub source_meta: Option<CaptureSourceMeta>,
}

/// 资源捕获响应
#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub node_id: i64,
    pub node_uuid: String,
}

/// 剪贴板内容
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ClipboardContent {
    Image { file_path: String, file_name: String },
    Files { paths: Vec<String> },
    Text { content: String },
    Html { content: String, plain_text: Option<String> },
    Empty,
}

/// 读取剪贴板响应
#[derive(Debug, Serialize)]
pub struct ReadClipboardResponse {
    pub content: ClipboardContent,
}

