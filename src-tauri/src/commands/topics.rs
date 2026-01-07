use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        get_topic_by_id, hard_delete_topic, insert_topic, link_resource_to_topic,
        link_task_to_topic, list_resources_for_topic, list_tasks_for_topic, list_topics,
        list_topics_for_resource, list_topics_for_task, unlink_resource_from_topic,
        unlink_task_from_topic, update_topic_resource_review_status, update_topic_summary,
        update_topic_title, NewTopic, NewTopicResourceLink, ResourceRecord, TaskRecord,
        TopicRecord, TopicReviewStatus,
    },
};

// ========== Request/Response Types ==========

#[derive(Debug, Deserialize)]
pub struct CreateTopicRequest {
    pub title: String,
    pub summary: Option<String>,
    pub is_system_default: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateTopicResponse {
    pub topic: TopicRecord,
}

#[derive(Debug, Deserialize)]
pub struct LinkResourceToTopicRequest {
    pub topic_id: i64,
    pub resource_id: i64,
    pub confidence_score: Option<f64>,
    pub is_auto_generated: Option<bool>,
    pub review_status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewStatusRequest {
    pub topic_id: i64,
    pub resource_id: i64,
    pub review_status: String,
}

#[derive(Debug, Serialize)]
pub struct TopicResourcesResponse {
    pub resources: Vec<ResourceRecord>,
}

#[derive(Debug, Serialize)]
pub struct TopicTasksResponse {
    pub tasks: Vec<TaskRecord>,
}

#[derive(Debug, Serialize)]
pub struct ResourceTopicsResponse {
    pub topics: Vec<TopicRecord>,
}

#[derive(Debug, Serialize)]
pub struct TaskTopicsResponse {
    pub topics: Vec<TopicRecord>,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
}

fn parse_review_status(s: Option<&str>) -> TopicReviewStatus {
    match s {
        Some("approved") => TopicReviewStatus::Approved,
        Some("rejected") => TopicReviewStatus::Rejected,
        _ => TopicReviewStatus::Pending,
    }
}

// ========== Topic CRUD Commands ==========

#[tauri::command]
pub async fn create_topic(
    state: State<'_, AppState>,
    payload: CreateTopicRequest,
) -> Result<CreateTopicResponse, String> {
    let pool = &state.db;
    
    let topic_id = insert_topic(
        pool,
        NewTopic {
            title: &payload.title,
            summary: payload.summary.as_deref(),
            is_system_default: payload.is_system_default.unwrap_or(false),
            user_id: 1,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let topic = get_topic_by_id(pool, topic_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(CreateTopicResponse { topic })
}

#[tauri::command]
pub async fn get_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> Result<TopicRecord, String> {
    let pool = &state.db;
    get_topic_by_id(pool, topic_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_topics_command(
    state: State<'_, AppState>,
) -> Result<Vec<TopicRecord>, String> {
    let pool = &state.db;
    list_topics(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_topic_title_command(
    state: State<'_, AppState>,
    topic_id: i64,
    title: String,
) -> Result<(), String> {
    let pool = &state.db;
    update_topic_title(pool, topic_id, &title)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_topic_summary_command(
    state: State<'_, AppState>,
    topic_id: i64,
    summary: Option<String>,
) -> Result<(), String> {
    let pool = &state.db;
    update_topic_summary(pool, topic_id, summary.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hard_delete_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> Result<(), String> {
    let pool = &state.db;
    hard_delete_topic(pool, topic_id)
        .await
        .map_err(|e| e.to_string())
}

// ========== Topic-Resource Link Commands ==========

#[tauri::command]
pub async fn link_resource_to_topic_command(
    state: State<'_, AppState>,
    payload: LinkResourceToTopicRequest,
) -> Result<SuccessResponse, String> {
    let pool = &state.db;

    let review_status = parse_review_status(payload.review_status.as_deref());

    link_resource_to_topic(
        pool,
        NewTopicResourceLink {
            topic_id: payload.topic_id,
            resource_id: payload.resource_id,
            confidence_score: payload.confidence_score,
            is_auto_generated: payload.is_auto_generated.unwrap_or(false),
            review_status,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_resource_from_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
    resource_id: i64,
) -> Result<SuccessResponse, String> {
    let pool = &state.db;
    unlink_resource_from_topic(pool, topic_id, resource_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn update_topic_resource_review_status_command(
    state: State<'_, AppState>,
    payload: UpdateReviewStatusRequest,
) -> Result<(), String> {
    let pool = &state.db;
    let review_status = parse_review_status(Some(&payload.review_status));
    update_topic_resource_review_status(pool, payload.topic_id, payload.resource_id, review_status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_topic_resources_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> Result<TopicResourcesResponse, String> {
    let pool = &state.db;
    let resources = list_resources_for_topic(pool, topic_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(TopicResourcesResponse { resources })
}

#[tauri::command]
pub async fn get_resource_topics_command(
    state: State<'_, AppState>,
    resource_id: i64,
) -> Result<ResourceTopicsResponse, String> {
    let pool = &state.db;
    let topics = list_topics_for_resource(pool, resource_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ResourceTopicsResponse { topics })
}

// ========== Task-Topic Link Commands ==========

#[tauri::command]
pub async fn link_task_to_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> Result<SuccessResponse, String> {
    let pool = &state.db;
    link_task_to_topic(pool, task_id, topic_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_task_from_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> Result<SuccessResponse, String> {
    let pool = &state.db;
    unlink_task_from_topic(pool, task_id, topic_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn get_topic_tasks_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> Result<TopicTasksResponse, String> {
    let pool = &state.db;
    let tasks = list_tasks_for_topic(pool, topic_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(TopicTasksResponse { tasks })
}

#[tauri::command]
pub async fn get_task_topics_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<TaskTopicsResponse, String> {
    let pool = &state.db;
    let topics = list_topics_for_task(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(TaskTopicsResponse { topics })
}
