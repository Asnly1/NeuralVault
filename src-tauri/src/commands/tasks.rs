//! 任务相关命令

use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        get_node_by_id, hard_delete_node, list_active_tasks, list_all_tasks, list_tasks_by_date,
        mark_task_cancelled, mark_task_done, mark_task_todo, soft_delete_node,
        update_node_summary, update_node_title, update_node_user_note, update_task_due_date,
        update_task_priority, NodeBuilder, NodeRecord, TaskPriority,
    },
    simple_void_command,
    utils::validate_title,
    AppResult,
};

use super::{CreateTaskRequest, CreateTaskResponse};

// ========== 简单命令 ==========

simple_void_command!(update_task_priority_command, update_task_priority, node_id: i64, priority: TaskPriority);
simple_void_command!(soft_delete_task_command, soft_delete_node, node_id: i64);
simple_void_command!(hard_delete_task_command, hard_delete_node, node_id: i64);
simple_void_command!(mark_task_as_cancelled_command, mark_task_cancelled, node_id: i64);

// ========== 创建任务 ==========

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    payload: CreateTaskRequest,
) -> AppResult<CreateTaskResponse> {
    let title = validate_title(&payload.title)?;

    let node_id = NodeBuilder::task()
        .title(title)
        .task_status(payload.status)
        .priority(payload.priority)
        .due_date(payload.due_date.as_deref())
        .user_note(payload.user_note.as_deref())
        .insert(&state.db)
        .await?;

    let node = get_node_by_id(&state.db, node_id).await?;
    Ok(CreateTaskResponse { node })
}

// ========== 更新任务 ==========

#[tauri::command]
pub async fn update_task_title_command(
    state: State<'_, AppState>,
    node_id: i64,
    title: String,
) -> AppResult<()> {
    let title = validate_title(&title)?;
    Ok(update_node_title(&state.db, node_id, title).await?)
}

#[tauri::command]
pub async fn update_task_due_date_command(
    state: State<'_, AppState>,
    node_id: i64,
    due_date: Option<String>,
) -> AppResult<()> {
    Ok(update_task_due_date(&state.db, node_id, due_date.as_deref()).await?)
}

#[tauri::command]
pub async fn update_task_description_command(
    state: State<'_, AppState>,
    node_id: i64,
    description: Option<String>,
) -> AppResult<()> {
    Ok(update_node_user_note(&state.db, node_id, description.as_deref()).await?)
}

#[tauri::command]
pub async fn update_task_summary_command(
    state: State<'_, AppState>,
    node_id: i64,
    summary: Option<String>,
) -> AppResult<()> {
    Ok(update_node_summary(&state.db, node_id, summary.as_deref()).await?)
}

// ========== 状态更新 ==========

#[tauri::command]
pub async fn mark_task_as_done_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(mark_task_done(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn mark_task_as_todo_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(mark_task_todo(&state.db, node_id).await?)
}

// ========== 查询任务 ==========

#[tauri::command]
pub async fn get_tasks_by_date(
    state: State<'_, AppState>,
    date: String,
) -> AppResult<Vec<NodeRecord>> {
    Ok(list_tasks_by_date(&state.db, &date).await?)
}

#[tauri::command]
pub async fn get_all_tasks(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(list_all_tasks(&state.db).await?)
}

#[tauri::command]
pub async fn get_active_tasks(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(list_active_tasks(&state.db).await?)
}
