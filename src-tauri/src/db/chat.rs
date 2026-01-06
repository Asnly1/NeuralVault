use sqlx::FromRow;

use super::{
    ChatMessageRecord, ChatSessionRecord, DbPool, MessageAttachmentRecord,
    NewChatMessage, NewChatSession, NewMessageAttachment, ResourceFileType,
};

#[derive(Debug, FromRow)]
pub struct MessageAttachmentWithResource {
    pub message_id: i64,
    pub resource_id: i64,
    pub file_type: ResourceFileType,
    pub file_path: Option<String>,
}

pub async fn insert_chat_session(
    pool: &DbPool,
    params: NewChatSession<'_>,
) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO chat_sessions (session_type, task_id, resource_id, title, summary, chat_model, user_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.session_type)
    .bind(params.task_id)
    .bind(params.resource_id)
    .bind(params.title)
    .bind(params.summary)
    .bind(params.chat_model)
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
        "SELECT session_id, session_type, task_id, resource_id, title, summary, chat_model, created_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await
}

pub async fn list_chat_sessions_by_task(
    pool: &DbPool,
    task_id: i64,
    include_deleted: bool,
) -> Result<Vec<ChatSessionRecord>, sqlx::Error> {
    let sql = if include_deleted {
        "SELECT session_id, session_type, task_id, resource_id, title, summary, chat_model, created_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE task_id = ? ORDER BY created_at DESC"
    } else {
        "SELECT session_id, session_type, task_id, resource_id, title, summary, chat_model, created_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE task_id = ? AND is_deleted = 0 ORDER BY created_at DESC"
    };

    sqlx::query_as::<_, ChatSessionRecord>(sql)
        .bind(task_id)
        .fetch_all(pool)
        .await
}

pub async fn list_chat_sessions_by_resource(
    pool: &DbPool,
    resource_id: i64,
    include_deleted: bool,
) -> Result<Vec<ChatSessionRecord>, sqlx::Error> {
    let sql = if include_deleted {
        "SELECT session_id, session_type, task_id, resource_id, title, summary, chat_model, created_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE resource_id = ? ORDER BY created_at DESC"
    } else {
        "SELECT session_id, session_type, task_id, resource_id, title, summary, chat_model, created_at, is_deleted, deleted_at, user_id \
         FROM chat_sessions WHERE resource_id = ? AND is_deleted = 0 ORDER BY created_at DESC"
    };

    sqlx::query_as::<_, ChatSessionRecord>(sql)
        .bind(resource_id)
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
        "UPDATE chat_sessions SET title = COALESCE(?, title), summary = COALESCE(?, summary), chat_model = COALESCE(?, chat_model) \
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
        "INSERT INTO chat_messages (session_id, user_content, assistant_content, ref_resource_id, ref_chunk_id, input_tokens, output_tokens, reasoning_tokens, total_tokens) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.session_id)
    .bind(params.user_content)
    .bind(params.assistant_content)
    .bind(params.ref_resource_id)
    .bind(params.ref_chunk_id)
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
    sqlx::query_as::<_, ChatMessageRecord>(
        "SELECT message_id, session_id, user_content, assistant_content, ref_resource_id, ref_chunk_id, input_tokens, output_tokens, reasoning_tokens, total_tokens, created_at \
         FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, message_id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
}

pub async fn update_chat_message_contents(
    pool: &DbPool,
    message_id: i64,
    user_content: Option<&str>,
    assistant_content: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE chat_messages \
         SET user_content = COALESCE(?, user_content), assistant_content = COALESCE(?, assistant_content) \
         WHERE message_id = ?",
    )
        .bind(user_content)
        .bind(assistant_content)
        .bind(message_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_chat_message_assistant(
    pool: &DbPool,
    message_id: i64,
    assistant_content: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_tokens: Option<i64>,
    total_tokens: Option<i64>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE chat_messages \
         SET assistant_content = COALESCE(?, assistant_content), \
             input_tokens = ?, \
             output_tokens = ?, \
             reasoning_tokens = ?, \
             total_tokens = ? \
         WHERE message_id = ?",
    )
    .bind(assistant_content)
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
    params: &[NewMessageAttachment],
) -> Result<(), sqlx::Error> {
    for attachment in params {
        sqlx::query(
            "INSERT INTO message_attachments (message_id, resource_id) VALUES (?, ?)",
        )
        .bind(attachment.message_id)
        .bind(attachment.resource_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn list_message_attachments(
    pool: &DbPool,
    message_id: i64,
) -> Result<Vec<MessageAttachmentRecord>, sqlx::Error> {
    sqlx::query_as::<_, MessageAttachmentRecord>(
        "SELECT id, message_id, resource_id FROM message_attachments WHERE message_id = ?",
    )
    .bind(message_id)
    .fetch_all(pool)
    .await
}

pub async fn list_message_attachments_with_resource(
    pool: &DbPool,
    session_id: i64,
) -> Result<Vec<MessageAttachmentWithResource>, sqlx::Error> {
    // 给定一个 session_id，列出这个会话里所有消息所关联的附件，并把附件对应的资源信息一起查出来
    sqlx::query_as::<_, MessageAttachmentWithResource>(
        "SELECT ma.message_id, ma.resource_id, r.file_type, r.file_path \
         FROM message_attachments ma \
         INNER JOIN chat_messages m ON m.message_id = ma.message_id \
         INNER JOIN resources r ON r.resource_id = ma.resource_id \
         WHERE m.session_id = ? \
         ORDER BY ma.message_id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
}

pub async fn delete_message_attachment(
    pool: &DbPool,
    message_id: i64,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM message_attachments WHERE message_id = ? AND resource_id = ?",
    )
    .bind(message_id)
    .bind(resource_id)
    .execute(pool)
    .await?;

    Ok(())
}
