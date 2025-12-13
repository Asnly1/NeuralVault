use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        hard_delete_task, soft_delete_task, get_task_by_id, insert_task, NewTask, 
        TaskPriority, TaskStatus, mark_task_as_done, mark_task_as_todo, 
        update_task_priority, update_task_due_date, update_task_title, 
        update_task_description,
    },
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
pub async fn soft_delete_task_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    soft_delete_task(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 硬删除任务（物理删除数据库记录和级联数据）
#[tauri::command]
pub async fn hard_delete_task_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    hard_delete_task(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将任务状态从 'todo' 转换为 'done'
#[tauri::command]
pub async fn mark_task_as_done_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    mark_task_as_done(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将任务状态从 'done' 转换为 'todo'
#[tauri::command]
pub async fn mark_task_as_todo_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    mark_task_as_todo(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新任务优先级
#[tauri::command]
pub async fn update_task_priority_command(
    state: State<'_, AppState>,
    task_id: i64,
    priority: TaskPriority,
) -> Result<(), String> {
    let pool = &state.db;
    update_task_priority(pool, task_id, priority)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新任务的截止日期
#[tauri::command]
pub async fn update_task_due_date_command(
    state: State<'_, AppState>,
    task_id: i64,
    due_date: Option<String>,
) -> Result<(), String> {
    let pool = &state.db;
    update_task_due_date(pool, task_id, due_date.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新任务标题
#[tauri::command]
pub async fn update_task_title_command(
    state: State<'_, AppState>,
    task_id: i64,
    title: String,
) -> Result<(), String> {
    let pool = &state.db;
    update_task_title(pool, task_id, &title)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新任务描述
#[tauri::command]
pub async fn update_task_description_command(
    state: State<'_, AppState>,
    task_id: i64,
    description: Option<String>,
) -> Result<(), String> {
    let pool = &state.db;
    update_task_description(pool, task_id, description.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
