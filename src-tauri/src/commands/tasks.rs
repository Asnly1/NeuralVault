use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        get_node_by_id, insert_node, list_all_tasks, list_active_tasks, list_tasks_by_date,
        mark_task_cancelled, mark_task_done, mark_task_todo, update_node_summary, update_node_title,
        update_node_user_note, update_task_due_date, update_task_priority,
        soft_delete_node, hard_delete_node, NewNode, NodeType, ResourceProcessingStage,
        ResourceEmbeddingStatus, ReviewStatus, TaskPriority, TaskStatus,
    },
    simple_void_command,
    AppResult,
};

use super::{CreateTaskRequest, CreateTaskResponse};

simple_void_command!(update_task_priority_command, update_task_priority, node_id: i64, priority: TaskPriority);
simple_void_command!(soft_delete_task_command, soft_delete_node, node_id: i64);
simple_void_command!(hard_delete_task_command, hard_delete_node, node_id: i64);
simple_void_command!(mark_task_as_cancelled_command, mark_task_cancelled, node_id: i64);

#[tauri::command]
pub async fn update_task_title_command(
    state: State<'_, AppState>,
    node_id: i64,
    title: String,
) -> AppResult<()> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("title 不能为空".into());
    }
    Ok(update_node_title(&state.db, node_id, trimmed).await?)
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    payload: CreateTaskRequest,
) -> AppResult<CreateTaskResponse> {
    let status = payload.status.unwrap_or(TaskStatus::Todo);
    let priority = payload.priority.unwrap_or(TaskPriority::Medium);
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("title 不能为空".into());
    }

    let uuid = Uuid::new_v4().to_string();
    let pool = &state.db;
    let node_id = insert_node(
        pool,
        NewNode {
            uuid: &uuid,
            user_id: 1,
            title,
            summary: None,
            node_type: NodeType::Task,
            task_status: Some(status),
            priority: Some(priority),
            due_date: payload.due_date.as_deref(),
            done_date: None,
            file_hash: None,
            file_path: None,
            file_content: None,
            user_note: payload.user_note.as_deref(),
            resource_subtype: None,
            source_meta: None,
            embedded_hash: None,
            processing_hash: None,
            embedding_status: ResourceEmbeddingStatus::Pending,
            last_embedding_at: None,
            last_embedding_error: None,
            processing_stage: ResourceProcessingStage::Todo,
            review_status: ReviewStatus::Reviewed,
        },
    )
    .await?;

    let node = get_node_by_id(pool, node_id).await?;
    Ok(CreateTaskResponse { node })
}

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

#[tauri::command]
pub async fn get_tasks_by_date(
    state: State<'_, AppState>,
    date: String,
) -> AppResult<Vec<crate::db::NodeRecord>> {
    Ok(list_tasks_by_date(&state.db, &date).await?)
}

#[tauri::command]
pub async fn get_all_tasks(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::db::NodeRecord>> {
    Ok(list_all_tasks(&state.db).await?)
}

#[tauri::command]
pub async fn get_active_tasks(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::db::NodeRecord>> {
    Ok(list_active_tasks(&state.db).await?)
}
