use sqlx::types::Json;

use super::{DbPool, NewTask, TaskRecord, TaskPriority};

// <'_>: 让编译器自动推导生命周期
pub async fn insert_task(pool: &DbPool, params: NewTask<'_>) -> Result<i64, sqlx::Error> {
    // 显式写入状态/优先级，便于调试；不要依赖 DB 默认值
    // 返回的是 Row（数据库行）或者 SqliteQueryResult（执行结果，如插入成功了几行）
    let result = sqlx::query(
        "INSERT INTO tasks (uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, user_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(params.uuid)
    .bind(params.parent_task_id)
    .bind(params.root_task_id)
    .bind(params.title)
    .bind(params.description)
    .bind(params.suggested_subtasks.map(Json))
    .bind(params.status)
    .bind(params.priority)
    .bind(params.due_date)
    .bind(params.user_id)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
    //获取并返回数据库刚刚为这条新数据自动生成的唯一数字 ID（主键）
}

pub async fn get_task_by_id(pool: &DbPool, task_id: i64) -> Result<TaskRecord, sqlx::Error> {
    // 第一个返回结果是数据库类型，第二个是查询结果要映射成的 Rust 类型
    // _ : 让编译器根据传入的 &SqlitePool 推测出连接 SQLite
    // TaskRecord: 把结果映射回 TaskRecord
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, done_date, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await
}

pub async fn list_active_tasks(pool: &DbPool) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, done_date, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks \
         WHERE status = 'todo' AND is_deleted = 0 \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

/// 查询所有任务（包括 todo 和 done 状态），用于 Calendar 视图
pub async fn list_all_tasks(pool: &DbPool) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, done_date, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks \
         WHERE is_deleted = 0 AND due_date IS NOT NULL \
         ORDER BY due_date ASC, priority DESC",
    )
    .fetch_all(pool)
    .await
}

/// 查询指定 due_date 的所有任务
pub async fn list_tasks_by_date(pool: &DbPool, date: &str) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, done_date, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks \
         WHERE DATE(due_date) = DATE(?) AND is_deleted = 0 \
         ORDER BY due_date ASC, priority DESC",
    )
    .bind(date)
    .fetch_all(pool)
    .await
}

/// 软删除任务（设置 is_deleted = 1）
pub async fn soft_delete_task(pool: &DbPool, task_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE task_id = ? AND is_deleted = 0",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 硬删除任务（物理删除数据库记录）
/// 
/// 注意：由于配置了 ON DELETE CASCADE，删除任务会级联删除：
/// - task_resource_link 表中的关联记录
/// - chat_sessions 表中的相关会话
/// - 子任务（如果有 parent_task_id 指向该任务的记录）
pub async fn hard_delete_task(pool: &DbPool, task_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM tasks WHERE task_id = ?")
        .bind(task_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 将任务状态从 'todo' 转换为 'done'，并设置 done_date 为当前时间
pub async fn mark_task_as_done(pool: &DbPool, task_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET status = 'done', done_date = CURRENT_TIMESTAMP, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND status = 'todo' AND is_deleted = 0",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 将任务状态从 'done' 转换为 'todo'，并清空 done_date
pub async fn mark_task_as_todo(pool: &DbPool, task_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET status = 'todo', done_date = NULL, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND status = 'done' AND is_deleted = 0",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 更新任务优先级
pub async fn update_task_priority(pool: &DbPool, task_id: i64, priority: TaskPriority) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET priority = ?, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND is_deleted = 0",
    )
    .bind(priority)
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 更新任务的截止日期
pub async fn update_task_due_date(pool: &DbPool, task_id: i64, due_date: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET due_date = ?, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND is_deleted = 0",
    )
    .bind(due_date)
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 更新任务标题
pub async fn update_task_title(pool: &DbPool, task_id: i64, title: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET title = ?, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND is_deleted = 0",
    )
    .bind(title)
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 更新任务描述
pub async fn update_task_description(pool: &DbPool, task_id: i64, description: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET description = ?, user_updated_at = CURRENT_TIMESTAMP \
         WHERE task_id = ? AND is_deleted = 0",
    )
    .bind(description)
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}
