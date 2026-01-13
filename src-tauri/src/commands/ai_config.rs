//! AI configuration commands
//! Handles API key management and provider settings

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::{app_state::AppState, services::ClassificationMode};

// ========== Request/Response Types ==========

#[derive(Debug, Deserialize)]
pub struct SetApiKeyRequest {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetProcessingProviderModelRequest {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Deserialize)]
pub struct SetClassificationModeRequest {
    pub mode: String,
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
    pub processing_provider: Option<String>,
    pub processing_model: Option<String>,
    pub classification_mode: ClassificationMode,
}

// ========== Commands ==========

/// Get AI config status (without exposing raw keys)
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
        processing_provider: config.processing_provider,
        processing_model: config.processing_model,
        classification_mode: config.classification_mode,
    })
}

/// Save API key
#[tauri::command]
pub async fn save_api_key(
    state: State<'_, AppState>,
    request: SetApiKeyRequest,
) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.set_api_key(&request.provider, &request.api_key, request.base_url.clone())
}

/// Remove API key
#[tauri::command]
pub async fn remove_api_key(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.remove_provider(&provider)
}

/// Set processing provider and model
#[tauri::command]
pub async fn set_processing_provider_model(
    state: State<'_, AppState>,
    request: SetProcessingProviderModelRequest,
) -> Result<(), String> {
    let config_service = state.ai_config.lock().await;
    config_service.set_processing_provider_model(&request.provider, &request.model)
}

/// Set AI classification mode
#[tauri::command]
pub async fn set_classification_mode(
    state: State<'_, AppState>,
    request: SetClassificationModeRequest,
) -> Result<(), String> {
    let mode = match request.mode.as_str() {
        "aggressive" => ClassificationMode::Aggressive,
        _ => ClassificationMode::Manual,
    };
    let config_service = state.ai_config.lock().await;
    config_service.set_classification_mode(mode)
}
