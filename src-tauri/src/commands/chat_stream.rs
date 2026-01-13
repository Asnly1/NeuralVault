//! Chat stream command
//! Handles streaming chat with LLM providers

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::{
    app_state::AppState,
    db::{
        get_node_by_id, insert_chat_message, insert_message_attachments, list_chat_messages,
        list_message_attachments_with_node, list_session_bound_resources,
        update_chat_message_contents, update_chat_session, NewChatMessage, NewMessageAttachment,
        ResourceSubtype,
    },
    services::{ChatMessage, ChatRole, ChatStreamEvent},
    utils::resolve_file_path,
};

#[derive(Debug, Deserialize)]
pub struct SendChatRequest {
    pub session_id: i64,
    pub provider: String,
    pub model: String,
    pub content: String,
    pub images: Option<Vec<i64>>,
    pub files: Option<Vec<i64>>,
    pub thinking_effort: Option<String>,
    pub rag_scope: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatStreamAck {
    pub ok: bool,
}

const RAG_TOP_K: u64 = 5;

#[derive(Clone, Copy)]
enum RagScope {
    Local,
    Global,
}

fn parse_rag_scope(raw: Option<&str>) -> Result<RagScope, String> {
    match raw.unwrap_or("local") {
        "local" => Ok(RagScope::Local),
        "global" => Ok(RagScope::Global),
        other => Err(format!("invalid rag_scope: {other}")),
    }
}

/// Send chat message (stream LLM response)
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SendChatRequest,
) -> Result<ChatStreamAck, String> {
    // 1. Get API key from encrypted config
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

    // Release lock to avoid holding it during HTTP requests
    drop(config_service);

    let ai = state.ai.wait_ready().await?;

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
            thinking_summary: None,
            assistant_content: None,
            thinking_effort: request.thinking_effort.as_deref(),
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
            .map(|node_id| NewMessageAttachment {
                message_id: user_message_id,
                node_id: *node_id,
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

    // 2. Build message history with attachments
    let messages = list_chat_messages(&state.db, request.session_id)
        .await
        .map_err(|e| e.to_string())?;
    let attachments = list_message_attachments_with_node(&state.db, request.session_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut attachment_map: HashMap<i64, (Vec<String>, Vec<String>)> = HashMap::new();
    for attachment in attachments {
        let file_path = attachment.file_path.ok_or_else(|| {
            format!(
                "node {} missing file_path for attachment",
                attachment.node_id
            )
        })?;
        let abs_path = resolve_file_path(&app, &file_path)?;
        let entry = attachment_map.entry(attachment.message_id).or_default();
        match attachment.resource_subtype {
            Some(ResourceSubtype::Image) => entry.0.push(abs_path),
            _ => entry.1.push(abs_path),
        }
    }

    let context_resources = list_session_bound_resources(&state.db, request.session_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut context_images: Vec<String> = Vec::new();
    let mut context_files: Vec<String> = Vec::new();
    let mut context_lines: Vec<String> = Vec::new();

    for resource in &context_resources {
        let display_name = resource.title.clone();

        if let Some(file_path) = resource.file_path.as_ref() {
            let abs_path = resolve_file_path(&app, file_path)?;
            match resource.resource_subtype {
                Some(ResourceSubtype::Image) => context_images.push(abs_path),
                _ => context_files.push(abs_path),
            }
            context_lines.push(format!("- [file] {}", display_name));
        } else if let Some(content) = resource.file_content.as_ref() {
            context_lines.push(format!("- [text] {}: {}", display_name, content));
        } else {
            context_lines.push(format!("- [resource] {}", display_name));
        }
    }

    let rag_scope = parse_rag_scope(request.rag_scope.as_deref()).map_err(|e| e.to_string())?;
    let scope_node_ids = match rag_scope {
        RagScope::Local => {
            let ids: Vec<i64> = context_resources.iter().map(|r| r.node_id).collect();
            if ids.is_empty() {
                None
            } else {
                Some(ids)
            }
        }
        RagScope::Global => None,
    };
    let rag_results = if matches!(rag_scope, RagScope::Global) || scope_node_ids.is_some() {
        ai.search
            .search_hybrid(&request.content, "content", scope_node_ids.as_deref(), RAG_TOP_K)
            .await
            .map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };

    let rag_context_message = if rag_results.is_empty() {
        None
    } else {
        let mut lines = Vec::new();
        for result in rag_results {
            let node = get_node_by_id(&state.db, result.node_id)
                .await
                .map_err(|e| e.to_string())?;
            lines.push(format!("- [{}] {}", node.title, result.chunk_text));
        }
        Some(ChatMessage::new(
            ChatRole::User,
            format!("Retrieved context:\n{}", lines.join("\n")),
        ))
    };

    let mut chat_messages: Vec<ChatMessage> = Vec::with_capacity(messages.len() * 2 + 2);
    if !context_images.is_empty() || !context_files.is_empty() || !context_lines.is_empty() {
        let content = if context_lines.is_empty() {
            "Context files attached.".to_string()
        } else {
            format!("Context resources:\n{}", context_lines.join("\n"))
        };
        let mut message = ChatMessage::new(ChatRole::User, content);
        message.images = context_images;
        message.files = context_files;
        chat_messages.push(message);
    }
    for message in messages {
        let (images, files) = attachment_map.remove(&message.message_id).unwrap_or_default();
        if !message.user_content.is_empty() {
            let mut chat_message = ChatMessage::new(ChatRole::User, message.user_content.clone());
            chat_message.images = images;
            chat_message.files = files;
            chat_messages.push(chat_message);
        }
        if let Some(assistant_content) = message.assistant_content.as_deref() {
            if !assistant_content.is_empty() {
                chat_messages.push(ChatMessage::new(ChatRole::Assistant, assistant_content));
            }
        }
    }
    if let Some(rag_message) = rag_context_message {
        if let Some(insert_at) = chat_messages.iter().rposition(|msg| matches!(msg.role, ChatRole::User)) {
            chat_messages.insert(insert_at, rag_message);
        } else {
            chat_messages.push(rag_message);
        }
    }

    let session_id = request.session_id;
    let provider = request.provider.clone();
    let model = request.model.clone();
    let thinking_effort = request.thinking_effort.clone();

    let assistant_accum = Arc::new(Mutex::new(String::new()));
    let thinking_accum = Arc::new(Mutex::new(String::new()));
    let usage_tokens: Arc<Mutex<Option<(i64, i64, i64, i64)>>> = Arc::new(Mutex::new(None));
    let stream_app = app.clone();

    let stream_result = ai
        .llm
        .stream_chat(
            &provider,
            &model,
            &provider_config,
            &chat_messages,
            thinking_effort.as_deref(),
            {
                let assistant_accum = assistant_accum.clone();
                let thinking_accum = thinking_accum.clone();
                let usage_tokens = usage_tokens.clone();
                let stream_app = stream_app.clone();
                move |event| {
                    let assistant_accum = assistant_accum.clone();
                    let thinking_accum = thinking_accum.clone();
                    let usage_tokens = usage_tokens.clone();
                    let stream_app = stream_app.clone();
                    async move {
                        match event {
                            ChatStreamEvent::AnswerDelta(delta) => {
                                let mut guard = assistant_accum.lock().await;
                                guard.push_str(&delta);
                                let payload = serde_json::json!({
                                    "session_id": session_id,
                                    "type": "answer_delta",
                                    "delta": delta,
                                });
                                let _ = stream_app.emit("chat-stream", payload);
                            }
                            ChatStreamEvent::ThinkingDelta(delta) => {
                                let mut guard = thinking_accum.lock().await;
                                guard.push_str(&delta);
                                let payload = serde_json::json!({
                                    "session_id": session_id,
                                    "type": "thinking_delta",
                                    "delta": delta,
                                });
                                let _ = stream_app.emit("chat-stream", payload);
                            }
                            ChatStreamEvent::AnswerFullText(full_text) => {
                                let mut guard = assistant_accum.lock().await;
                                *guard = full_text;
                            }
                            ChatStreamEvent::ThinkingFullText(full_text) => {
                                let mut guard = thinking_accum.lock().await;
                                *guard = full_text;
                            }
                            ChatStreamEvent::Usage(usage) => {
                                let mut guard = usage_tokens.lock().await;
                                *guard = Some((
                                    usage.input_tokens,
                                    usage.output_tokens,
                                    usage.reasoning_tokens,
                                    usage.total_tokens,
                                ));
                                let payload = serde_json::json!({
                                    "session_id": session_id,
                                    "type": "usage",
                                    "usage": {
                                        "input_tokens": usage.input_tokens,
                                        "output_tokens": usage.output_tokens,
                                        "reasoning_tokens": usage.reasoning_tokens,
                                        "total_tokens": usage.total_tokens,
                                    }
                                });
                                let _ = stream_app.emit("chat-stream", payload);
                            }
                            ChatStreamEvent::Error(message) => {
                                let payload = serde_json::json!({
                                    "session_id": session_id,
                                    "type": "error",
                                    "message": message,
                                });
                                let _ = stream_app.emit("chat-stream", payload);
                                return Err("LLM stream error".to_string());
                            }
                        }
                        Ok(())
                    }
                }
            },
        )
        .await;

    if let Err(err) = stream_result {
        let payload = serde_json::json!({
            "session_id": session_id,
            "type": "error",
            "message": err,
        });
        let _ = app.emit("chat-stream", payload);
        return Err("LLM stream failed".to_string());
    }

    let final_assistant = {
        let guard = assistant_accum.lock().await;
        let trimmed = guard.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(guard.clone())
        }
    };
    let final_thinking = {
        let guard = thinking_accum.lock().await;
        let trimmed = guard.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(guard.clone())
        }
    };

    let usage_tokens = *usage_tokens.lock().await;
    let usage_refs = usage_tokens
        .as_ref()
        .map(|(input, output, reasoning, total)| (input, output, reasoning, total));

    update_chat_message_contents(
        &state.db,
        user_message_id,
        None,
        final_thinking.as_deref(),
        final_assistant.as_deref(),
        None,
        usage_refs,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ChatStreamAck { ok: true })
}
