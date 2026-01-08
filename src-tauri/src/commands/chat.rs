use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        insert_chat_message, insert_chat_session, insert_message_attachments, list_chat_messages,
        get_chat_session_by_id, list_chat_sessions_by_node, list_message_attachments_with_node,
        list_session_bound_resources, set_session_bindings, update_chat_message_contents,
        update_chat_session, delete_chat_message as delete_chat_message_record,
        delete_message_attachment, soft_delete_chat_session,
        BindingType, NewChatMessage, NewChatSession, NewMessageAttachment, SessionType,
    },
    AppResult,
};

use super::{
    AddMessageAttachmentsRequest, ChatMessageAttachmentPayload, CreateChatMessageRequest,
    CreateChatMessageResponse, CreateChatSessionRequest, CreateChatSessionResponse,
    DeleteChatMessageRequest, DeleteChatSessionRequest, ListChatSessionsRequest,
    RemoveMessageAttachmentRequest, SetSessionBindingsRequest, UpdateChatMessageRequest,
    UpdateChatSessionRequest,
};

#[tauri::command]
pub async fn create_chat_session(
    state: State<'_, AppState>,
    payload: CreateChatSessionRequest,
) -> AppResult<CreateChatSessionResponse> {
    let session_type = payload.session_type.unwrap_or(SessionType::Temporary);
    let session_id = insert_chat_session(
        &state.db,
        NewChatSession {
            title: payload.title.as_deref(),
            summary: payload.summary.as_deref(),
            chat_model: payload.chat_model.as_deref(),
            session_type,
            user_id: 1,
        },
    )
    .await?;

    if let Some(node_ids) = payload.context_node_ids {
        let binding_type = payload.binding_type.unwrap_or(BindingType::Primary);
        set_session_bindings(&state.db, session_id, &node_ids, binding_type).await?;
    }

    Ok(CreateChatSessionResponse { session_id })
}

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, AppState>,
    payload: ListChatSessionsRequest,
) -> AppResult<Vec<crate::db::ChatSessionRecord>> {
    let include_deleted = payload.include_deleted.unwrap_or(false);
    if let Some(node_id) = payload.node_id {
        return Ok(list_chat_sessions_by_node(&state.db, node_id, include_deleted).await?);
    }
    Err("node_id is required".into())
}

#[tauri::command]
pub async fn get_chat_session(
    state: State<'_, AppState>,
    session_id: i64,
) -> AppResult<crate::db::ChatSessionRecord> {
    Ok(get_chat_session_by_id(&state.db, session_id).await?)
}

#[tauri::command]
pub async fn update_chat_session_command(
    state: State<'_, AppState>,
    payload: UpdateChatSessionRequest,
) -> AppResult<()> {
    Ok(update_chat_session(
        &state.db,
        payload.session_id,
        payload.title.as_deref(),
        payload.summary.as_deref(),
        payload.chat_model.as_deref(),
    )
    .await?)
}

#[tauri::command]
pub async fn delete_chat_session(
    state: State<'_, AppState>,
    payload: DeleteChatSessionRequest,
) -> AppResult<()> {
    Ok(soft_delete_chat_session(&state.db, payload.session_id).await?)
}

#[tauri::command]
pub async fn create_chat_message(
    state: State<'_, AppState>,
    payload: CreateChatMessageRequest,
) -> AppResult<CreateChatMessageResponse> {
    let message_id = insert_chat_message(
        &state.db,
        NewChatMessage {
            session_id: payload.session_id,
            user_content: &payload.user_content,
            assistant_content: payload.assistant_content.as_deref(),
            input_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            total_tokens: None,
        },
    )
    .await?;

    if let Some(node_ids) = payload.attachment_node_ids {
        let attachments: Vec<NewMessageAttachment> = node_ids
            .into_iter()
            .map(|node_id| NewMessageAttachment {
                message_id,
                node_id,
            })
            .collect();
        insert_message_attachments(&state.db, &attachments).await?;
    }

    Ok(CreateChatMessageResponse { message_id })
}

#[tauri::command]
pub async fn list_chat_messages_command(
    state: State<'_, AppState>,
    session_id: i64,
) -> AppResult<Vec<crate::db::ChatMessageRecord>> {
    Ok(list_chat_messages(&state.db, session_id).await?)
}

#[tauri::command]
pub async fn list_message_attachments_command(
    state: State<'_, AppState>,
    session_id: i64,
) -> AppResult<Vec<ChatMessageAttachmentPayload>> {
    let attachments = list_message_attachments_with_node(&state.db, session_id).await?;
    Ok(attachments
        .into_iter()
        .map(|attachment| ChatMessageAttachmentPayload {
            node_id: attachment.node_id,
        })
        .collect())
}

#[tauri::command]
pub async fn list_session_bound_resources_command(
    state: State<'_, AppState>,
    session_id: i64,
) -> AppResult<Vec<crate::db::SessionBoundResourceRecord>> {
    Ok(list_session_bound_resources(&state.db, session_id).await?)
}

#[tauri::command]
pub async fn update_chat_message(
    state: State<'_, AppState>,
    payload: UpdateChatMessageRequest,
) -> AppResult<()> {
    Ok(update_chat_message_contents(
        &state.db,
        payload.message_id,
        payload.user_content.as_deref(),
        payload.assistant_content.as_deref(),
        None,
    )
    .await?)
}

#[tauri::command]
pub async fn delete_chat_message(
    state: State<'_, AppState>,
    payload: DeleteChatMessageRequest,
) -> AppResult<()> {
    Ok(delete_chat_message_record(&state.db, payload.message_id).await?)
}

#[tauri::command]
pub async fn add_message_attachments(
    state: State<'_, AppState>,
    payload: AddMessageAttachmentsRequest,
) -> AppResult<()> {
    let attachments: Vec<NewMessageAttachment> = payload
        .node_ids
        .into_iter()
        .map(|node_id| NewMessageAttachment {
            message_id: payload.message_id,
            node_id,
        })
        .collect();
    Ok(insert_message_attachments(&state.db, &attachments).await?)
}

#[tauri::command]
pub async fn remove_message_attachment(
    state: State<'_, AppState>,
    payload: RemoveMessageAttachmentRequest,
) -> AppResult<()> {
    Ok(delete_message_attachment(&state.db, payload.message_id, payload.node_id).await?)
}

#[tauri::command]
pub async fn set_session_bindings_command(
    state: State<'_, AppState>,
    payload: SetSessionBindingsRequest,
) -> AppResult<()> {
    Ok(set_session_bindings(
        &state.db,
        payload.session_id,
        &payload.node_ids,
        payload.binding_type,
    )
    .await?)
}
