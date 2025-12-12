use serde_json::json;

pub async fn notify_python(resource_uuid: String) {
    let client = reqwest::Client::new();
    let body = json!({ "resource_uuid": resource_uuid });
    if let Err(err) = client
        .post("http://127.0.0.1:8000/ingest/notify")
        .json(&body)
        .send()
        .await
    {
        eprintln!("notify python failed: {err}");
    }
}
