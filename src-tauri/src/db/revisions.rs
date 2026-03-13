use super::{DbPool, NewNodeRevisionLog, NodeRevisionLogRecord};

pub async fn insert_node_revision_log(
    pool: &DbPool,
    params: NewNodeRevisionLog<'_>,
) -> Result<i64, sqlx::Error> {
    let result = sqlx::query!(
        "INSERT INTO node_revision_logs \
         (node_id, field_name, old_value, new_value, reason, provider, model, confidence_score) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params.node_id,
        params.field_name,
        params.old_value,
        params.new_value,
        params.reason,
        params.provider,
        params.model,
        params.confidence_score,
    )
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn list_node_revision_logs(
    pool: &DbPool,
    node_id: i64,
) -> Result<Vec<NodeRevisionLogRecord>, sqlx::Error> {
    sqlx::query_as::<_, NodeRevisionLogRecord>(
        "SELECT revision_id, node_id, field_name, old_value, new_value, reason, provider, model, confidence_score, created_at \
         FROM node_revision_logs WHERE node_id = ? ORDER BY created_at DESC",
    )
    .bind(node_id)
    .fetch_all(pool)
    .await
}
