//! Basic CRUD operations for nodes

use super::NODE_FIELDS;
use crate::db::{DbPool, NewNode, NodeRecord, NodeType};

pub async fn insert_node(pool: &DbPool, params: NewNode<'_>) -> Result<i64, sqlx::Error> {
    let result = sqlx::query!(
        "INSERT INTO nodes (\
            uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
            file_hash, file_path, file_content, user_note, resource_subtype, source_meta, embedded_hash, processing_hash, \
            embedding_status, last_embedding_at, last_embedding_error, processing_stage, review_status\
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params.uuid,
        params.user_id,
        params.title,
        params.summary,
        params.node_type,
        params.task_status,
        params.priority,
        params.due_date,
        params.done_date,
        params.file_hash,
        params.file_path,
        params.file_content,
        params.user_note,
        params.resource_subtype,
        params.source_meta,
        params.embedded_hash,
        params.processing_hash,
        params.embedding_status,
        params.last_embedding_at,
        params.last_embedding_error,
        params.processing_stage,
        params.review_status,
    )
    .execute(pool)
    .await?;

    let node_id = result.last_insert_rowid();
    tracing::debug!(
        node_id,
        node_type = ?params.node_type,
        title = %params.title,
        task_status = ?params.task_status,
        priority = ?params.priority,
        resource_subtype = ?params.resource_subtype,
        file_path = ?params.file_path,
        file_hash = ?params.file_hash,
        embedding_status = ?params.embedding_status,
        processing_stage = ?params.processing_stage,
        review_status = ?params.review_status,
        "Node created"
    );
    Ok(node_id)
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
    sqlx::query!(
        "UPDATE nodes SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE node_id = ? AND is_deleted = 0",
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, "Node soft deleted");
    Ok(())
}

pub async fn hard_delete_node(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM nodes WHERE node_id = ?", node_id)
        .execute(pool)
        .await?;
    tracing::debug!(node_id, "Node hard deleted");
    Ok(())
}

pub async fn update_node_title(pool: &DbPool, node_id: i64, title: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
        title,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, title = %title, "Node title updated");
    Ok(())
}

pub async fn update_node_summary(
    pool: &DbPool,
    node_id: i64,
    summary: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
        summary,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, summary = ?summary, "Node summary updated");
    Ok(())
}

pub async fn update_node_pinned(
    pool: &DbPool,
    node_id: i64,
    is_pinned: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET is_pinned = ?, pinned_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, \
         updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
        is_pinned,
        is_pinned,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, is_pinned, "Node pinned status updated");
    Ok(())
}

pub async fn update_node_content(
    pool: &DbPool,
    node_id: i64,
    content: Option<&str>,
    file_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET file_content = ?, file_hash = COALESCE(?, file_hash), updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
        content,
        file_hash,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(
        node_id,
        content = ?content,
        file_hash = ?file_hash,
        "Node content updated"
    );
    Ok(())
}

pub async fn update_node_user_note(
    pool: &DbPool,
    node_id: i64,
    note: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET user_note = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ?",
        note,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, note = ?note, "Node user note updated");
    Ok(())
}
