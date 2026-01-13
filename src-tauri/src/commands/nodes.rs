// 节点相关命令

use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::db::{
    self, contains_creates_cycle, NodeRecord, NodeType, ReviewStatus, TaskPriority, TaskStatus,
};
use crate::{AppResult, AppState};

#[derive(Debug, FromRow)]
struct EdgeMigrationRow {
    edge_id: i64,
    source_node_id: i64,
    target_node_id: i64,
    confidence_score: Option<f64>,
    is_manual: bool,
}

/// 获取所有收藏节点
#[tauri::command]
pub async fn list_pinned_nodes(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(db::list_pinned_nodes(&state.db).await?)
}

/// 获取所有待审核节点
#[tauri::command]
pub async fn list_unreviewed_nodes(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(db::list_unreviewed_nodes(&state.db).await?)
}

/// 更新节点审核状态
#[tauri::command]
pub async fn update_node_review_status(
    state: State<'_, AppState>,
    node_id: i64,
    review_status: String,
) -> AppResult<()> {
    let status = match review_status.as_str() {
        "reviewed" => ReviewStatus::Reviewed,
        "rejected" => ReviewStatus::Rejected,
        _ => ReviewStatus::Unreviewed,
    };
    db::update_resource_review_status(&state.db, node_id, status).await?;
    Ok(())
}

/// 更新节点收藏状态
#[tauri::command]
pub async fn update_node_pinned(
    state: State<'_, AppState>,
    node_id: i64,
    is_pinned: bool,
) -> AppResult<()> {
    db::update_node_pinned(&state.db, node_id, is_pinned).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_node_revision_logs(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<Vec<crate::db::NodeRevisionLogRecord>> {
    Ok(db::list_node_revision_logs(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn convert_resource_to_topic_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_resource_to_container(&state, node_id, NodeType::Topic).await
}

#[tauri::command]
pub async fn convert_resource_to_task_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_resource_to_container(&state, node_id, NodeType::Task).await
}

#[tauri::command]
pub async fn convert_topic_to_task_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    sqlx::query!(
        "UPDATE nodes SET node_type = 'task', task_status = 'todo', priority = 'medium', \
         due_date = NULL, done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'topic'",
        node_id,
    )
    .execute(&state.db)
    .await?;

    Ok(db::get_node_by_id(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn convert_task_to_topic_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    sqlx::query!(
        "UPDATE nodes SET node_type = 'topic', task_status = NULL, priority = NULL, \
         due_date = NULL, done_date = NULL, updated_at = CURRENT_TIMESTAMP \
         WHERE node_id = ? AND node_type = 'task'",
        node_id,
    )
    .execute(&state.db)
    .await?;

    Ok(db::get_node_by_id(&state.db, node_id).await?)
}

async fn convert_resource_to_container(
    state: &State<'_, AppState>,
    node_id: i64,
    target_type: NodeType,
) -> AppResult<NodeRecord> {
    if !matches!(target_type, NodeType::Topic | NodeType::Task) {
        return Err("invalid target type".into());
    }

    let resource = db::get_node_by_id(&state.db, node_id).await?;
    if resource.node_type != NodeType::Resource || resource.is_deleted {
        return Err("node is not a resource".into());
    }

    let mut tx = state.db.begin().await?;

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
        crate::db::ResourceEmbeddingStatus::Pending,
        None::<String>,
        None::<String>,
        crate::db::ResourceProcessingStage::Todo,
        ReviewStatus::Reviewed,
    )
    .execute(tx.as_mut())
    .await?;

    let new_node_id = insert_result.last_insert_rowid();

    if contains_creates_cycle(tx.as_mut(), new_node_id, resource.node_id).await? {
        return Err("contains edge would create a cycle".into());
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
            return Err("contains edge would create a cycle".into());
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

    Ok(db::get_node_by_id(&state.db, new_node_id).await?)
}
