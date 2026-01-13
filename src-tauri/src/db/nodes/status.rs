//! Status update operations for nodes

use crate::db::{
    DbPool, EmbedChunkResult, EmbeddingType, ResourceEmbeddingStatus, ResourceProcessingStage,
    ReviewStatus, TaskPriority,
};

pub async fn mark_task_todo(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET task_status = 'todo', done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_task_done(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET task_status = 'done', done_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_task_cancelled(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET task_status = 'cancelled', done_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_task_priority(
    pool: &DbPool,
    node_id: i64,
    priority: TaskPriority,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(priority)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_task_due_date(
    pool: &DbPool,
    node_id: i64,
    due_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(due_date)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_resource_processing_stage(
    pool: &DbPool,
    node_id: i64,
    stage: ResourceProcessingStage,
    processing_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET processing_stage = ?, processing_hash = COALESCE(?, processing_hash), updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(stage)
    .bind(processing_hash)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_resource_sync_status(
    pool: &DbPool,
    node_id: i64,
    status: ResourceEmbeddingStatus,
    embedded_hash: Option<&str>,
    last_embedding_error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET embedding_status = ?, embedded_hash = ?, last_embedding_error = ?, \
         last_embedding_at = CASE WHEN ? = 'synced' THEN CURRENT_TIMESTAMP ELSE last_embedding_at END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(status)
    .bind(embedded_hash)
    .bind(last_embedding_error)
    .bind(status)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_resource_review_status(
    pool: &DbPool,
    node_id: i64,
    status: ReviewStatus,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(status)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_context_chunks(
    pool: &DbPool,
    node_id: i64,
    embedding_type: EmbeddingType,
    chunks: &[EmbedChunkResult],
) -> Result<(), sqlx::Error> {
    for chunk in chunks {
        sqlx::query(
            "INSERT INTO context_chunks \
             (node_id, embedding_type, vector_kind, chunk_text, chunk_index, vector_id, embedding_hash, embedding_model, embedding_at, token_count) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
        )
        .bind(node_id)
        .bind(embedding_type)
        .bind(&chunk.vector_kind)
        .bind(&chunk.chunk_text)
        .bind(chunk.chunk_index)
        .bind(&chunk.vector_id)
        .bind(&chunk.embedding_hash)
        .bind(&chunk.embedding_model)
        .bind(chunk.token_count)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn delete_context_chunks(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM context_chunks WHERE node_id = ?")
        .bind(node_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_context_chunks_by_type(
    pool: &DbPool,
    node_id: i64,
    embedding_type: EmbeddingType,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM context_chunks WHERE node_id = ? AND embedding_type = ?")
        .bind(node_id)
        .bind(embedding_type)
        .execute(pool)
        .await?;
    Ok(())
}
