//! Status update operations for nodes

use sqlx::types::Json;

use crate::db::{
    DbPool, EmbedChunkResult, EmbeddingType, ResourceEmbeddingStatus, ResourceProcessingStage,
    ReviewStatus, TaskPriority,
};

pub async fn mark_task_todo(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET task_status = 'todo', done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, "Task marked todo");
    Ok(())
}

pub async fn mark_task_done(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET task_status = 'done', done_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, "Task marked done");
    Ok(())
}

pub async fn mark_task_cancelled(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET task_status = 'cancelled', done_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, "Task marked cancelled");
    Ok(())
}

pub async fn update_task_priority(
    pool: &DbPool,
    node_id: i64,
    priority: TaskPriority,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'task'",
        priority,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, priority = ?priority, "Task priority updated");
    Ok(())
}

pub async fn update_task_due_date(
    pool: &DbPool,
    node_id: i64,
    due_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'task'",
        due_date,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, due_date = ?due_date, "Task due date updated");
    Ok(())
}

pub async fn update_resource_processing_stage(
    pool: &DbPool,
    node_id: i64,
    stage: ResourceProcessingStage,
    processing_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET processing_stage = ?, processing_hash = COALESCE(?, processing_hash), updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
        stage,
        processing_hash,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(
        node_id,
        stage = ?stage,
        processing_hash = ?processing_hash,
        "Resource processing stage updated"
    );
    Ok(())
}

pub async fn update_resource_sync_status(
    pool: &DbPool,
    node_id: i64,
    status: ResourceEmbeddingStatus,
    embedded_hash: Option<&str>,
    last_embedding_error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET embedding_status = ?, embedded_hash = ?, last_embedding_error = ?, \
         last_embedding_at = CASE WHEN ? = 'synced' THEN CURRENT_TIMESTAMP ELSE last_embedding_at END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'resource'",
        status,
        embedded_hash,
        last_embedding_error,
        status,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(
        node_id,
        status = ?status,
        embedded_hash = ?embedded_hash,
        last_embedding_error = ?last_embedding_error,
        "Resource embedding status updated"
    );
    Ok(())
}

pub async fn update_resource_review_status(
    pool: &DbPool,
    node_id: i64,
    status: ReviewStatus,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE nodes SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
        status,
        node_id,
    )
    .execute(pool)
    .await?;
    tracing::debug!(node_id, status = ?status, "Resource review status updated");
    Ok(())
}

pub async fn insert_context_chunks(
    pool: &DbPool,
    node_id: i64,
    embedding_type: EmbeddingType,
    chunks: &[EmbedChunkResult],
) -> Result<(), sqlx::Error> {
    for chunk in chunks {
        let vector_kind = chunk.vector_kind.as_str();
        let chunk_text = chunk.chunk_text.as_str();
        let vector_id = chunk.vector_id.as_str();
        let embedding_hash = chunk.embedding_hash.as_str();
        let embedding_model = chunk.embedding_model.as_str();
        let chunk_meta = chunk.chunk_meta.as_ref().map(|meta| Json(meta.clone()));
        sqlx::query!(
            "INSERT INTO context_chunks \
             (node_id, embedding_type, vector_kind, chunk_text, chunk_index, vector_id, embedding_hash, embedding_model, embedding_at, token_count, chunk_meta) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)",
            node_id,
            embedding_type,
            vector_kind,
            chunk_text,
            chunk.chunk_index,
            vector_id,
            embedding_hash,
            embedding_model,
            chunk.token_count,
            chunk_meta,
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[allow(dead_code)]
pub async fn delete_context_chunks(pool: &DbPool, node_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM context_chunks WHERE node_id = ?", node_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_context_chunks_by_type(
    pool: &DbPool,
    node_id: i64,
    embedding_type: EmbeddingType,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM context_chunks WHERE node_id = ? AND embedding_type = ?",
        node_id,
        embedding_type,
    )
        .execute(pool)
        .await?;
    Ok(())
}
