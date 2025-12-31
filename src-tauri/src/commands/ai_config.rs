//! AI 配置相关命令
//! 处理 API Key 的保存、读取和聊天请求

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::{app_state::AppState, commands::MessageRole};

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

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessagePayload {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct SendChatRequest {
    pub provider: String,
    pub model: String,
    pub messages: Vec<ChatMessagePayload>,
    pub context_resource_ids: Option<Vec<i64>>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub usage: Option<serde_json::Value>,
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
    config_service.set_api_key(&request.provider, &request.api_key, request.base_url)
}

/// 删除 API Key
#[tauri::command]
pub async fn remove_api_key(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.remove_provider(&provider)
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
    state: State<'_, AppState>,
    request: SendChatRequest,
) -> Result<ChatResponse, String> {
    // 1. 从加密配置获取 API Key
    let config_service = state.ai_config.lock().await;
    let provider_config = config_service
        .get_provider_config(&request.provider)?
        .ok_or_else(|| format!("Provider {} not configured", request.provider))?;

    if provider_config.api_key.is_empty() {
        return Err(format!("API key not set for {}", request.provider));
    }

    // 释放锁，避免在 HTTP 请求期间持有锁
    drop(config_service);

    // 2. 构建发给 Python 的请求
    let python_request = serde_json::json!({
        "provider": request.provider,
        "model": request.model,
        "api_key": provider_config.api_key,
        "base_url": provider_config.base_url,
        "messages": request.messages,
        "context_resource_ids": request.context_resource_ids,
    });

    // 3. 调用 Python /chat/completions
    let python_base_url = state.python.get_base_url();
    let response = state
        .python
        .client
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

    // 4. 解析响应
    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(ChatResponse {
        content: result["content"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        usage: result.get("usage").cloned(),
    })
}
