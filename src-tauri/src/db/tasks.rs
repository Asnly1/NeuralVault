use sqlx::types::Json;

use super::{DbPool, NewTask, TaskRecord};

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
    // _ : 让编译器根据传入的 &SqlitePool 推测出连接 SQLite
    // TaskRecord: 把结果映射回 TaskRecord
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await
}

pub async fn list_active_tasks(pool: &DbPool) -> Result<Vec<TaskRecord>, sqlx::Error> {
    sqlx::query_as::<_, TaskRecord>(
        "SELECT task_id, uuid, parent_task_id, root_task_id, title, description, suggested_subtasks, status, priority, due_date, created_at, user_updated_at, system_updated_at, is_deleted, deleted_at, user_id \
         FROM tasks \
         WHERE status = 'todo' AND is_deleted = 0 \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

/// 软删除任务（设置 is_deleted = 1）
pub async fn delete_task(pool: &DbPool, task_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE task_id = ?",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}
