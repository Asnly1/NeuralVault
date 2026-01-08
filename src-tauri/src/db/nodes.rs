use super::{
    DbPool, EmbeddingType, NewNode, NodeRecord, NodeType, ResourceProcessingStage,
    ResourceSyncStatus, ReviewStatus, TaskPriority, TaskStatus,
};

const NODE_FIELDS: &str = "node_id, uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
    file_hash, file_path, file_content, user_note, resource_subtype, source_meta, indexed_hash, processing_hash, sync_status, \
    last_indexed_at, last_error, processing_stage, review_status, is_pinned, pinned_at, created_at, updated_at, is_deleted, deleted_at";

pub async fn insert_node(pool: &DbPool, params: NewNode<'_>) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO nodes (\
            uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
            file_hash, file_path, file_content, user_note, resource_subtype, source_meta, indexed_hash, processing_hash, \
            sync_status, last_indexed_at, last_error, processing_stage, review_status\
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
    .bind(params.indexed_hash)
    .bind(params.processing_hash)
    .bind(params.sync_status)
    .bind(params.last_indexed_at)
    .bind(params.last_error)
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
        "SELECT {} FROM nodes WHERE node_type = 'task' AND task_status != 'done' AND is_deleted = 0 ORDER BY updated_at DESC",
        NODE_FIELDS
    );
    sqlx::query_as::<_, NodeRecord>(&sql).fetch_all(pool).await
}

pub async fn list_all_tasks(pool: &DbPool) -> Result<Vec<NodeRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {} FROM nodes WHERE node_type = 'task' ORDER BY updated_at DESC",
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

pub async fn update_task_status(
    pool: &DbPool,
    node_id: i64,
    status: TaskStatus,
    done_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET task_status = ?, done_date = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'task'",
    )
    .bind(status)
    .bind(done_date)
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

pub async fn update_resource_processing_stage(
    pool: &DbPool,
    node_id: i64,
    stage: ResourceProcessingStage,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET processing_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(stage)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_resource_sync_status(
    pool: &DbPool,
    node_id: i64,
    status: ResourceSyncStatus,
    indexed_hash: Option<&str>,
    last_error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE nodes SET sync_status = ?, indexed_hash = ?, last_error = ?, \
         last_indexed_at = CASE WHEN ? = 'synced' THEN CURRENT_TIMESTAMP ELSE last_indexed_at END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'resource'",
    )
    .bind(status)
    .bind(indexed_hash)
    .bind(last_error)
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
    chunks: &[super::ChunkData],
    embedding_model: Option<&str>,
) -> Result<(), sqlx::Error> {
    for chunk in chunks {
        sqlx::query(
            "INSERT INTO context_chunks \
             (node_id, embedding_type, chunk_text, chunk_index, page_number, qdrant_uuid, embedding_hash, embedding_model, embedding_at, token_count) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
        )
        .bind(node_id)
        .bind(embedding_type)
        .bind(&chunk.chunk_text)
        .bind(chunk.chunk_index)
        .bind(chunk.page_number)
        .bind(&chunk.qdrant_uuid)
        .bind(&chunk.embedding_hash)
        .bind(embedding_model)
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
