//! 搜索命令模块
//!
//! 提供语义搜索和精确搜索两种搜索方式

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;

use crate::db::{self, NodeRecord, NodeType};
use crate::error::AppError;
use crate::{AppResult, AppState};

/// 搜索结果节点摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSearchSummary {
    pub node_id: i64,
    pub node_type: NodeType,
    pub title: String,
    pub summary: Option<String>,
}

/// 语义搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    pub node: NodeSearchSummary,
    pub score: f64,
}

/// Embedding 模型预热（搜索用）
#[tauri::command]
pub async fn warmup_embedding(state: tauri::State<'_, AppState>) -> AppResult<()> {
    let ai = state
        .ai
        .wait_ready()
        .await
        .map_err(|e| AppError::AiService(format!("AI 服务未就绪: {}", e)))?;

    ai.embedding
        .warmup_search()
        .await
        .map_err(|e| AppError::AiService(format!("Embedding 预热失败: {}", e)))?;

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
    let pool = &state.db;
    let embedding_type = embedding_type.unwrap_or_else(|| "content".to_string());
    let limit = limit.unwrap_or(20).max(1) as usize;
    let search_limit = limit as u64;
    let ai = state
        .ai
        .wait_ready()
        .await
        .map_err(|e| AppError::AiService(format!("AI 服务未就绪: {}", e)))?;

    let search_response = ai
        .search
        .search_hybrid(&query, &embedding_type, scope_node_ids.as_deref(), search_limit)
        .await
        .map_err(|e| AppError::AiService(format!("搜索失败: {}", e)))?;

    // 应用 Scope 权重
    // Local scope (有 scope_node_ids): × 1.5
    // Global scope (无 scope_node_ids): × 1.0
    let weight = if scope_node_ids.is_some() { 1.5 } else { 1.0 };

    let mut best_scores: HashMap<i64, f64> = HashMap::new();
    for result in search_response {
        let score = result.score * weight;
        best_scores
            .entry(result.node_id)
            .and_modify(|best| {
                if score > *best {
                    *best = score;
                }
            })
            .or_insert(score);
    }

    let mut results = Vec::new();
    for (node_id, score) in best_scores {
        match db::get_node_by_id(pool, node_id).await {
            Ok(node) => {
                if node.is_deleted {
                    continue;
                }
                results.push(SemanticSearchResult {
                    node: NodeSearchSummary {
                        node_id: node.node_id,
                        node_type: node.node_type,
                        title: node.title,
                        summary: node.summary,
                    },
                    score,
                });
            }
            Err(sqlx::Error::RowNotFound) => continue,
            Err(err) => return Err(err.into()),
        }
    }

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    results.truncate(limit);

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
