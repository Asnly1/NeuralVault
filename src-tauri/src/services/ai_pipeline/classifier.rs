//! Topic classification logic

use std::cmp::Ordering;
use std::collections::HashSet;
use uuid::Uuid;

use super::{
    CLASSIFY_SIMILARITY_THRESHOLD, CLASSIFY_TOP_K, REVIEW_CONFIDENCE_THRESHOLD,
    TOPIC_TITLE_SIMILARITY_THRESHOLD,
};
use crate::db::{
    contains_creates_cycle, get_node_by_id, get_node_by_title, insert_edge_if_missing,
    insert_node, insert_node_revision_log, list_nodes_by_type, list_source_nodes,
    update_node_summary, update_node_title, update_resource_review_status, DbPool, EdgeRelationType,
    NewEdge, NewNode, NodeRecord, NodeType, ResourceEmbeddingStatus, ResourceProcessingStage,
    ReviewStatus,
};
use crate::services::{
    AiServices, ClassificationMode, ClassifyTopicResponse, ParentTopicCandidate, ProviderConfig,
    TopicCandidate,
};

pub(crate) async fn classify_and_link_topic(
    db: &DbPool,
    ai: &AiServices,
    provider: &str,
    model: &str,
    provider_config: &ProviderConfig,
    classification_mode: ClassificationMode,
    node: &NodeRecord,
    summary: &str,
) -> Result<(), String> {
    let similar_resources = search_similar_resources(ai, summary, node.node_id).await?;
    let candidates = build_topic_candidates(db, &similar_resources).await?;

    let response = ai
        .agent
        .classify_topic(provider, model, provider_config, summary, candidates)
        .await?;

    match response {
        ClassifyTopicResponse::Assign {
            payload,
            confidence_score,
        } => {
            let topic = get_node_by_id(db, payload.target_topic_id)
                .await
                .map_err(|e| e.to_string())?;
            if topic.node_type != NodeType::Topic {
                return Err("assign target is not a topic".to_string());
            }
            insert_contains_edge(
                db,
                topic.node_id,
                node.node_id,
                Some(confidence_score),
                false,
            )
            .await?;
            apply_review_status(db, node.node_id, classification_mode, confidence_score).await?;
        }
        ClassifyTopicResponse::CreateNew {
            payload,
            confidence_score,
        } => {
            let (topic_id, _) = create_topic_node(
                db,
                ai,
                &payload.new_topic.title,
                payload.new_topic.summary.as_deref(),
            )
            .await?;
            if let Some(parent_id) = payload.parent_topic_id {
                let parent = get_node_by_id(db, parent_id)
                    .await
                    .map_err(|e| e.to_string())?;
                if parent.node_type != NodeType::Topic {
                    return Err("parent topic id is not a topic".to_string());
                }
                insert_contains_edge(db, parent_id, topic_id, None, false).await?;
            }
            insert_contains_edge(
                db,
                topic_id,
                node.node_id,
                Some(confidence_score),
                false,
            )
            .await?;
            apply_review_status(db, node.node_id, classification_mode, confidence_score).await?;
        }
        ClassifyTopicResponse::Restructure {
            payload,
            confidence_score,
        } => {
            if confidence_score >= REVIEW_CONFIDENCE_THRESHOLD {
                for revision in &payload.topics_to_revise {
                    apply_topic_revision(
                        db,
                        ai,
                        revision.topic_id,
                        revision.new_title.as_deref(),
                        revision.new_summary.as_deref(),
                        provider,
                        model,
                        confidence_score,
                    )
                    .await?;
                }
            }

            let mut parent_topic_id = None;
            if let Some(new_parent) = payload.new_parent_topic.as_ref() {
                let (id, _) = create_topic_node(
                    db,
                    ai,
                    &new_parent.title,
                    new_parent.summary.as_deref(),
                )
                .await?;
                parent_topic_id = Some(id);
            }

            if let Some(parent_id) = parent_topic_id {
                for target_id in &payload.reparent_target_ids {
                    insert_contains_edge(db, parent_id, *target_id, None, false).await?;
                }
                if payload.assign_current_resource_to_parent.unwrap_or(false) {
                    insert_contains_edge(
                        db,
                        parent_id,
                        node.node_id,
                        Some(confidence_score),
                        false,
                    )
                    .await?;
                }
                apply_review_status(db, node.node_id, classification_mode, confidence_score).await?;
            }
        }
    }

    Ok(())
}

