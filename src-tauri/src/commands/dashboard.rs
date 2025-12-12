use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        insert_resource, insert_task, list_active_tasks, list_unclassified_resources, NewResource,
        NewTask, ResourceClassificationStatus, ResourceFileType, ResourceProcessingStage,
        ResourceSyncStatus, SourceMeta, TaskPriority, TaskStatus,
    },
};

use super::{DashboardData, SeedResponse};

#[tauri::command]
pub async fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardData, String> {
    let pool = &state.db;
    let tasks = list_active_tasks(pool).await.map_err(|e| e.to_string())?;
    let resources = list_unclassified_resources(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(DashboardData { tasks, resources })
}

#[tauri::command]
pub async fn seed_demo_data(state: State<'_, AppState>) -> Result<SeedResponse, String> {
    let pool = &state.db;

    let demo_tasks = vec![
        (
            "梳理需求列表",
            "整理上周访谈要点，准备下周评审。",
            TaskStatus::Todo,
            TaskPriority::High,
            Some("2024-12-31"),
        ),
        (
            "整理知识库",
            "把历史文档分类到知识库，补充标签。",
            TaskStatus::Todo,
            TaskPriority::Medium,
            None,
        ),
        (
            "实现 Capture PoC",
            "验证 HUD 捕获流程并写出技术风险。",
            TaskStatus::Done,
            TaskPriority::High,
            Some("2024-12-20"),
        ),
    ];

    let mut task_ids = Vec::new();
    for (title, desc, status, priority, due) in demo_tasks {
        let uuid = Uuid::new_v4().to_string();
        let task_id = insert_task(
            pool,
            NewTask {
                uuid: &uuid,
                parent_task_id: None,
                root_task_id: None,
                title: Some(title),
                description: Some(desc),
                suggested_subtasks: None,
                status,
                priority,
                due_date: due,
                user_id: 1,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        task_ids.push(task_id);
    }

    let demo_resources: Vec<(&str, &str, Option<&str>, Option<&str>)> = vec![
        ("访谈记录.txt", "text", Some("整理后打标签"), None),
        ("需求文档.pdf", "pdf", Some("最新需求文档"), None),
        (
            "灵感链接",
            "url",
            Some("产品灵感参考"),
            Some("https://example.com/ideas"),
        ),
    ];

    for (name, file_type, content, url) in &demo_resources {
        let uuid = Uuid::new_v4().to_string();
        let file_hash = format!("hash-{uuid}");
        let meta = url.map(|u| SourceMeta {
            url: Some(u.to_string()),
            window_title: None,
        });
        insert_resource(
            pool,
            NewResource {
                uuid: &uuid,
                source_meta: meta.as_ref(),
                file_hash: &file_hash,
                file_type: match *file_type {
                    "pdf" => ResourceFileType::Pdf,
                    "url" => ResourceFileType::Url,
                    "image" => ResourceFileType::Image,
                    "epub" => ResourceFileType::Epub,
                    "other" => ResourceFileType::Other,
                    _ => ResourceFileType::Text,
                },
                content: *content,
                display_name: Some(name),
                file_path: None,
                file_size_bytes: None,
                indexed_hash: None,
                processing_hash: None,
                sync_status: ResourceSyncStatus::Pending,
                last_indexed_at: None,
                last_error: None,
                processing_stage: ResourceProcessingStage::Todo,
                classification_status: ResourceClassificationStatus::Unclassified,
                user_id: 1,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(SeedResponse {
        tasks_created: task_ids.len(),
        resources_created: demo_resources.len(),
    })
}
