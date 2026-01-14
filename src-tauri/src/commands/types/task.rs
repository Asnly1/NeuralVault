//! 任务相关命令类型

use serde::{Deserialize, Serialize};

use crate::db::{NodeRecord, TaskPriority, TaskStatus};

/// 创建任务请求
#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
    pub user_note: Option<String>,
}

/// 创建任务响应
#[derive(Debug, Serialize)]
pub struct CreateTaskResponse {
    pub node: NodeRecord,
}

