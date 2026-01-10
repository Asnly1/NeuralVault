use serde::Serialize;
use sqlx::FromRow;

use super::{
    BindingType, ChatMessageRecord, ChatSessionRecord, DbPool, NewChatMessage,
    NewChatSession, NewMessageAttachment, ResourceSubtype,
};

/// ChatMessage 表的完整字段列表（用于 SELECT 查询）
const MESSAGE_FIELDS: &str =
    "message_id, session_id, user_content, thinking_summary, assistant_content, thinking_effort, input_tokens, output_tokens, reasoning_tokens, total_tokens, created_at";

#[derive(Debug, FromRow)]
pub struct MessageAttachmentWithNode {
    pub message_id: i64,
    pub node_id: i64,
    pub resource_subtype: Option<ResourceSubtype>,
    pub file_path: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct SessionBoundResourceRecord {
    pub node_id: i64,
    pub resource_subtype: Option<ResourceSubtype>,
    pub file_path: Option<String>,
    pub file_content: Option<String>,
    pub title: String,
}

pub async fn insert_chat_session(
    pool: &DbPool,
    params: NewChatSession<'_>,
) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO chat_sessions (title, summary, chat_model, session_type, user_id) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(params.title)
    .bind(params.summary)
    .bind(params.chat_model)
    .bind(params.session_type)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_chat_session_by_id(
    pool: &DbPool,
    session_id: i64,
) -> Result<ChatSessionRecord, sqlx::Error> {
    sqlx::query_as::<_, ChatSessionRecord>(
        "SELECT session_id, title, summary, chat_model, session_type, created_at, updated_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await
}

pub async fn list_chat_sessions_by_node(
    pool: &DbPool,
    node_id: i64,
    include_deleted: bool,
) -> Result<Vec<ChatSessionRecord>, sqlx::Error> {
    let sql = if include_deleted {
        "SELECT s.session_id, s.title, s.summary, s.chat_model, s.session_type, s.created_at, s.updated_at, s.is_deleted, s.deleted_at, s.user_id \
         FROM chat_sessions s \
         INNER JOIN session_bindings sb ON sb.session_id = s.session_id \
         WHERE sb.node_id = ? ORDER BY s.created_at DESC"
    } else {
        "SELECT s.session_id, s.title, s.summary, s.chat_model, s.session_type, s.created_at, s.updated_at, s.is_deleted, s.deleted_at, s.user_id \
         FROM chat_sessions s \
         INNER JOIN session_bindings sb ON sb.session_id = s.session_id \
         WHERE sb.node_id = ? AND s.is_deleted = 0 ORDER BY s.created_at DESC"
    };

    sqlx::query_as::<_, ChatSessionRecord>(sql)
        .bind(node_id)
        .fetch_all(pool)
        .await
}

pub async fn update_chat_session(
    pool: &DbPool,
    session_id: i64,
    title: Option<&str>,
    summary: Option<&str>,
    chat_model: Option<&str>,
) -> Result<(), sqlx::Error> {
    // COALESCE(A, B, C): 返回第一个不是NULL的参数
    sqlx::query(
        "UPDATE chat_sessions \
         SET title = COALESCE(?, title), summary = COALESCE(?, summary), chat_model = COALESCE(?, chat_model), \
             updated_at = CURRENT_TIMESTAMP \
         WHERE session_id = ?",
    )
    .bind(title)
    .bind(summary)
    .bind(chat_model)
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn soft_delete_chat_session(pool: &DbPool, session_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE chat_sessions SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE session_id = ? AND is_deleted = 0",
    )
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn insert_chat_message(
    pool: &DbPool,
    params: NewChatMessage<'_>,
) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO chat_messages (session_id, user_content, thinking_summary, assistant_content, thinking_effort, input_tokens, output_tokens, reasoning_tokens, total_tokens) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.session_id)
    .bind(params.user_content)
    .bind(params.thinking_summary)
    .bind(params.assistant_content)
    .bind(params.thinking_effort)
    .bind(params.input_tokens)
    .bind(params.output_tokens)
    .bind(params.reasoning_tokens)
    .bind(params.total_tokens)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn list_chat_messages(
    pool: &DbPool,
    session_id: i64,
) -> Result<Vec<ChatMessageRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, message_id ASC",
        MESSAGE_FIELDS
    );
    sqlx::query_as::<_, ChatMessageRecord>(&sql)
        .bind(session_id)
        .fetch_all(pool)
        .await
}

