//! Query operations for nodes

use super::NODE_FIELDS;
use crate::db::{DbPool, NodeRecord, NodeType};

pub async fn list_nodes_by_type(
    pool: &DbPool,
    node_type: NodeType,
    include_deleted: bool,
) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = if include_deleted {
        format!(
            "SELECT {} FROM nodes WHERE node_type = ? ORDER BY updated_at DESC",
            NODE_FIELDS
        )
    } else {
        format!(
            "SELECT {} FROM nodes WHERE node_type = ? AND is_deleted = 0 ORDER BY updated_at DESC",
            NODE_FIELDS
        )
    };

    sqlx::query_as::<_, NodeRecord>(&sql)
        .bind(node_type)
        .fetch_all(pool)
        .await
}

pub async fn list_active_tasks(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = 'task' AND task_status = 'todo' AND is_deleted = 0 ORDER BY updated_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

pub async fn list_all_tasks(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = 'task' AND is_deleted = 0 ORDER BY updated_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

pub async fn list_tasks_by_date(pool: &DbPool, date: &str) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = 'task' AND date(due_date) = date(?) AND is_deleted = 0 ORDER BY due_date ASC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql)
        .bind(date)
        .fetch_all(pool)
        .await
}

pub async fn list_all_resources(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = 'resource' AND is_deleted = 0 ORDER BY updated_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

pub async fn list_resources_for_requeue(pool: &DbPool) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT node_id FROM nodes \
         WHERE node_type = 'resource' AND is_deleted = 0 \
         AND file_content IS NOT NULL AND length(trim(file_content)) > 0 \
         AND (embedding_status IN ('pending', 'dirty', 'error') OR processing_stage != 'done') \
         ORDER BY updated_at DESC",
    )
    .fetch_all(pool)
    .await
}

/// Get all pinned nodes
pub async fn list_pinned_nodes(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE is_pinned = 1 AND is_deleted = 0 ORDER BY pinned_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

/// Get all unreviewed nodes
pub async fn list_unreviewed_nodes(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE review_status = 'unreviewed' AND is_deleted = 0 ORDER BY created_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

/// SQL LIKE search (title + file_content + user_note)
pub async fn search_nodes_by_keyword(
    pool: &DbPool,
    keyword: &str,
    node_type: Option<NodeType>,
    limit: i32,
) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let pattern = format!("%{}%", keyword);

    match node_type {
        Some(nt) => {
            let sql = format!(
                "SELECT {} FROM nodes \
                 WHERE node_type = ? AND is_deleted = 0 \
                 AND (title LIKE ? OR file_content LIKE ? OR user_note LIKE ?) \
                 ORDER BY updated_at DESC \
                 LIMIT ?",
                NODE_FIELDS
            );
            sqlx::query_as::<_, NodeRecord>(&sql)
                .bind(nt)
                .bind(&pattern)
                .bind(&pattern)
                .bind(&pattern)
                .bind(limit)
                .fetch_all(pool)
                .await
        }
        None => {
            let sql = format!(
                "SELECT {} FROM nodes \
                 WHERE is_deleted = 0 \
                 AND (title LIKE ? OR file_content LIKE ? OR user_note LIKE ?) \
                 ORDER BY updated_at DESC \
                 LIMIT ?",
                NODE_FIELDS
            );
            sqlx::query_as::<_, NodeRecord>(&sql)
                .bind(&pattern)
                .bind(&pattern)
                .bind(&pattern)
                .bind(limit)
                .fetch_all(pool)
                .await
        }
    }
}
