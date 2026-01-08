// 节点相关命令

use tauri::State;

use crate::db::{self, NodeRecord, ReviewStatus};
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
