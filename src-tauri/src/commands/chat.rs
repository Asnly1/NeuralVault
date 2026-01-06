use std::collections::HashMap;

use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        insert_chat_session, get_chat_session_by_id, list_chat_sessions_by_task,
        list_chat_sessions_by_resource, update_chat_session, soft_delete_chat_session,
        insert_chat_message, list_chat_messages as list_chat_messages_db, update_chat_message_contents, delete_chat_message,
        insert_message_attachments, list_message_attachments_with_resource,
        delete_message_attachment, ChatSessionType, NewChatMessage,
        NewChatSession, NewMessageAttachment,
    },
};

use super::{
    AddMessageAttachmentsRequest, ChatMessageAttachmentPayload, ChatMessagePayload,
    ChatUsagePayload, CreateChatMessageRequest, CreateChatMessageResponse,
    CreateChatSessionRequest, CreateChatSessionResponse, DeleteChatMessageRequest,
    DeleteChatSessionRequest, ListChatSessionsRequest, RemoveMessageAttachmentRequest,
    UpdateChatMessageRequest, UpdateChatSessionRequest,
};

#[tauri::command]
pub async fn create_chat_session(
    state: State<'_, AppState>,
    payload: CreateChatSessionRequest,
) -> Result<CreateChatSessionResponse, String> {
    let session_type = payload.session_type;

    match session_type {
        ChatSessionType::Task if payload.task_id.is_none() => {
            return Err("task_id is required for task session".to_string());
        }
        ChatSessionType::Resource if payload.resource_id.is_none() => {
            return Err("resource_id is required for resource session".to_string());
        }
        _ => {}
    }

    let session_id = insert_chat_session(
        &state.db,
        NewChatSession {
            session_type,
            task_id: payload.task_id,
            resource_id: payload.resource_id,
            title: payload.title.as_deref(),
            summary: payload.summary.as_deref(),
            chat_model: payload.chat_model.as_deref(),
            user_id: 1,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(CreateChatSessionResponse { session_id })
}

#[tauri::command]
pub async fn get_chat_session(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<crate::db::ChatSessionRecord, String> {
    get_chat_session_by_id(&state.db, session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, AppState>,
    payload: ListChatSessionsRequest,
) -> Result<Vec<crate::db::ChatSessionRecord>, String> {
    let include_deleted = payload.include_deleted.unwrap_or(false);
    match payload.session_type {
        ChatSessionType::Task => {
            let task_id = payload
                .task_id
                .ok_or_else(|| "task_id is required for task session".to_string())?;
            list_chat_sessions_by_task(&state.db, task_id, include_deleted)
                .await
                .map_err(|e| e.to_string())
        }
        ChatSessionType::Resource => {
            let resource_id = payload
                .resource_id
                .ok_or_else(|| "resource_id is required for resource session".to_string())?;
            list_chat_sessions_by_resource(&state.db, resource_id, include_deleted)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub async fn update_chat_session_command(
    state: State<'_, AppState>,
    payload: UpdateChatSessionRequest,
) -> Result<(), String> {
    update_chat_session(
        &state.db,
        payload.session_id,
        payload.title.as_deref(),
        payload.summary.as_deref(),
        payload.chat_model.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat_session_command(
    state: State<'_, AppState>,
    payload: DeleteChatSessionRequest,
) -> Result<(), String> {
    soft_delete_chat_session(&state.db, payload.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_chat_message(
    state: State<'_, AppState>,
    payload: CreateChatMessageRequest,
) -> Result<CreateChatMessageResponse, String> {
    let message_id = insert_chat_message(
        &state.db,
        NewChatMessage {
            session_id: payload.session_id,
            user_content: &payload.user_content,
            assistant_content: payload.assistant_content.as_deref(),
            ref_resource_id: payload.ref_resource_id,
            ref_chunk_id: payload.ref_chunk_id,
            input_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            total_tokens: None,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Some(resource_ids) = payload.attachment_resource_ids {
        let attachments: Vec<NewMessageAttachment> = resource_ids
            .into_iter()
            .map(|resource_id| NewMessageAttachment {
                message_id,
                resource_id,
            })
            .collect();
        insert_message_attachments(&state.db, &attachments)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(CreateChatMessageResponse { message_id })
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<ChatMessagePayload>, String> {
    let messages = list_chat_messages_db(&state.db, session_id)
        .await
        .map_err(|e| e.to_string())?;

    let attachments = list_message_attachments_with_resource(&state.db, session_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut attachment_map: HashMap<i64, Vec<ChatMessageAttachmentPayload>> = HashMap::new();
    for attachment in attachments {
        attachment_map
            .entry(attachment.message_id)
            .or_default()
            .push(ChatMessageAttachmentPayload {
                resource_id: attachment.resource_id,
            });
    }

    let payloads = messages
        .into_iter()
        .map(|message| ChatMessagePayload {
            message_id: message.message_id,
            user_content: message.user_content,
            assistant_content: message.assistant_content,
            attachments: attachment_map.remove(&message.message_id).unwrap_or_default(),
            usage: match (
                message.input_tokens,
                message.output_tokens,
                message.reasoning_tokens,
                message.total_tokens,
            ) {
                (Some(input_tokens), Some(output_tokens), Some(reasoning_tokens), Some(total_tokens)) => {
                    Some(ChatUsagePayload {
                        input_tokens,
                        output_tokens,
                        reasoning_tokens,
                        total_tokens,
                    })
                }
                _ => None,
            },
            created_at: message.created_at,
        })
        .collect();

    Ok(payloads)
}

#[tauri::command]
pub async fn update_chat_message_command(
    state: State<'_, AppState>,
    payload: UpdateChatMessageRequest,
) -> Result<(), String> {
    update_chat_message_contents(
        &state.db,
        payload.message_id,
        payload.user_content.as_deref(),
        payload.assistant_content.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat_message_command(
    state: State<'_, AppState>,
    payload: DeleteChatMessageRequest,
) -> Result<(), String> {
    delete_chat_message(&state.db, payload.message_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_message_attachments(
    state: State<'_, AppState>,
    payload: AddMessageAttachmentsRequest,
) -> Result<(), String> {
    let attachments: Vec<NewMessageAttachment> = payload
        .resource_ids
        .into_iter()
        .map(|resource_id| NewMessageAttachment {
            message_id: payload.message_id,
            resource_id,
        })
        .collect();

    insert_message_attachments(&state.db, &attachments)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_message_attachment(
    state: State<'_, AppState>,
    payload: RemoveMessageAttachmentRequest,
) -> Result<(), String> {
    delete_message_attachment(&state.db, payload.message_id, payload.resource_id)
        .await
        .map_err(|e| e.to_string())
}
