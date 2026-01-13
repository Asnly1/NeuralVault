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
}

/// Embedding 模型预热（搜索用）
#[tauri::command]
pub async fn warmup_embedding(state: tauri::State<'_, AppState>) -> AppResult<()> {
    let ai = state
        .ai
        .wait_ready()
        .await
        .map_err(|e| crate::AppError::Custom(format!("AI services not ready: {}", e)))?;

    ai.embedding
        .warmup_search()
        .await
        .map_err(|e| crate::AppError::Custom(format!("Embedding warmup failed: {}", e)))?;

    Ok(())
}

/// 语义搜索
///
/// 使用 LanceDB 进行混合检索（FTS + dense 向量）
#[tauri::command]
pub async fn search_semantic(
    state: tauri::State<'_, AppState>,
    query: String,
    scope_node_ids: Option<Vec<i64>>,
    embedding_type: Option<String>,
    limit: Option<i32>,
) -> AppResult<Vec<SemanticSearchResult>> {
    let embedding_type = embedding_type.unwrap_or_else(|| "content".to_string());
    let limit = limit.unwrap_or(20).max(1) as u64;
    let ai = state
        .ai
        .wait_ready()
        .await
        .map_err(|e| crate::AppError::Custom(format!("AI services not ready: {}", e)))?;

    let search_response = ai
        .search
        .search_hybrid(&query, &embedding_type, scope_node_ids.as_deref(), limit)
        .await
        .map_err(|e| crate::AppError::Custom(format!("Search failed: {}", e)))?;

    // 应用 Scope 权重
    // Local scope (有 scope_node_ids): × 1.5
    // Global scope (无 scope_node_ids): × 1.0
    let weight = if scope_node_ids.is_some() { 1.5 } else { 1.0 };

    let results: Vec<SemanticSearchResult> = search_response
        .into_iter()
        .map(|r| SemanticSearchResult {
            node_id: r.node_id,
            chunk_index: r.chunk_index,
            chunk_text: r.chunk_text,
            score: r.score * weight,
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
