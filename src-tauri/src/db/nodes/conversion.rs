//! 节点类型转换操作

use sqlx::FromRow;
use uuid::Uuid;

use crate::db::{
    contains_creates_cycle, get_node_by_id, DbPool, NodeRecord, NodeType,
    ResourceEmbeddingStatus, ResourceProcessingStage, ReviewStatus, TaskPriority, TaskStatus,
};
use crate::error::{AppError, AppResult};

/// 边迁移行（内部使用）
#[derive(Debug, FromRow)]
struct EdgeMigrationRow {
    edge_id: i64,
    source_node_id: i64,
    target_node_id: i64,
    confidence_score: Option<f64>,
    is_manual: bool,
}

/// 将 Topic 转换为 Task
pub async fn convert_topic_to_task(pool: &DbPool, node_id: i64) -> AppResult<NodeRecord> {
    sqlx::query!(
        "UPDATE nodes SET node_type = 'task', task_status = 'todo', priority = 'medium', \
         due_date = NULL, done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'topic'",
        node_id,
    )
    .execute(pool)
    .await?;

    Ok(get_node_by_id(pool, node_id).await?)
}

/// 将 Task 转换为 Topic
pub async fn convert_task_to_topic(pool: &DbPool, node_id: i64) -> AppResult<NodeRecord> {
    sqlx::query!(
        "UPDATE nodes SET node_type = 'topic', task_status = NULL, priority = NULL, \
         due_date = NULL, done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
        node_id,
    )
    .execute(pool)
    .await?;

    Ok(get_node_by_id(pool, node_id).await?)
}

/// 将 Resource 转换为容器类型（Topic 或 Task）
///
/// 这个操作会：
/// 1. 创建新的容器节点（继承标题和摘要）
/// 2. 将原资源作为新容器的子节点
/// 3. 迁移原有的 contains 边到新容器
/// 4. 迁移原有的 related_to 边到新容器
pub async fn convert_resource_to_container(
    pool: &DbPool,
    node_id: i64,
    target_type: NodeType,
) -> AppResult<NodeRecord> {
    if !matches!(target_type, NodeType::Topic | NodeType::Task) {
        return Err(AppError::Validation("目标类型必须是 Topic 或 Task".to_string()));
    }

    let resource = get_node_by_id(pool, node_id).await?;
    if resource.node_type != NodeType::Resource || resource.is_deleted {
        return Err(AppError::Business("节点不是有效的资源".to_string()));
    }

    let mut tx = pool.begin().await?;

    let uuid = Uuid::new_v4().to_string();
    let (task_status, priority) = match target_type {
        NodeType::Task => (Some(TaskStatus::Todo), Some(TaskPriority::Medium)),
        _ => (None, None),
    };

    let uuid_value = uuid.as_str();
    let title = resource.title.as_str();
    let summary = resource.summary.as_deref();
    let insert_result = sqlx::query!(
        "INSERT INTO nodes (\
            uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
            file_hash, file_path, file_content, user_note, resource_subtype, source_meta, embedded_hash, processing_hash, \
            embedding_status, last_embedding_at, last_embedding_error, processing_stage, review_status\
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        uuid_value,
        1,
        title,
        summary,
        target_type,
        task_status,
        priority,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        None::<String>,
        ResourceEmbeddingStatus::Pending,
        None::<String>,
        None::<String>,
        ResourceProcessingStage::Todo,
        ReviewStatus::Reviewed,
    )
    .execute(tx.as_mut())
    .await?;

    let new_node_id = insert_result.last_insert_rowid();

    // 创建新容器到原资源的 contains 边
    if contains_creates_cycle(tx.as_mut(), new_node_id, resource.node_id).await? {
        return Err(AppError::Business("创建 contains 边会形成环".to_string()));
    }
    sqlx::query!(
        "INSERT OR IGNORE INTO edges (source_node_id, target_node_id, relation_type, confidence_score, is_manual) \
         VALUES (?, ?, 'contains', ?, ?)",
        new_node_id,
        resource.node_id,
        None::<f64>,
        true,
    )
    .execute(tx.as_mut())
    .await?;

    // 迁移指向原资源的 contains 边到新容器
    let contains_edges: Vec<EdgeMigrationRow> = sqlx::query_as(
        "SELECT edge_id, source_node_id, target_node_id, confidence_score, is_manual \
         FROM edges WHERE relation_type = 'contains' AND is_deleted = 0 AND target_node_id = ? \
         AND source_node_id != ?",
    )
    .bind(resource.node_id)
    .bind(new_node_id)
    .fetch_all(tx.as_mut())
    .await?;

    for edge in contains_edges {
        if contains_creates_cycle(tx.as_mut(), edge.source_node_id, new_node_id).await? {
            return Err(AppError::Business("迁移 contains 边会形成环".to_string()));
        }

        sqlx::query!(
            "INSERT OR IGNORE INTO edges (source_node_id, target_node_id, relation_type, confidence_score, is_manual) \
             VALUES (?, ?, 'contains', ?, ?)",
            edge.source_node_id,
            new_node_id,
            edge.confidence_score,
            edge.is_manual,
        )
        .execute(tx.as_mut())
        .await?;

        sqlx::query!("DELETE FROM edges WHERE edge_id = ?", edge.edge_id)
            .execute(tx.as_mut())
            .await?;
    }

    // 迁移 related_to 边到新容器
    let related_edges: Vec<EdgeMigrationRow> = sqlx::query_as(
        "SELECT edge_id, source_node_id, target_node_id, confidence_score, is_manual \
         FROM edges WHERE relation_type = 'related_to' AND is_deleted = 0 AND (source_node_id = ? OR target_node_id = ?)",
    )
    .bind(resource.node_id)
    .bind(resource.node_id)
    .fetch_all(tx.as_mut())
    .await?;

    for edge in related_edges {
        let other_id = if edge.source_node_id == resource.node_id {
            edge.target_node_id
        } else {
            edge.source_node_id
        };
        // 规范化 related_to 边（较小 ID 在前）
        let (source_id, target_id) = if new_node_id < other_id {
            (new_node_id, other_id)
        } else {
            (other_id, new_node_id)
        };

        sqlx::query!(
            "INSERT OR IGNORE INTO edges (source_node_id, target_node_id, relation_type, confidence_score, is_manual) \
             VALUES (?, ?, 'related_to', ?, ?)",
            source_id,
            target_id,
            edge.confidence_score,
            edge.is_manual,
        )
        .execute(tx.as_mut())
        .await?;

        sqlx::query!("DELETE FROM edges WHERE edge_id = ?", edge.edge_id)
            .execute(tx.as_mut())
            .await?;
    }

    tx.commit().await?;

    Ok(get_node_by_id(pool, new_node_id).await?)
}

