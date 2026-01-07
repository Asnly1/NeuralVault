use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        hard_delete_task, soft_delete_task, get_task_by_id, insert_task, NewTask, 
        TaskPriority, TaskStatus, mark_task_as_done, mark_task_as_todo, 
        update_task_priority, update_task_due_date, update_task_title, 
        update_task_description, update_task_summary, list_tasks_by_date, list_all_tasks,
        TaskRecord,
    },
    simple_void_command,
    AppResult,
};

use super::{CreateTaskRequest, CreateTaskResponse};

// ========== 使用宏生成的简单命令 ==========

simple_void_command!(soft_delete_task_command, soft_delete_task, task_id: i64);
simple_void_command!(hard_delete_task_command, hard_delete_task, task_id: i64);
simple_void_command!(mark_task_as_done_command, mark_task_as_done, task_id: i64);
simple_void_command!(mark_task_as_todo_command, mark_task_as_todo, task_id: i64);
simple_void_command!(update_task_priority_command, update_task_priority, task_id: i64, priority: TaskPriority);

// ========== 需要额外处理的命令（不适合用宏） ==========

/// 更新任务标题
#[tauri::command]
pub async fn update_task_title_command(
    state: State<'_, AppState>,
    task_id: i64,
    title: String,
) -> AppResult<()> {
    // 进行了引用，无法使用宏
    Ok(update_task_title(&state.db, task_id, &title).await?)
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    payload: CreateTaskRequest,
) -> AppResult<CreateTaskResponse> {
    let status = payload.status.unwrap_or(TaskStatus::Todo);
    let priority = payload.priority.unwrap_or(TaskPriority::Medium);

    let uuid = Uuid::new_v4().to_string();
    let pool = &state.db;
    let task_id = insert_task(
        pool,
        NewTask {
            uuid: &uuid,
            title: Some(&payload.title),
            description: payload.description.as_deref(),
            summary: None,
            status,
            priority,
            due_date: payload.due_date.as_deref(),
            user_id: 1,
        },
    )
    .await?;

    let task = get_task_by_id(pool, task_id).await?;
    Ok(CreateTaskResponse { task })
}

/// 更新任务的截止日期
#[tauri::command]
pub async fn update_task_due_date_command(
    state: State<'_, AppState>,
    task_id: i64,
    due_date: Option<String>,
) -> AppResult<()> {
    Ok(update_task_due_date(&state.db, task_id, due_date.as_deref()).await?)
}

/// 更新任务描述
#[tauri::command]
pub async fn update_task_description_command(
    state: State<'_, AppState>,
    task_id: i64,
    description: Option<String>,
) -> AppResult<()> {
    Ok(update_task_description(&state.db, task_id, description.as_deref()).await?)
}

/// 更新任务摘要 (AI 生成)
#[tauri::command]
pub async fn update_task_summary_command(
    state: State<'_, AppState>,
    task_id: i64,
    summary: Option<String>,
) -> AppResult<()> {
    Ok(update_task_summary(&state.db, task_id, summary.as_deref()).await?)
}

/// 获取指定 due_date 的所有任务
#[tauri::command]
pub async fn get_tasks_by_date(
    state: State<'_, AppState>,
    date: String,  // 格式: "YYYY-MM-DD"
) -> AppResult<Vec<TaskRecord>> {
    Ok(list_tasks_by_date(&state.db, &date).await?)
}

/// 获取所有任务（包括 todo 和 done 状态），用于 Calendar 视图
#[tauri::command]
pub async fn get_all_tasks(
    state: State<'_, AppState>,
) -> AppResult<Vec<TaskRecord>> {
    Ok(list_all_tasks(&state.db).await?)
}
