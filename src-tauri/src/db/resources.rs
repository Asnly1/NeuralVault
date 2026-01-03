use sqlx::types::Json;

use super::{DbPool, LinkResourceParams, NewResource, ResourceRecord};

pub async fn insert_resource(
    pool: &DbPool,
    params: NewResource<'_>,
) -> Result<i64, sqlx::Error> {
    // 显式写入同步/处理/分类状态，便于调试；不要依赖 DB 默认值
    let result = sqlx::query(
        "INSERT INTO resources (uuid, source_meta, file_hash, file_type, content, display_name, file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, user_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.uuid)
    .bind(params.source_meta.map(Json))
    .bind(params.file_hash)
    .bind(params.file_type)
    .bind(params.content)
    .bind(params.display_name)
    .bind(params.file_path)
    .bind(params.file_size_bytes)
    .bind(params.indexed_hash)
    .bind(params.processing_hash)
    .bind(params.sync_status)
    .bind(params.last_indexed_at)
    .bind(params.last_error)
    .bind(params.processing_stage)
    .bind(params.classification_status)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_resource_by_id(
    pool: &DbPool,
    resource_id: i64,
) -> Result<ResourceRecord, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT resource_id, uuid, source_meta, file_hash, file_type, content, display_name, \
                file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, created_at, is_deleted, deleted_at, user_id \
         FROM resources WHERE resource_id = ?",
    )
    .bind(resource_id)
    .fetch_one(pool)
    .await
}

pub async fn list_unclassified_resources(
    pool: &DbPool,
) -> Result<Vec<ResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT resource_id, uuid, source_meta, file_hash, file_type, content, display_name, \
                file_path, file_size_bytes, indexed_hash, processing_hash, sync_status, last_indexed_at, last_error, processing_stage, classification_status, created_at, is_deleted, deleted_at, user_id \
         FROM resources \
         WHERE classification_status = 'unclassified' AND is_deleted = 0 \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn link_resource_to_task(
    pool: &DbPool,
    params: LinkResourceParams<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_resource_link (task_id, resource_id, visibility_scope, local_alias) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(params.task_id)
    .bind(params.resource_id)
    .bind(params.visibility_scope)
    .bind(params.local_alias)
    .execute(pool)
    .await?;

    sqlx::query("UPDATE resources SET classification_status = 'linked' WHERE resource_id = ?")
        .bind(params.resource_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// 取消资源与任务的关联，并将资源状态改回 unclassified
pub async fn unlink_resource_from_task(
    pool: &DbPool,
    task_id: i64,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM task_resource_link WHERE task_id = ? AND resource_id = ?")
        .bind(task_id)
        .bind(resource_id)
        .execute(pool)
        .await?;

    // 检查资源是否还有其他关联，如果没有则恢复为 unclassified
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_resource_link WHERE resource_id = ?")
        .bind(resource_id)
        .fetch_one(pool)
        .await?;

    if count == 0 {
        sqlx::query("UPDATE resources SET classification_status = 'unclassified' WHERE resource_id = ?")
            .bind(resource_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn list_resources_for_task(
    pool: &DbPool,
    task_id: i64,
) -> Result<Vec<ResourceRecord>, sqlx::Error> {
    sqlx::query_as::<_, ResourceRecord>(
        "SELECT r.resource_id, r.uuid, r.source_meta, r.file_hash, r.file_type, r.content, \
                r.display_name, r.file_path, r.file_size_bytes, r.indexed_hash, r.processing_hash, \
                r.sync_status, r.last_indexed_at, r.last_error, r.processing_stage, r.classification_status, r.created_at, r.is_deleted, r.deleted_at, r.user_id \
         FROM resources r \
         INNER JOIN task_resource_link l ON l.resource_id = r.resource_id \
         WHERE l.task_id = ?",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await
}

/// 软删除资源（设置 is_deleted = 1 和 deleted_at = 当前时间）
pub async fn soft_delete_resource(
    pool: &DbPool,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE resources SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP \
         WHERE resource_id = ? AND is_deleted = 0"
    )
    .bind(resource_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// 更新资源内容
/// 
/// 用于保存文本编辑器中的更改
pub async fn update_resource_content(
    pool: &DbPool,
    resource_id: i64,
    content: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE resources \
         SET content = ?, sync_status = 'dirty', processing_stage = 'todo', last_error = NULL \
         WHERE resource_id = ?"
    )
        .bind(content)
        .bind(resource_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// 更新资源显示名称
/// 
/// 用于重命名资源
pub async fn update_resource_display_name(
    pool: &DbPool,
    resource_id: i64,
    display_name: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE resources SET display_name = ? WHERE resource_id = ?")
        .bind(display_name)
        .bind(resource_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// 硬删除资源（物理删除数据库记录）
///
/// 注意：由于配置了 ON DELETE CASCADE，删除资源会级联删除：
/// - task_resource_link 表中的关联记录
/// - context_chunks 表中的所有分块记录
///
/// 注意：此函数不会删除物理文件（assets 目录中的文件）
/// 如需删除文件，请在调用此函数前先获取 file_path 并手动删除
/// TODO：删除物理文件
pub async fn hard_delete_resource(
    pool: &DbPool,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM resources WHERE resource_id = ?")
        .bind(resource_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// 批量插入 context_chunks
///
/// 由 Rust 端统一写入，接收 Python 处理后的结果
pub async fn insert_context_chunks(
    pool: &DbPool,
    resource_id: i64,
    chunks: &[super::ChunkData],
    embedding_model: Option<&str>,
) -> Result<(), sqlx::Error> {
    for chunk in chunks {
        sqlx::query(
            "INSERT INTO context_chunks \
             (resource_id, chunk_text, chunk_index, page_number, \
              qdrant_uuid, embedding_hash, embedding_model, embedding_at, token_count) \
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)"
        )
        .bind(resource_id)
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

/// 更新资源Embedding状态
///
/// 由 Rust 端统一更新，接收 Python 处理后的状态
pub async fn update_resource_embedding_status(
    pool: &DbPool,
    resource_id: i64,
    sync_status: &str,
    processing_stage: &str,
    indexed_hash: Option<&str>,
    last_error: Option<&str>,
) -> Result<(), sqlx::Error> {
    // 如果是 synced 状态，同时更新 last_indexed_at
    if sync_status == "synced" {
        sqlx::query(
            "UPDATE resources SET \
             sync_status = ?, processing_stage = ?, indexed_hash = ?, \
             last_indexed_at = CURRENT_TIMESTAMP, last_error = ? \
             WHERE resource_id = ?"
        )
        .bind(sync_status)
        .bind(processing_stage)
        .bind(indexed_hash)
        .bind(last_error)
        .bind(resource_id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE resources SET \
             sync_status = ?, processing_stage = ?, indexed_hash = ?, last_error = ? \
             WHERE resource_id = ?"
        )
        .bind(sync_status)
        .bind(processing_stage)
        .bind(indexed_hash)
        .bind(last_error)
        .bind(resource_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// 删除资源的所有 chunks
///
/// 用于资源更新前清理旧数据
pub async fn delete_context_chunks(
    pool: &DbPool,
    resource_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM context_chunks WHERE resource_id = ?")
        .bind(resource_id)
        .execute(pool)
        .await?;

    Ok(())
}
