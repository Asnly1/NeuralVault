use serde_json::json;

/// 通知 Python 后端处理新资源
/// base_url: Python 后端的基础 URL，从 PythonSidecar.get_base_url() 获取
/// resource_uuid: 需要处理的资源 UUID
pub async fn notify_python(base_url: &str, resource_uuid: String) {
    let client = reqwest::Client::new();
    let body = json!({ "resource_uuid": resource_uuid });
    if let Err(err) = client
        .post(&format!("{}/ingest/notify", base_url))
        .json(&body)
        .send()
        .await
    {
        eprintln!("notify python failed: {err}");
    }
}
