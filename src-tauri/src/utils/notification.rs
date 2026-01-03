use serde::Serialize;

use crate::db::ResourceFileType;

#[derive(Debug, Serialize)]
pub struct IngestPayload {
    pub resource_id: i64,
    pub action: String,
    pub file_hash: String,
    pub file_type: ResourceFileType,
    pub content: Option<String>,
    pub file_path: Option<String>,
}

/// 通知动作
pub enum NotifyAction {
    Created,
    Updated,
    Deleted,
}

impl NotifyAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            NotifyAction::Created => "created",
            NotifyAction::Updated => "updated",
            NotifyAction::Deleted => "deleted",
        }
    }
}

impl IngestPayload {
    pub fn new(
        resource_id: i64,
        action: NotifyAction,
        file_hash: String,
        file_type: ResourceFileType,
        content: Option<String>,
        file_path: Option<String>,
    ) -> Self {
        Self {
            resource_id,
            action: action.as_str().to_string(),
            file_hash,
            file_type,
            content,
            file_path,
        }
    }
}

/// 通知 Python 后端处理资源或任务
/// 
/// # 参数
/// - `base_url`: Python 后端的基础 URL，从 PythonSidecar.get_base_url() 获取
/// - `payload`: Ingest 请求体
pub async fn notify_python(base_url: &str, payload: &IngestPayload) {
    let client = reqwest::Client::new();
    
    if let Err(err) = client
        .post(&format!("{}/ingest", base_url))
        .json(payload)
        .send()
        .await
    {
        eprintln!("notify python failed: {err}");
    }
}