pub async fn update_chat_message_contents(
    pool: &DbPool,
    message_id: i64,
    user_content: Option<&str>,
    thinking_summary: Option<&str>,
    assistant_content: Option<&str>,
    thinking_effort: Option<&str>,
    usage: Option<(&i64, &i64, &i64, &i64)>,
) -> Result<(), sqlx::Error> {
    let (input_tokens, output_tokens, reasoning_tokens, total_tokens) =
        usage.unwrap_or((&0, &0, &0, &0));

    sqlx::query(
        "UPDATE chat_messages \
         SET user_content = COALESCE(?, user_content), thinking_summary = COALESCE(?, thinking_summary), \
             assistant_content = COALESCE(?, assistant_content), thinking_effort = COALESCE(?, thinking_effort), \
             input_tokens = COALESCE(?, input_tokens), output_tokens = COALESCE(?, output_tokens), \
             reasoning_tokens = COALESCE(?, reasoning_tokens), total_tokens = COALESCE(?, total_tokens) \
         WHERE message_id = ?",
    )
    .bind(user_content)
    .bind(thinking_summary)
    .bind(assistant_content)
    .bind(thinking_effort)
    .bind(input_tokens)
    .bind(output_tokens)
    .bind(reasoning_tokens)
    .bind(total_tokens)
    .bind(message_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_chat_message(pool: &DbPool, message_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM chat_messages WHERE message_id = ?")
        .bind(message_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn insert_message_attachments(
    pool: &DbPool,
    attachments: &[NewMessageAttachment],
) -> Result<(), sqlx::Error> {
    for attachment in attachments {
        sqlx::query(
            "INSERT INTO message_attachments (message_id, node_id) VALUES (?, ?)",
        )
        .bind(attachment.message_id)
        .bind(attachment.node_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn list_message_attachments_with_node(
    pool: &DbPool,
    session_id: i64,
) -> Result<Vec<MessageAttachmentWithNode>, sqlx::Error> {
    sqlx::query_as::<_, MessageAttachmentWithNode>(
        "SELECT ma.message_id, ma.node_id, n.resource_subtype, n.file_path \
         FROM message_attachments ma \
         INNER JOIN chat_messages m ON m.message_id = ma.message_id \
         INNER JOIN nodes n ON n.node_id = ma.node_id \
         WHERE m.session_id = ?",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
}

pub async fn delete_message_attachment(
    pool: &DbPool,
    message_id: i64,
    node_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM message_attachments WHERE message_id = ? AND node_id = ?")
        .bind(message_id)
        .bind(node_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn set_session_bindings(
    pool: &DbPool,
    session_id: i64,
    node_ids: &[i64],
    binding_type: BindingType,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM session_bindings WHERE session_id = ? AND binding_type = ?")
        .bind(session_id)
        .bind(binding_type)
        .execute(pool)
        .await?;

    for node_id in node_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO session_bindings (session_id, node_id, binding_type) VALUES (?, ?, ?)",
        )
        .bind(session_id)
        .bind(node_id)
        .bind(binding_type)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn list_session_bound_resources(
    pool: &DbPool,
    session_id: i64,
) -> Result<Vec<SessionBoundResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, SessionBoundResourceRecord>(
        "SELECT n.node_id, n.resource_subtype, n.file_path, n.file_content, n.title \
         FROM session_bindings sb \
         INNER JOIN nodes n ON n.node_id = sb.node_id \
         WHERE sb.session_id = ? AND n.node_type = 'resource' AND n.is_deleted = 0",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
}
