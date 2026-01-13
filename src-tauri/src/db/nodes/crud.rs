//! Basic CRUD operations for nodes

use super::NODE_FIELDS;
use crate::db::{DbPool, NewNode, NodeRecord, NodeType};

pub async fn insert_node(pool: &DbPool, params: NewNode<'_>) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO nodes (\
            uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
            file_hash, file_path, file_content, user_note, resource_subtype, source_meta, embedded_hash, processing_hash, \
            embedding_status, last_embedding_at, last_embedding_error, processing_stage, review_status\
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.uuid)
    .bind(params.user_id)
    .bind(params.title)
    .bind(params.summary)
    .bind(params.node_type)
    .bind(params.task_status)
    .bind(params.priority)
    .bind(params.due_date)
    .bind(params.done_date)
    .bind(params.file_hash)
    .bind(params.file_path)
    .bind(params.file_content)
    .bind(params.user_note)
    .bind(params.resource_subtype)
    .bind(params.source_meta)
    .bind(params.embedded_hash)
    .bind(params.processing_hash)
    .bind(params.embedding_status)
    .bind(params.last_embedding_at)
    .bind(params.last_embedding_error)
    .bind(params.processing_stage)
    .bind(params.review_status)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_node_by_id(pool: &DbPool, node_id: i64) -> Result<NodeRecord, sqlx::Error> {
    let sql = format!("SELECT {} FROM nodes WHERE node_id = ?", NODE_FIELDS);
    sqlx::query_as::<_, NodeRecord>(&sql)
        .bind(node_id)
        .fetch_one(pool)
        .await
}

pub async fn get_node_by_title(
    pool: &DbPool,
    node_type: NodeType,
    title: &str,
) -> Result<Option<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = ? AND title = ? AND is_deleted = 0",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql)
        .bind(node_type)
        .bind(title)
        .fetch_optional(pool)
        .await
}

pub async fn soft_delete_node(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE node_id = ? AND is_deleted = 0",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn hard_delete_node(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM nodes WHERE node_id = ?")
        .bind(node_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_node_title(pool: &DbPool, node_id: i64, title: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
    )
    .bind(title)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_node_summary(
    pool: &DbPool,
    node_id: i64,
    summary: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
    )
    .bind(summary)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_node_pinned(
    pool: &DbPool,
    node_id: i64,
    is_pinned: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET is_pinned = ?, pinned_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, \
         updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
    )
    .bind(is_pinned)
    .bind(is_pinned)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_node_content(
    pool: &DbPool,
    node_id: i64,
    content: Option<&str>,
    file_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET file_content = ?, file_hash = COALESCE(?, file_hash), updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(content)
    .bind(file_hash)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_node_user_note(
    pool: &DbPool,
    node_id: i64,
    note: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET user_note = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
    )
    .bind(note)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}
