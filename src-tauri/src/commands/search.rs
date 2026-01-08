// 搜索命令模块
//
// 提供语义搜索和精确搜索两种搜索方式

use serde::{Deserialize, Serialize};

use crate::db::{self, NodeRecord, NodeType};
use crate::{AppResult, AppState};

/// 语义搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    pub node_id: i64,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub score: f64,
    pub page_number: Option<i32>,
}

/// 语义搜索（调用 Python /search/hybrid）
///
/// 使用 Qdrant 进行 dense + sparse 混合检索（RRF 融合）
#[tauri::command]
pub async fn search_semantic(
    state: tauri::State<'_, AppState>,
    query: String,
    scope_node_ids: Option<Vec<i64>>,
    embedding_type: Option<String>,
    limit: Option<i32>,
) -> AppResult<Vec<SemanticSearchResult>> {
    let python = &state.python;

    // 构建请求体
    let mut payload = serde_json::json!({
        "query": query,
        "embedding_type": embedding_type.unwrap_or_else(|| "content".to_string()),
        "limit": limit.unwrap_or(20),
    });

    // 如果有 scope_node_ids，添加到请求中（Local scope）
    if let Some(node_ids) = &scope_node_ids {
        payload["node_ids"] = serde_json::json!(node_ids);
    }

    // 调用 Python 搜索 API
    let base_url = python.get_base_url();
    let url = format!("{}/search/hybrid", base_url);

    let response = python
        .client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| crate::AppError::Custom(format!("Failed to call search API: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::AppError::Custom(format!(
            "Search API returned {}: {}",
            status, body
        )));
    }

    #[derive(Deserialize)]
    struct SearchResponse {
        results: Vec<SearchResultItem>,
    }

    #[derive(Deserialize)]
    struct SearchResultItem {
        node_id: i64,
        chunk_index: i32,
        chunk_text: String,
        score: f64,
        page_number: Option<i32>,
    }

    let search_response: SearchResponse = response.json().await.map_err(|e| {
        crate::AppError::Custom(format!("Failed to parse search response: {}", e))
    })?;

    // 应用 Scope 权重
    // Local scope (有 scope_node_ids): × 1.5
    // Global scope (无 scope_node_ids): × 1.0
    let weight = if scope_node_ids.is_some() { 1.5 } else { 1.0 };

    let results: Vec<SemanticSearchResult> = search_response
        .results
        .into_iter()
        .map(|r| SemanticSearchResult {
            node_id: r.node_id,
            chunk_index: r.chunk_index,
            chunk_text: r.chunk_text,
            score: r.score * weight,
            page_number: r.page_number,
        })
        .collect();

    Ok(results)
}

/// 精确搜索（SQL LIKE）
///
/// 在 title、file_content、user_note 中进行模糊匹配
#[tauri::command]
pub async fn search_keyword(
    state: tauri::State<'_, AppState>,
    query: String,
    node_type: Option<String>,
    limit: Option<i32>,
) -> AppResult<Vec<NodeRecord>> {
    let pool = &state.db;

    // 解析 node_type
    let nt = node_type.and_then(|s| match s.as_str() {
        "topic" => Some(NodeType::Topic),
        "task" => Some(NodeType::Task),
        "resource" => Some(NodeType::Resource),
        _ => None,
    });

    let results = db::search_nodes_by_keyword(pool, &query, nt, limit.unwrap_or(20)).await?;

    Ok(results)
}
