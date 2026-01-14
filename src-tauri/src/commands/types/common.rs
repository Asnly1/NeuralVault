//! 通用命令类型

use serde::{Deserialize, Serialize};

use crate::db::NodeRecord;

/// Dashboard 数据
#[derive(Debug, Serialize)]
pub struct DashboardData {
    pub tasks: Vec<NodeRecord>,
    pub resources: Vec<NodeRecord>,
}

/// 节点关联请求
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkNodesRequest {
    pub source_node_id: i64,
    pub target_node_id: i64,
    pub relation_type: String,
    pub confidence_score: Option<f64>,
    pub is_manual: Option<bool>,
}

/// 节点关联响应
#[derive(Debug, Serialize)]
pub struct LinkNodesResponse {
    pub success: bool,
}

/// 节点列表响应
#[derive(Debug, Serialize)]
pub struct NodeListResponse {
    pub nodes: Vec<NodeRecord>,
}

