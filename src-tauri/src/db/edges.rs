use sqlx::{Executor, Sqlite};

use super::{DbPool, EdgeRecord, EdgeRelationType, NewEdge, NodeRecord};

pub async fn contains_creates_cycle<'a, E>(
    executor: E,
    source_node_id: i64,
    target_node_id: i64,
) -> Result<bool, sqlx::Error>
where
    E: Executor<'a, Database = Sqlite>,
{
    let exists: Option<i64> = sqlx::query_scalar(
        "WITH RECURSIVE reachable(node_id) AS ( \
            SELECT ? \
            UNION ALL \
            SELECT e.target_node_id FROM edges e \
            INNER JOIN reachable r ON e.source_node_id = r.node_id \
            WHERE e.relation_type = 'contains' AND e.is_deleted = 0 \
        ) \
        SELECT 1 FROM reachable WHERE node_id = ? LIMIT 1",
    )
    .bind(target_node_id)
    .bind(source_node_id)
    .fetch_optional(executor)
    .await?;

    Ok(exists.is_some())
}

pub async fn insert_edge(pool: &DbPool, params: NewEdge) -> Result<i64, sqlx::Error> {
    let result = sqlx::query!(
        "INSERT INTO edges (source_node_id, target_node_id, relation_type, confidence_score, is_manual) \
         VALUES (?, ?, ?, ?, ?)",
        params.source_node_id,
        params.target_node_id,
        params.relation_type,
        params.confidence_score,
        params.is_manual,
    )
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn insert_edge_if_missing(
    pool: &DbPool,
    params: NewEdge,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR IGNORE INTO edges (source_node_id, target_node_id, relation_type, confidence_score, is_manual) \
         VALUES (?, ?, ?, ?, ?)",
        params.source_node_id,
        params.target_node_id,
        params.relation_type,
        params.confidence_score,
        params.is_manual,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_edge(
    pool: &DbPool,
    source_node_id: i64,
    target_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM edges WHERE source_node_id = ? AND target_node_id = ? AND relation_type = ?",
        source_node_id,
        target_node_id,
        relation_type,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn confirm_edge(
    pool: &DbPool,
    source_node_id: i64,
    target_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE edges SET is_manual = 1, updated_at = CURRENT_TIMESTAMP \
         WHERE source_node_id = ? AND target_node_id = ? AND relation_type = ?",
    )
    .bind(source_node_id)
    .bind(target_node_id)
    .bind(relation_type)
    .execute(pool)
    .await?;
    Ok(())
}

#[allow(dead_code)]
pub async fn list_edges_from(
    pool: &DbPool,
    source_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<Vec<EdgeRecord>, sqlx::Error> {
    sqlx::query_as::<_, EdgeRecord>(
        "SELECT edge_id, source_node_id, target_node_id, relation_type, confidence_score, is_manual, created_at, updated_at, is_deleted, deleted_at \
         FROM edges WHERE source_node_id = ? AND relation_type = ? AND is_deleted = 0",
    )
    .bind(source_node_id)
    .bind(relation_type)
    .fetch_all(pool)
    .await
}

pub async fn list_edges_to(
    pool: &DbPool,
    target_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<Vec<EdgeRecord>, sqlx::Error> {
    sqlx::query_as::<_, EdgeRecord>(
        "SELECT edge_id, source_node_id, target_node_id, relation_type, confidence_score, is_manual, created_at, updated_at, is_deleted, deleted_at \
         FROM edges WHERE target_node_id = ? AND relation_type = ? AND is_deleted = 0",
    )
    .bind(target_node_id)
    .bind(relation_type)
    .fetch_all(pool)
    .await
}

pub async fn list_all_edges(pool: &DbPool) -> Result<Vec<EdgeRecord>, sqlx::Error> {
    sqlx::query_as::<_, EdgeRecord>(
        "SELECT e.edge_id, e.source_node_id, e.target_node_id, e.relation_type, e.confidence_score, e.is_manual, \
            e.created_at, e.updated_at, e.is_deleted, e.deleted_at \
         FROM edges e \
         INNER JOIN nodes s ON s.node_id = e.source_node_id \
         INNER JOIN nodes t ON t.node_id = e.target_node_id \
         WHERE e.is_deleted = 0 AND s.is_deleted = 0 AND t.is_deleted = 0",
    )
    .fetch_all(pool)
    .await
}

pub async fn list_target_nodes(
    pool: &DbPool,
    source_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<Vec<NodeRecord>, sqlx::Error> {
    sqlx::query_as::<_, NodeRecord>(
        "SELECT n.node_id, n.uuid, n.user_id, n.title, n.summary, n.node_type, n.task_status, n.priority, n.due_date, n.done_date, \
            n.file_hash, n.file_path, n.file_content, n.user_note, n.resource_subtype, n.source_meta, n.embedded_hash, n.processing_hash, n.embedding_status, \
            n.last_embedding_at, n.last_embedding_error, n.processing_stage, n.review_status, n.is_pinned, n.pinned_at, n.created_at, n.updated_at, n.is_deleted, n.deleted_at \
         FROM edges e \
         INNER JOIN nodes n ON n.node_id = e.target_node_id \
         WHERE e.source_node_id = ? AND e.relation_type = ? AND e.is_deleted = 0 AND n.is_deleted = 0",
    )
    .bind(source_node_id)
    .bind(relation_type)
    .fetch_all(pool)
    .await
}

pub async fn list_source_nodes(
    pool: &DbPool,
    target_node_id: i64,
    relation_type: EdgeRelationType,
) -> Result<Vec<NodeRecord>, sqlx::Error> {
    sqlx::query_as::<_, NodeRecord>(
        "SELECT n.node_id, n.uuid, n.user_id, n.title, n.summary, n.node_type, n.task_status, n.priority, n.due_date, n.done_date, \
            n.file_hash, n.file_path, n.file_content, n.user_note, n.resource_subtype, n.source_meta, n.embedded_hash, n.processing_hash, n.embedding_status, \
            n.last_embedding_at, n.last_embedding_error, n.processing_stage, n.review_status, n.is_pinned, n.pinned_at, n.created_at, n.updated_at, n.is_deleted, n.deleted_at \
         FROM edges e \
         INNER JOIN nodes n ON n.node_id = e.source_node_id \
         WHERE e.target_node_id = ? AND e.relation_type = ? AND e.is_deleted = 0 AND n.is_deleted = 0",
    )
    .bind(target_node_id)
    .bind(relation_type)
    .fetch_all(pool)
    .await
}