async fn search_similar_resources(
    ai: &AiServices,
    summary: &str,
    current_node_id: i64,
) -> Result<Vec<i64>, String> {
    let response = ai
        .search
        .search_hybrid(summary, "summary", None, CLASSIFY_TOP_K as u64)
        .await
        .map_err(|e| format!("classify search failed: {e}"))?;

    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for item in response {
        if item.node_id == current_node_id {
            continue;
        }
        if item.score < CLASSIFY_SIMILARITY_THRESHOLD {
            continue;
        }
        if seen.insert(item.node_id) {
            results.push(item.node_id);
        }
    }

    Ok(results)
}

async fn build_topic_candidates(
    db: &DbPool,
    resource_ids: &[i64],
) -> Result<Vec<TopicCandidate>, String> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    for resource_id in resource_ids {
        let parents = list_source_nodes(db, *resource_id, EdgeRelationType::Contains)
            .await
            .map_err(|e| e.to_string())?;

        for parent in parents {
            if parent.node_type != NodeType::Topic {
                continue;
            }
            if !seen.insert(parent.node_id) {
                continue;
            }

            let parent_candidates = list_source_nodes(db, parent.node_id, EdgeRelationType::Contains)
                .await
                .map_err(|e| e.to_string())?;
            let parent_topics = parent_candidates
                .into_iter()
                .filter(|node| node.node_type == NodeType::Topic)
                .map(|node| ParentTopicCandidate {
                    node_id: node.node_id,
                    title: node.title,
                    summary: node.summary,
                })
                .collect();

            candidates.push(TopicCandidate {
                node_id: parent.node_id,
                title: parent.title,
                summary: parent.summary,
                parents: parent_topics,
            });
        }
    }

    Ok(candidates)
}

async fn insert_contains_edge(
    db: &DbPool,
    source_node_id: i64,
    target_node_id: i64,
    confidence_score: Option<f64>,
    is_manual: bool,
) -> Result<(), String> {
    if contains_creates_cycle(db, source_node_id, target_node_id)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err("contains edge would create a cycle".to_string());
    }

    insert_edge_if_missing(
        db,
        NewEdge {
            source_node_id,
            target_node_id,
            relation_type: EdgeRelationType::Contains,
            confidence_score,
            is_manual,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn apply_review_status(
    db: &DbPool,
    node_id: i64,
    mode: ClassificationMode,
    confidence_score: f64,
) -> Result<(), String> {
    let reviewed = matches!(mode, ClassificationMode::Aggressive)
        && confidence_score >= REVIEW_CONFIDENCE_THRESHOLD;
    let status = if reviewed {
        ReviewStatus::Reviewed
    } else {
        ReviewStatus::Unreviewed
    };
    update_resource_review_status(db, node_id, status)
        .await
        .map_err(|e| e.to_string())
}

async fn create_topic_node(
    db: &DbPool,
    ai: &AiServices,
    title: &str,
    summary: Option<&str>,
) -> Result<(i64, bool), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("topic title is empty".to_string());
    }

    if let Some(node) = find_similar_topic(db, ai, title).await? {
        return Ok((node.node_id, false));
    }

    let uuid = Uuid::new_v4().to_string();
    let summary = summary.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    let node_id = insert_node(
        db,
        NewNode {
            uuid: &uuid,
            user_id: 1,
            title,
            summary,
            node_type: NodeType::Topic,
            task_status: None,
            priority: None,
            due_date: None,
            done_date: None,
            file_hash: None,
            file_path: None,
            file_content: None,
            user_note: None,
            resource_subtype: None,
            source_meta: None,
            embedded_hash: None,
            processing_hash: None,
            embedding_status: ResourceEmbeddingStatus::Pending,
            last_embedding_at: None,
            last_embedding_error: None,
            processing_stage: ResourceProcessingStage::Todo,
            review_status: ReviewStatus::Reviewed,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Err(err) = ai.embedding.upsert_title_embedding(node_id, title).await {
        tracing::warn!(
            node_id,
            error = %err,
            "Failed to upsert topic title embedding"
        );
    }

    Ok((node_id, true))
}

async fn find_similar_topic(
    db: &DbPool,
    ai: &AiServices,
    title: &str,
) -> Result<Option<NodeRecord>, String> {
    if let Some(node) = get_node_by_title(db, NodeType::Topic, title)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(node));
    }

    let mut vector_error = None;
    let mut vector_results = match search_similar_topic_by_vector(ai, title).await {
        Ok(results) => results,
        Err(err) => {
            vector_error = Some(err);
            Vec::new()
        }
    };

    if vector_error.is_none() && vector_results.is_empty() {
        let topics = list_nodes_by_type(db, NodeType::Topic, false)
            .await
            .map_err(|e| e.to_string())?;
        if !topics.is_empty() {
            refresh_topic_title_embeddings(ai, &topics).await;
            vector_results = search_similar_topic_by_vector(ai, title).await?;
        }
    }

    for (node_id, score) in vector_results {
        if score < TOPIC_TITLE_SIMILARITY_THRESHOLD {
            break;
        }
        let node = get_node_by_id(db, node_id)
            .await
            .map_err(|e| e.to_string())?;
        if node.node_type != NodeType::Topic {
            continue;
        }
        if let Err(err) = ai
            .embedding
            .upsert_title_embedding(node.node_id, &node.title)
            .await
        {
            tracing::warn!(
                node_id = node.node_id,
                error = %err,
                "Failed to refresh topic title embedding"
            );
        }
        return Ok(Some(node));
    }

    if let Some(err) = vector_error {
        tracing::warn!(
            error = %err,
            "Topic title vector search failed, falling back to fuzzy match"
        );
        let normalized = normalize_title(title);
        let topics = list_nodes_by_type(db, NodeType::Topic, false)
            .await
            .map_err(|e| e.to_string())?;
        for topic in topics {
            if is_similar_title(&normalized, &normalize_title(&topic.title)) {
                return Ok(Some(topic));
            }
        }
    }

    Ok(None)
}

