use tauri::State;

use crate::{
    app_state::AppState,
    db::{
        contains_creates_cycle, delete_edge, insert_edge, list_source_nodes, list_target_nodes,
        EdgeRelationType, NewEdge,
    },
    AppResult,
};

use super::{LinkNodesRequest, LinkNodesResponse};
use super::types::NodeListResponse;

fn parse_relation_type(raw: &str) -> Result<EdgeRelationType, String> {
    match raw {
        "contains" => Ok(EdgeRelationType::Contains),
        "related_to" => Ok(EdgeRelationType::RelatedTo),
        _ => Err(format!("Unknown relation_type: {raw}")),
    }
}

#[tauri::command]
pub async fn link_nodes_command(
    state: State<'_, AppState>,
    payload: LinkNodesRequest,
) -> AppResult<LinkNodesResponse> {
    let relation_type = parse_relation_type(&payload.relation_type)?;
    let mut source_node_id = payload.source_node_id;
    let mut target_node_id = payload.target_node_id;

    if matches!(relation_type, EdgeRelationType::RelatedTo) && source_node_id > target_node_id {
        std::mem::swap(&mut source_node_id, &mut target_node_id);
    }

    if matches!(relation_type, EdgeRelationType::Contains)
        && contains_creates_cycle(&state.db, source_node_id, target_node_id).await?
    {
        return Err("contains edge would create a cycle".into());
    }

    insert_edge(
        &state.db,
        NewEdge {
            source_node_id,
            target_node_id,
            relation_type,
            confidence_score: payload.confidence_score,
            is_manual: payload.is_manual.unwrap_or(true),
        },
    )
    .await?;

    Ok(LinkNodesResponse { success: true })
}

#[tauri::command]
pub async fn unlink_nodes_command(
    state: State<'_, AppState>,
    payload: LinkNodesRequest,
) -> AppResult<LinkNodesResponse> {
    let relation_type = parse_relation_type(&payload.relation_type)?;
    let mut source_node_id = payload.source_node_id;
    let mut target_node_id = payload.target_node_id;

    if matches!(relation_type, EdgeRelationType::RelatedTo) && source_node_id > target_node_id {
        std::mem::swap(&mut source_node_id, &mut target_node_id);
    }

    delete_edge(&state.db, source_node_id, target_node_id, relation_type).await?;
    Ok(LinkNodesResponse { success: true })
}

#[tauri::command]
pub async fn list_target_nodes_command(
    state: State<'_, AppState>,
    source_node_id: i64,
    relation_type: String,
) -> AppResult<NodeListResponse> {
    let relation_type = parse_relation_type(&relation_type)?;
    let nodes = list_target_nodes(&state.db, source_node_id, relation_type).await?;
    Ok(NodeListResponse { nodes })
}

#[tauri::command]
pub async fn list_source_nodes_command(
    state: State<'_, AppState>,
    target_node_id: i64,
    relation_type: String,
) -> AppResult<NodeListResponse> {
    let relation_type = parse_relation_type(&relation_type)?;
    let nodes = list_source_nodes(&state.db, target_node_id, relation_type).await?;
    Ok(NodeListResponse { nodes })
}
