//! 节点相关命令

use tauri::State;

use crate::db::{
    self, convert_resource_to_container, convert_task_to_topic, convert_topic_to_task,
    NodeRecord, NodeType, ReviewStatus,
};
use crate::utils::parse_review_status;
use crate::{AppResult, AppState};

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
    let status = parse_review_status(&review_status).unwrap_or(ReviewStatus::Unreviewed);
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

/// 列出节点修订日志
#[tauri::command]
pub async fn list_node_revision_logs(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<Vec<db::NodeRevisionLogRecord>> {
    Ok(db::list_node_revision_logs(&state.db, node_id).await?)
}

/// 将资源转换为主题
#[tauri::command]
pub async fn convert_resource_to_topic_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_resource_to_container(&state.db, node_id, NodeType::Topic).await
}

/// 将资源转换为任务
#[tauri::command]
pub async fn convert_resource_to_task_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_resource_to_container(&state.db, node_id, NodeType::Task).await
}

/// 将主题转换为任务
#[tauri::command]
pub async fn convert_topic_to_task_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_topic_to_task(&state.db, node_id).await
}

/// 将任务转换为主题
#[tauri::command]
pub async fn convert_task_to_topic_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    convert_task_to_topic(&state.db, node_id).await
}