async fn search_similar_topic_by_vector(
    ai: &AiServices,
    title: &str,
) -> Result<Vec<(i64, f64)>, String> {
    let mut results = ai
        .embedding
        .search_title_similar(title, CLASSIFY_TOP_K as u64)
        .await?;
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));

    let mut scored = Vec::new();
    for result in results {
        if result.score.is_nan() {
            continue;
        }
        scored.push((result.node_id, result.score));
    }

    Ok(scored)
}

async fn refresh_topic_title_embeddings(ai: &AiServices, topics: &[NodeRecord]) {
    for topic in topics {
        if let Err(err) = ai
            .embedding
            .upsert_title_embedding(topic.node_id, &topic.title)
            .await
        {
            tracing::warn!(
                node_id = topic.node_id,
                error = %err,
                "Failed to backfill topic title embedding"
            );
        }
    }
}

fn normalize_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

// Fallback when vector search is unavailable.
fn is_similar_title(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    if a.len() < 4 || b.len() < 4 {
        return false;
    }
    a.contains(b) || b.contains(a)
}

async fn apply_topic_revision(
    db: &DbPool,
    ai: &AiServices,
    topic_id: i64,
    new_title: Option<&str>,
    new_summary: Option<&str>,
    provider: &str,
    model: &str,
    confidence_score: f64,
) -> Result<(), String> {
    let topic = get_node_by_id(db, topic_id)
        .await
        .map_err(|e| e.to_string())?;
    if topic.node_type != NodeType::Topic {
        return Ok(());
    }

    if let Some(title) = new_title.map(str::trim).filter(|v| !v.is_empty()) {
        if title != topic.title {
            insert_node_revision_log(
                db,
                crate::db::NewNodeRevisionLog {
                    node_id: topic_id,
                    field_name: "title",
                    old_value: Some(topic.title.as_str()),
                    new_value: Some(title),
                    reason: Some("ai_restructure"),
                    provider: Some(provider),
                    model: Some(model),
                    confidence_score: Some(confidence_score),
                },
            )
            .await
            .map_err(|e| e.to_string())?;
            update_node_title(db, topic_id, title)
                .await
                .map_err(|e| e.to_string())?;
            if let Err(err) = ai.embedding.upsert_title_embedding(topic_id, title).await {
                tracing::warn!(
                    topic_id,
                    error = %err,
                    "Failed to upsert revised topic title embedding"
                );
            }
        }
    }

    if let Some(summary) = new_summary.map(str::trim) {
        let current = topic.summary.as_deref().unwrap_or("");
        let next = summary;
        if current != next {
            insert_node_revision_log(
                db,
                crate::db::NewNodeRevisionLog {
                    node_id: topic_id,
                    field_name: "summary",
                    old_value: if current.is_empty() { None } else { Some(current) },
                    new_value: if next.is_empty() { None } else { Some(next) },
                    reason: Some("ai_restructure"),
                    provider: Some(provider),
                    model: Some(model),
                    confidence_score: Some(confidence_score),
                },
            )
            .await
            .map_err(|e| e.to_string())?;
            update_node_summary(db, topic_id, if next.is_empty() { None } else { Some(next) })
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
