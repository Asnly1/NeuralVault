//! AI 配置相关命令
//! 处理 API Key 的保存、读取和聊天请求

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, State, Emitter};
use futures_util::StreamExt;

use crate::{
    app_state::AppState,
    db::{
        NewChatMessage, NewMessageAttachment, ResourceFileType,
        insert_chat_message, insert_message_attachments, list_chat_messages,
        list_message_attachments_with_resource, update_chat_session,
        update_chat_message_assistant,
    },
    services::ProviderConfig,
    sidecar::PythonSidecar,
    utils::resolve_file_path,
};

// ========== 请求/响应类型 ==========

#[derive(Debug, Deserialize)]
pub struct SetApiKeyRequest {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetDefaultModelRequest {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Serialize)]
pub struct AIProviderStatus {
    pub has_key: bool,
    pub enabled: bool,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AIConfigStatusResponse {
    pub providers: HashMap<String, AIProviderStatus>,
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SendChatRequest {
    pub session_id: i64,
    pub provider: String,
    pub model: String,
    pub task_type: String,
    pub content: String,
    pub images: Option<Vec<i64>>,
    pub files: Option<Vec<i64>>,
    pub thinking_effort: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatStreamAck {
    pub ok: bool,
}

async fn sync_provider_config(
    python: &PythonSidecar,
    provider: &str,
    config: &ProviderConfig,
) -> Result<(), String> {
    let response = python
        .client
        .put(format!("{}/providers/{}", python.get_base_url(), provider))
        .json(&serde_json::json!({
            "api_key": config.api_key,
            "base_url": config.base_url,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to sync provider to Python: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Python provider sync failed: {}",
            response.status()
        ))
    }
}

async fn remove_provider_config(
    python: &PythonSidecar,
    provider: &str,
) -> Result<(), String> {
    let response = python
        .client
        .delete(format!("{}/providers/{}", python.get_base_url(), provider))
        .send()
        .await
        .map_err(|e| format!("Failed to remove provider from Python: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Python provider remove failed: {}",
            response.status()
        ))
    }
}

// ========== Commands ==========

/// 获取 AI 配置状态（不返回明文 key）
#[tauri::command]
pub async fn get_ai_config_status(
    state: State<'_, AppState>,
) -> Result<AIConfigStatusResponse, String> {
    let config_service = state.ai_config.lock().await;
    let config = config_service.load()?;

    let providers = config
        .providers
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                AIProviderStatus {
                    has_key: !v.api_key.is_empty(),
                    enabled: v.enabled,
                    base_url: v.base_url.clone(),
                },
            )
        })
        .collect();

    Ok(AIConfigStatusResponse {
        providers,
        default_provider: config.default_provider,
        default_model: config.default_model,
    })
}

/// 保存 API Key
#[tauri::command]
pub async fn save_api_key(
    state: State<'_, AppState>,
    request: SetApiKeyRequest,
) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.set_api_key(&request.provider, &request.api_key, request.base_url.clone())?;
    let provider_config = config_service
        .get_provider_config(&request.provider)?
        .ok_or_else(|| format!("Provider {} not configured", request.provider))?;
    drop(config_service);

    sync_provider_config(&state.python, &request.provider, &provider_config).await
}

/// 删除 API Key
#[tauri::command]
pub async fn remove_api_key(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.remove_provider(&provider)?;
    drop(config_service);

    remove_provider_config(&state.python, &provider).await
}

/// 设置默认模型
#[tauri::command]
pub async fn set_default_model(
    state: State<'_, AppState>,
    request: SetDefaultModelRequest,
) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.set_default_model(&request.provider, &request.model)
}

