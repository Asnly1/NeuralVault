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
    simple_void_command,
    AppResult,
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
) -> AppResult<CreateTopicResponse> {
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
    .await?;

    let topic = get_topic_by_id(pool, topic_id).await?;
    Ok(CreateTopicResponse { topic })
}

#[tauri::command]
pub async fn get_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<TopicRecord> {
    Ok(get_topic_by_id(&state.db, topic_id).await?)
}

#[tauri::command]
pub async fn list_topics_command(
    state: State<'_, AppState>,
) -> AppResult<Vec<TopicRecord>> {
    Ok(list_topics(&state.db).await?)
}

// ========== 使用宏生成的简单命令 ==========

simple_void_command!(hard_delete_topic_command, hard_delete_topic, topic_id: i64);

// ========== 需要特殊处理的命令 ==========

#[tauri::command]
pub async fn update_topic_title_command(
    state: State<'_, AppState>,
    topic_id: i64,
    title: String,
) -> AppResult<()> {
    Ok(update_topic_title(&state.db, topic_id, &title).await?)
}

#[tauri::command]
pub async fn update_topic_summary_command(
    state: State<'_, AppState>,
    topic_id: i64,
    summary: Option<String>,
) -> AppResult<()> {
    Ok(update_topic_summary(&state.db, topic_id, summary.as_deref()).await?)
}

// ========== Topic-Resource Link Commands ==========

#[tauri::command]
pub async fn link_resource_to_topic_command(
    state: State<'_, AppState>,
    payload: LinkResourceToTopicRequest,
) -> AppResult<SuccessResponse> {
    let review_status = parse_review_status(payload.review_status.as_deref());

    link_resource_to_topic(
        &state.db,
        NewTopicResourceLink {
            topic_id: payload.topic_id,
            resource_id: payload.resource_id,
            confidence_score: payload.confidence_score,
            is_auto_generated: payload.is_auto_generated.unwrap_or(false),
            review_status,
        },
    )
    .await?;

    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_resource_from_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
    resource_id: i64,
) -> AppResult<SuccessResponse> {
    unlink_resource_from_topic(&state.db, topic_id, resource_id).await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn update_topic_resource_review_status_command(
    state: State<'_, AppState>,
    payload: UpdateReviewStatusRequest,
) -> AppResult<()> {
    let review_status = parse_review_status(Some(&payload.review_status));
    Ok(update_topic_resource_review_status(&state.db, payload.topic_id, payload.resource_id, review_status).await?)
}

#[tauri::command]
pub async fn get_topic_resources_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<TopicResourcesResponse> {
    let resources = list_resources_for_topic(&state.db, topic_id).await?;
    Ok(TopicResourcesResponse { resources })
}

#[tauri::command]
pub async fn get_resource_topics_command(
    state: State<'_, AppState>,
    resource_id: i64,
) -> AppResult<ResourceTopicsResponse> {
    let topics = list_topics_for_resource(&state.db, resource_id).await?;
    Ok(ResourceTopicsResponse { topics })
}

// ========== Task-Topic Link Commands ==========

#[tauri::command]
pub async fn link_task_to_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> AppResult<SuccessResponse> {
    link_task_to_topic(&state.db, task_id, topic_id).await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_task_from_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> AppResult<SuccessResponse> {
    unlink_task_from_topic(&state.db, task_id, topic_id).await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn get_topic_tasks_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<TopicTasksResponse> {
    let tasks = list_tasks_for_topic(&state.db, topic_id).await?;
    Ok(TopicTasksResponse { tasks })
}

#[tauri::command]
pub async fn get_task_topics_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> AppResult<TaskTopicsResponse> {
    let topics = list_topics_for_task(&state.db, task_id).await?;
    Ok(TaskTopicsResponse { topics })
}
