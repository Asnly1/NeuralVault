//! 主题相关命令

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        contains_creates_cycle, delete_edge, get_node_by_id, hard_delete_node, insert_edge,
        list_nodes_by_type, list_source_nodes, list_target_nodes, soft_delete_node,
        update_node_pinned, update_node_summary, update_node_title, update_resource_review_status,
        EdgeRelationType, NewEdge, NodeBuilder, NodeRecord, NodeType,
    },
    simple_void_command,
    utils::{parse_review_status_or_default, validate_title},
    AppResult,
};

use super::types::NodeListResponse;

// ========== 请求/响应类型 ==========

#[derive(Debug, Deserialize)]
pub struct CreateTopicRequest {
    pub title: String,
    pub summary: Option<String>,
    pub is_favourite: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateTopicResponse {
    pub node: NodeRecord,
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
pub struct SuccessResponse {
    pub success: bool,
}

// ========== 简单命令 ==========

simple_void_command!(soft_delete_topic_command, soft_delete_node, topic_id: i64);
simple_void_command!(hard_delete_topic_command, hard_delete_node, topic_id: i64);

// ========== 创建主题 ==========

#[tauri::command]
pub async fn create_topic(
    state: State<'_, AppState>,
    payload: CreateTopicRequest,
) -> AppResult<CreateTopicResponse> {
    let title = validate_title(&payload.title)?;

    let node_id = NodeBuilder::topic()
        .title(title)
        .summary(payload.summary.as_deref())
        .insert(&state.db)
        .await?;

    if payload.is_favourite.unwrap_or(false) {
        update_node_pinned(&state.db, node_id, true).await?;
    }

    let node = get_node_by_id(&state.db, node_id).await?;
    Ok(CreateTopicResponse { node })
}

// ========== 查询主题 ==========

#[tauri::command]
pub async fn get_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<NodeRecord> {
    Ok(get_node_by_id(&state.db, topic_id).await?)
}

#[tauri::command]
pub async fn list_topics_command(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(list_nodes_by_type(&state.db, NodeType::Topic, false).await?)
}

// ========== 更新主题 ==========

#[tauri::command]
pub async fn update_topic_title_command(
    state: State<'_, AppState>,
    topic_id: i64,
    title: String,
) -> AppResult<()> {
    let title = validate_title(&title)?;
    Ok(update_node_title(&state.db, topic_id, title).await?)
}

#[tauri::command]
pub async fn update_topic_summary_command(
    state: State<'_, AppState>,
    topic_id: i64,
    summary: Option<String>,
) -> AppResult<()> {
    Ok(update_node_summary(&state.db, topic_id, summary.as_deref()).await?)
}

#[tauri::command]
pub async fn update_topic_favourite_command(
    state: State<'_, AppState>,
    topic_id: i64,
    is_favourite: bool,
) -> AppResult<()> {
    Ok(update_node_pinned(&state.db, topic_id, is_favourite).await?)
}

// ========== 主题-资源关联 ==========

#[tauri::command]
pub async fn link_resource_to_topic_command(
    state: State<'_, AppState>,
    payload: LinkResourceToTopicRequest,
) -> AppResult<SuccessResponse> {
    let review_status = parse_review_status_or_default(payload.review_status.as_deref());

    if contains_creates_cycle(&state.db, payload.topic_id, payload.resource_id).await? {
        return Err("创建 contains 边会形成环".into());
    }

    insert_edge(
        &state.db,
        NewEdge {
            source_node_id: payload.topic_id,
            target_node_id: payload.resource_id,
            relation_type: EdgeRelationType::Contains,
            confidence_score: payload.confidence_score,
            is_manual: !payload.is_auto_generated.unwrap_or(false),
        },
    )
    .await?;

    update_resource_review_status(&state.db, payload.resource_id, review_status).await?;

    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_resource_from_topic_command(
    state: State<'_, AppState>,
    topic_id: i64,
    resource_id: i64,
) -> AppResult<SuccessResponse> {
    delete_edge(&state.db, topic_id, resource_id, EdgeRelationType::Contains).await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn update_topic_resource_review_status_command(
    state: State<'_, AppState>,
    payload: UpdateReviewStatusRequest,
) -> AppResult<()> {
    let review_status = parse_review_status_or_default(Some(&payload.review_status));
    Ok(update_resource_review_status(&state.db, payload.resource_id, review_status).await?)
}

#[tauri::command]
pub async fn get_topic_resources_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<NodeListResponse> {
    let nodes = list_target_nodes(&state.db, topic_id, EdgeRelationType::Contains).await?;
    Ok(NodeListResponse { nodes })
}

#[tauri::command]
pub async fn get_resource_topics_command(
    state: State<'_, AppState>,
    resource_id: i64,
) -> AppResult<NodeListResponse> {
    let nodes = list_source_nodes(&state.db, resource_id, EdgeRelationType::Contains).await?;
    Ok(NodeListResponse { nodes })
}

// ========== 主题-任务关联 ==========

#[tauri::command]
pub async fn link_task_to_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> AppResult<SuccessResponse> {
    if contains_creates_cycle(&state.db, topic_id, task_id).await? {
        return Err("创建 contains 边会形成环".into());
    }

    insert_edge(
        &state.db,
        NewEdge {
            source_node_id: topic_id,
            target_node_id: task_id,
            relation_type: EdgeRelationType::Contains,
            confidence_score: None,
            is_manual: true,
        },
    )
    .await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn unlink_task_from_topic_command(
    state: State<'_, AppState>,
    task_id: i64,
    topic_id: i64,
) -> AppResult<SuccessResponse> {
    delete_edge(&state.db, topic_id, task_id, EdgeRelationType::Contains).await?;
    Ok(SuccessResponse { success: true })
}

#[tauri::command]
pub async fn get_topic_tasks_command(
    state: State<'_, AppState>,
    topic_id: i64,
) -> AppResult<NodeListResponse> {
    let nodes = list_target_nodes(&state.db, topic_id, EdgeRelationType::Contains).await?;
    Ok(NodeListResponse { nodes })
}

#[tauri::command]
pub async fn get_task_topics_command(
    state: State<'_, AppState>,
    task_id: i64,
) -> AppResult<NodeListResponse> {
    let nodes = list_source_nodes(&state.db, task_id, EdgeRelationType::Contains).await?;
    Ok(NodeListResponse { nodes })
}
