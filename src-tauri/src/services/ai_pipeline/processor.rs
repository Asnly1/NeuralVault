//! Resource processing logic

use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::classifier::classify_and_link_topic;
use super::{SUMMARY_MAX_LENGTH, SUMMARY_MIN_LENGTH};
use crate::db::{
    delete_context_chunks_by_type, get_node_by_id, insert_context_chunks,
    update_node_summary, update_resource_processing_stage, update_resource_sync_status,
    DbPool, EmbedChunkResult, EmbeddingType, NodeRecord, NodeType, ResourceEmbeddingStatus,
    ResourceProcessingStage, ResourceSubtype,
};
use crate::services::{AiServices, AIConfigService, ClassificationMode, ProviderConfig};

pub(crate) async fn process_resource_job(
    db: &DbPool,
    ai: &AiServices,
    ai_config: &Arc<Mutex<AIConfigService>>,
    app_data_dir: &Path,
    node_id: i64,
) -> Result<(), String> {
    // 1. Get node
    let node = get_node_by_id(db, node_id).await.map_err(|e| e.to_string())?;
    if node.node_type != NodeType::Resource || node.is_deleted {
        return Ok(());
    }

    let resource_subtype_str = node.resource_subtype.map(|s| match s {
        ResourceSubtype::Text => "text",
        ResourceSubtype::Image => "image",
        ResourceSubtype::Pdf => "pdf",
        ResourceSubtype::Url => "url",
        ResourceSubtype::Epub => "epub",
        ResourceSubtype::Other => "other",
    });

    // Non-Text types pass file_path for summary
    let file_path_for_summary = match node.resource_subtype {
        Some(ResourceSubtype::Text) | None => None,
        _ => node.file_path.as_deref(),
    }
    .map(|path| resolve_resource_path(app_data_dir, path));

    let image_path_for_embedding = match node.resource_subtype {
        Some(ResourceSubtype::Image) => node.file_path.as_deref(),
        _ => None,
    }
    .map(|path| resolve_resource_path(app_data_dir, path));

    // 2. Ensure content is not empty (unless file fallback available)
    let content = node
        .file_content
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    if content.is_empty() && file_path_for_summary.is_none() {
        mark_resource_error(db, node_id, &node, "resource content is empty").await?;
        return Ok(());
    }

    let processing_result: Result<(String, String, ClassificationMode, ProviderConfig, String), String> = async {
        // 3. Update status to Pending
        update_resource_sync_status(
            db,
            node_id,
            ResourceEmbeddingStatus::Pending,
            node.embedded_hash.as_deref(),
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

        // 4. Get processing provider and model
        let (provider, model, classification_mode, provider_config) =
            get_processing_config(ai_config).await?;

        // 5. Generate summary
        let summary = ai
            .agent
            .summarize(
                &provider,
                &model,
                &provider_config,
                &content,
                node.user_note.as_deref(),
                SUMMARY_MIN_LENGTH,
                SUMMARY_MAX_LENGTH,
                file_path_for_summary.as_deref(),
                resource_subtype_str,
            )
            .await?;
        let summary = summary.trim().to_string();
        if summary.is_empty() {
            update_node_summary(db, node_id, None)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            update_node_summary(db, node_id, Some(&summary))
                .await
                .map_err(|e| e.to_string())?;
        }

        // 6. Update processing stage to Embedding
        update_resource_processing_stage(db, node_id, ResourceProcessingStage::Embedding, node.file_hash.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        // 7. Sync summary and content embeddings
        sync_embeddings_for_type(
            db,
            ai,
            node_id,
            EmbeddingType::Summary,
            summary.as_str(),
            false,
            None,
        )
        .await?;
        sync_embeddings_for_type(
            db,
            ai,
            node_id,
            EmbeddingType::Content,
            content.as_str(),
            true,
            image_path_for_embedding.as_deref(),
        )
        .await?;

        update_resource_processing_stage(db, node_id, ResourceProcessingStage::Done, node.file_hash.as_deref())
            .await
            .map_err(|e| e.to_string())?;
        update_resource_sync_status(
            db,
            node_id,
            ResourceEmbeddingStatus::Synced,
            node.file_hash.as_deref(),
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

        Ok((provider, model, classification_mode, provider_config, summary))
    }
    .await;

    // 8. Check processing result
    let (provider, model, classification_mode, provider_config, summary) = match processing_result {
        Ok(data) => data,
        Err(err) => {
            mark_resource_error(db, node_id, &node, &err).await?;
            return Err(err);
        }
    };

    // 9. Classify
    if !summary.is_empty() {
        if let Err(err) = classify_and_link_topic(
            db,
            ai,
            &provider,
            &model,
            &provider_config,
            classification_mode,
            &node,
            &summary,
        )
        .await
        {
            eprintln!("[AiPipeline] topic classify failed: {}", err);
        }
    }

    Ok(())
}

pub(crate) async fn sync_embeddings_for_type(
    db: &DbPool,
    ai: &AiServices,
    node_id: i64,
    embedding_type: EmbeddingType,
    text: &str,
    chunk: bool,
    image_path: Option<&str>,
) -> Result<(), String> {
    delete_context_chunks_by_type(db, node_id, embedding_type)
        .await
        .map_err(|e| e.to_string())?;

    ai.embedding
        .delete_by_node(node_id, Some(embedding_type_label(embedding_type)), None)
        .await?;

    let mut chunks: Vec<EmbedChunkResult> = Vec::new();

    if !text.trim().is_empty() {
        let response = ai
            .embedding
            .embed_text(node_id, embedding_type, text, chunk)
            .await?;
        chunks.extend(response.chunks);
    }

    if embedding_type == EmbeddingType::Content {
        if let Some(image_path) = image_path {
            let preview_text = build_image_preview(text);
            let image_chunk = ai
                .embedding
                .embed_image(node_id, embedding_type, image_path, preview_text.as_str())
                .await?;
            chunks.push(image_chunk);
        }
    }

    if chunks.is_empty() {
        return Ok(());
    }

    insert_context_chunks(db, node_id, embedding_type, &chunks)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub(crate) async fn mark_resource_error(
    db: &DbPool,
    node_id: i64,
    node: &NodeRecord,
    message: &str,
) -> Result<(), String> {
    update_resource_processing_stage(db, node_id, ResourceProcessingStage::Done, None)
        .await
        .map_err(|e| e.to_string())?;
    update_resource_sync_status(
        db,
        node_id,
        ResourceEmbeddingStatus::Error,
        node.embedded_hash.as_deref(),
        Some(message),
    )
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn get_processing_config(
    ai_config: &Arc<Mutex<AIConfigService>>,
) -> Result<(String, String, ClassificationMode, ProviderConfig), String> {
    let service = ai_config.lock().await;
    let config = service.load()?;
    drop(service);

    let provider = config
        .processing_provider
        .ok_or_else(|| "processing provider not set".to_string())?;
    let model = config
        .processing_model
        .ok_or_else(|| "processing model not set".to_string())?;

    let provider_config = config
        .providers
        .get(&provider)
        .ok_or_else(|| format!("provider {provider} not configured"))?
        .clone();
    if provider_config.api_key.is_empty() {
        return Err(format!("provider {provider} missing api key"));
    }
    if !provider_config.enabled {
        return Err(format!("provider {provider} is disabled"));
    }

    Ok((provider, model, config.classification_mode, provider_config))
}

pub(crate) fn resolve_resource_path(app_data_dir: &Path, file_path: &str) -> String {
    let path = Path::new(file_path);
    if path.is_absolute() {
        return path.to_string_lossy().to_string();
    }
    app_data_dir.join(path).to_string_lossy().to_string()
}

fn build_image_preview(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed.chars().take(200).collect()
}

fn embedding_type_label(embedding_type: EmbeddingType) -> &'static str {
    match embedding_type {
        EmbeddingType::Summary => "summary",
        EmbeddingType::Content => "content",
    }
}
