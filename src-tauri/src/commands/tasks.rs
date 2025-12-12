use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{delete_task, get_task_by_id, insert_task, NewTask, TaskPriority, TaskStatus},
};

use super::{CreateTaskRequest, CreateTaskResponse};

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    payload: CreateTaskRequest,
) -> Result<CreateTaskResponse, String> {
    let status = payload.status.unwrap_or(TaskStatus::Todo);
    let priority = payload.priority.unwrap_or(TaskPriority::Medium);

    let uuid = Uuid::new_v4().to_string();
    let pool = &state.db;
    let task_id = insert_task(
        pool,
        NewTask {
            uuid: &uuid,
            parent_task_id: None,
            root_task_id: None,
            title: Some(&payload.title),
            description: payload.description.as_deref(),
            suggested_subtasks: None,
            status,
            priority,
            due_date: payload.due_date.as_deref(),
            user_id: 1,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let task = get_task_by_id(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(CreateTaskResponse { task })
}

#[tauri::command]
pub async fn delete_task_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    delete_task(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
