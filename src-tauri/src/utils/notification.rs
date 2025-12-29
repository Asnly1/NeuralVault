use serde_json::json;

/// 通知类型
pub enum NotifySource {
    Resource,
    Task,
}

/// 通知动作
pub enum NotifyAction {
    Created,
    Updated,
    Deleted,
}

/// 通知 Python 后端处理资源或任务
/// 
/// # 参数
/// - `base_url`: Python 后端的基础 URL，从 PythonSidecar.get_base_url() 获取
/// - `source`: 通知类型（Resource 或 Task）
/// - `id`: 资源或任务的 ID
/// - `action`: 动作类型（Created, Updated, Deleted）
pub async fn notify_python(base_url: &str, source: NotifySource, id: i64, action: NotifyAction) {
    let client = reqwest::Client::new();
    
    let source_type = match source {
        NotifySource::Resource => "resource",
        NotifySource::Task => "task",
    };
    
    let action_str = match action {
        NotifyAction::Created => "created",
        NotifyAction::Updated => "updated",
        NotifyAction::Deleted => "deleted",
    };
    
    let body = json!({
        "source_type": source_type,
        "id": id,
        "action": action_str
    });
    
    if let Err(err) = client
        .post(&format!("{}/ingest/notify", base_url))
        .json(&body)
        .send()
        .await
    {
        eprintln!("notify python failed: {err}");
    }
}