/// 发送聊天消息（通过 Python 调用 LLM）
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SendChatRequest,
) -> Result<ChatStreamAck, String> {
    // 1. 从加密配置获取 API Key
    let config_service = state.ai_config.lock().await;
    let provider_config = config_service
        .get_provider_config(&request.provider)?
        .ok_or_else(|| format!("Provider {} not configured", request.provider))?;

    if provider_config.api_key.is_empty() {
        return Err(format!("API key not set for {}", request.provider));
    }
    if !provider_config.enabled {
        return Err(format!("Provider {} is disabled", request.provider));
    }

    // 释放锁，避免在 HTTP 请求期间持有锁
    drop(config_service);

    let mut attachment_ids: Vec<i64> = Vec::new();
    if let Some(images) = request.images.clone() {
        attachment_ids.extend(images);
    }
    if let Some(files) = request.files.clone() {
        attachment_ids.extend(files);
    }

    let user_message_id = insert_chat_message(
        &state.db,
        NewChatMessage {
            session_id: request.session_id,
            user_content: &request.content,
            assistant_content: None,
            ref_resource_id: None,
            ref_chunk_id: None,
            input_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            total_tokens: None,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    if !attachment_ids.is_empty() {
        let attachments: Vec<NewMessageAttachment> = attachment_ids
            .iter()
            .map(|resource_id| NewMessageAttachment {
                message_id: user_message_id,
                resource_id: *resource_id,
            })
            .collect();
        insert_message_attachments(&state.db, &attachments)
            .await
            .map_err(|e| e.to_string())?;
    }

    update_chat_session(
        &state.db,
        request.session_id,
        None,
        None,
        Some(&request.model),
    )
    .await
    .map_err(|e| e.to_string())?;

    // 2. 构建历史消息与附件
    let messages = list_chat_messages(&state.db, request.session_id)
        .await
        .map_err(|e| e.to_string())?;
    let attachments = list_message_attachments_with_resource(&state.db, request.session_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut attachment_map: HashMap<i64, (Vec<String>, Vec<String>)> = HashMap::new();
    for attachment in attachments {
        let file_path = attachment.file_path.ok_or_else(|| {
            format!(
                "resource {} missing file_path for attachment",
                attachment.resource_id
            )
        })?;
        let abs_path = resolve_file_path(&app, &file_path)?;
        // 如果这个 message_id 已经有 entry → 直接拿出来用
        // 如果没有 → 插入一个默认值，再拿出来用
        // 默认值是 (Vec::new(), Vec::new())
        let entry = attachment_map.entry(attachment.message_id).or_default();
        match attachment.file_type {
            ResourceFileType::Image => entry.0.push(abs_path),
            _ => entry.1.push(abs_path),
        }
    }

    let mut python_messages: Vec<serde_json::Value> = Vec::with_capacity(messages.len() * 2);
    for message in messages {
        let (images, files) = attachment_map.remove(&message.message_id).unwrap_or_default();
        if !message.user_content.is_empty() {
            python_messages.push(serde_json::json!({
                "role": "user",
                "content": message.user_content,
                "images": images,
                "files": files,
            }));
        }
        if let Some(assistant_content) = message.assistant_content.as_deref() {
            if !assistant_content.is_empty() {
                python_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": assistant_content,
                    "images": [],
                    "files": [],
                }));
            }
        }
    }

    // 3. 调用 Python /chat/completions
    let python_request = serde_json::json!({
        "provider": request.provider,
        "model": request.model,
        "task_type": request.task_type,
        "messages": python_messages,
        "thinking_effort": request.thinking_effort,
    });

    let python_base_url = state.python.get_base_url();
    let response = state
        .python
        .stream_client
        .post(&format!("{}/chat/completions", python_base_url))
        .json(&python_request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request to Python: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Python API error ({}): {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut assistant_content: Option<String> = None;
    let mut usage: Option<serde_json::Value> = None;
    let mut usage_tokens: Option<(i64, i64, i64, i64)> = None;
    let mut done = false;

    while let Some(chunk_result) = stream.next().await {
        let bytes = chunk_result
            .map_err(|e| format!("Stream read error: {}", e))?;
        buffer.extend_from_slice(&bytes);

        while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = &buffer[..pos];
            let line = String::from_utf8_lossy(line_bytes).to_string();
            buffer.drain(..pos + 1);

            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with("data:") {
                continue;
            }

            let data = trimmed.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                continue;
            }

            let event: serde_json::Value = serde_json::from_str(data)
                .map_err(|e| format!("Failed to parse SSE payload: {}", e))?;
            let event_type = event
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            match event_type {
                "delta" => {
                    if let Some(delta) = event.get("delta").and_then(|v| v.as_str()) {
                        let payload = serde_json::json!({
                            "session_id": request.session_id,
                            "type": "delta",
                            "delta": delta,
                        });
                        let _ = app.emit("chat-stream", payload);
                    }
                }
                "done_text" => {
                    if let Some(done_text) = event.get("done_text").and_then(|v| v.as_str()) {
                        assistant_content = Some(done_text.to_string());
                    }
                }
                "usage" => {
                    if let Some(usage_value) = event.get("usage") {
                        usage = Some(usage_value.clone());
                        let input_tokens = usage_value
                            .get("input_tokens")
                            .and_then(|v| v.as_i64());
                        let output_tokens = usage_value
                            .get("output_tokens")
                            .and_then(|v| v.as_i64());
                        let reasoning_tokens = usage_value
                            .get("reasoning_tokens")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0);
                        let total_tokens = usage_value
                            .get("total_tokens")
                            .and_then(|v| v.as_i64());
                        if let (Some(input), Some(output), Some(total)) =
                            (input_tokens, output_tokens, total_tokens)
                        {
                            usage_tokens = Some((input, output, reasoning_tokens, total));
                        }
                        let payload = serde_json::json!({
                            "session_id": request.session_id,
                            "type": "usage",
                            "usage": usage_value,
                        });
                        let _ = app.emit("chat-stream", payload);
                    }
                }
                "done" => {
                    done = true;
                    break;
                }
                "error" => {
                    let payload = serde_json::json!({
                        "session_id": request.session_id,
                        "type": "error",
                        "message": event.get("message"),
                    });
                    let _ = app.emit("chat-stream", payload);
                    return Err("Python stream error".to_string());
                }
                _ => {}
            }
        }
        if done {
            break;
        }
    }

    let (input_tokens, output_tokens, reasoning_tokens, total_tokens) = match usage_tokens {
        Some((input, output, reasoning, total)) => {
            (Some(input), Some(output), Some(reasoning), Some(total))
        }
        None => (None, None, None, None),
    };

    update_chat_message_assistant(
        &state.db,
        user_message_id,
        assistant_content.as_deref(),
        input_tokens,
        output_tokens,
        reasoning_tokens,
        total_tokens,
    )
    .await
    .map_err(|e| e.to_string())?;

    let done_payload = serde_json::json!({
        "session_id": request.session_id,
        "type": "done",
        "done": true,
        "message_id": user_message_id,
        "usage": usage,
    });
    let _ = app.emit("chat-stream", done_payload);

    Ok(ChatStreamAck { ok: true })
}
