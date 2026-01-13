use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::db::{
    contains_creates_cycle, delete_context_chunks_by_type, get_node_by_id, get_node_by_title,
    insert_context_chunks, insert_edge_if_missing, insert_node, insert_node_revision_log,
    list_nodes_by_type, list_resources_for_requeue, list_source_nodes, update_node_summary,
    update_node_title, update_resource_processing_stage, update_resource_review_status,
    update_resource_sync_status, DbPool, EmbeddingType, EdgeRelationType, EmbedChunkResult,
    NewEdge, NewNode, NodeRecord, NodeType, ResourceEmbeddingStatus, ResourceProcessingStage,
    ResourceSubtype, ReviewStatus,
};
use crate::services::{
    AiServices, ClassifyTopicResponse, ClassificationMode, ParentTopicCandidate, ProviderConfig,
    TopicCandidate, AIConfigService,
};

const AI_QUEUE_BUFFER: usize = 32;
const SUMMARY_MAX_LENGTH: i32 = 100;
const CLASSIFY_TOP_K: i32 = 10;
const CLASSIFY_SIMILARITY_THRESHOLD: f64 = 0.7;
const REVIEW_CONFIDENCE_THRESHOLD: f64 = 0.8;

#[derive(Debug)]
struct AiPipelineJob {
    node_id: i64,
}

#[derive(Clone)]
pub struct AiPipeline {
    // Multi-Producer, Single-Consumer
    // Sender可以有多个，同时向同一个管道仍任务
    // 但是Receiver只能有一个
    // 管道里传输的数据类型是AiPipelineJob
    sender: mpsc::Sender<AiPipelineJob>,
    inflight: Arc<Mutex<HashSet<i64>>>,
}

impl AiPipeline {
    pub fn new(
        db: DbPool,
        ai: Arc<AiServices>,
        ai_config: Arc<Mutex<AIConfigService>>,
        app_data_dir: std::path::PathBuf,
    ) -> Self {
        // 创建一个mpsc通道，AI_QUEUE_BUFFER是通道的缓冲区大小
        // 如果超过AI_QUEUE_BUFFER，新的任务会阻塞，直到有空闲位置
        let (sender, receiver) = mpsc::channel(AI_QUEUE_BUFFER);
        let inflight = Arc::new(Mutex::new(HashSet::new()));
        // 只是增加一个引用计数，不会增加新的数据
        // 但是可以被送进新线程里面
        let inflight_worker = inflight.clone();

        tauri::async_runtime::spawn(async move {
            run_pipeline(receiver, inflight_worker, db, ai, ai_config, app_data_dir).await;
        });

        Self { sender, inflight }
    }

    pub async fn enqueue_resource(&self, node_id: i64) -> Result<(), String> {
        // 用括号包起来，使得inflight尽快离开作用域，尽快释放锁
        {
            // 调用self.inflight时，拿到了Arc里面的Mutex
            // 然后调用lock()，拿到了MutexGuard<HashSet<i64>>
            // 但是MutexGuard实现了DerefMut，所以可以像操作HashSet一样操作
            let mut inflight = self.inflight.lock().await;
            // 查询操作不应该消耗变量，所以用引用
            if inflight.contains(&node_id) {
                return Ok(());
            }
            inflight.insert(node_id);
        }

        self.sender
            .send(AiPipelineJob { node_id })
            .await
            .map_err(|_| "AI pipeline stopped".to_string())
    }

    pub async fn enqueue_pending_resources(&self, db: &DbPool) -> Result<usize, String> {
        let node_ids = list_resources_for_requeue(db)
            .await
            .map_err(|e| e.to_string())?;
        let mut enqueued = 0;
        for node_id in node_ids {
            self.enqueue_resource(node_id).await?;
            enqueued += 1;
        }
        Ok(enqueued)
    }
}

async fn run_pipeline(
    mut receiver: mpsc::Receiver<AiPipelineJob>,
    inflight: Arc<Mutex<HashSet<i64>>>,
    db: DbPool,
    ai: Arc<AiServices>,
    ai_config: Arc<Mutex<AIConfigService>>,
    app_data_dir: std::path::PathBuf,
) {
    // receiver.recv().await:
    // 空闲时等待：如果队列里没有任务，代码运行到这里会暂停，释放 CPU 资源，直到有新的 AiPipelineJob 被发送过来。
    // 收到任务时唤醒：一旦有任务，它会醒来，把任务赋值给 job，进入循环体。
    // 通道关闭时退出：如果所有的发送端都被销毁了（比如程序关闭），recv() 会返回 None，循环结束，函数退出。
    while let Some(job) = receiver.recv().await {
        // 串行处理每个文件，如果某个文件出错了，也不会panic，而是只打印错误信息，继续处理下一个文件
        // TODO: 改造为Pipeline，可以并行处理多个文件
        if let Err(err) =
            process_resource_job(&db, &ai, &ai_config, &app_data_dir, job.node_id).await
        {
            eprintln!("[AiPipeline] node {} failed: {}", job.node_id, err);
        }

        let mut inflight = inflight.lock().await;
        inflight.remove(&job.node_id);
    }
}

async fn process_resource_job(
    db: &DbPool,
    ai: &AiServices,
    ai_config: &Arc<Mutex<AIConfigService>>,
    app_data_dir: &Path,
    node_id: i64,
) -> Result<(), String> {
    // 1. 获取node
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
    // 非 Text 类型才传递 file_path
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

    // 2. 确保content不为空（除非有可用文件回退）
    let content = node
        .file_content // Option<String>
        .as_deref() // Option<&str>
        .unwrap_or("") // &str
        .trim() // &str
        .to_string(); // String
    if content.is_empty() && file_path_for_summary.is_none() {
        mark_resource_error(db, node_id, &node, "resource content is empty").await?;
        return Ok(());
    }

    let processing_result: Result<(String, String, ClassificationMode, ProviderConfig, String), String> = async {
        // 3. 更新状态为Pending
        update_resource_sync_status(
            db,
            node_id,
            ResourceEmbeddingStatus::Pending,
            node.embedded_hash.as_deref(),
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

        // 4. 获取processing provider和processing model
        let (provider, model, classification_mode, provider_config) =
            get_processing_config(ai_config).await?;

        // 5. 获取summary
        // 根据资源类型决定是否传递 file_path
        let summary = ai
            .agent
            .summarize(
                &provider,
                &model,
                &provider_config,
                &content,
                node.user_note.as_deref(),
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

        // 6. 更新处理阶段为Embedding，同时更新processing_hash
        update_resource_processing_stage(db, node_id, ResourceProcessingStage::Embedding, node.file_hash.as_deref())
            .await
            .map_err(|e| e.to_string())?;
        
        // 7. 同步summary和content的embedding
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

    // 8. 更新检查处理结果
    let (provider, model, classification_mode, provider_config, summary) = match processing_result {
        Ok(data) => data,
        Err(err) => {
            mark_resource_error(db, node_id, &node, &err).await?;
            return Err(err);
        }
    };

    // 9. 分类
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

async fn sync_embeddings_for_type(
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

async fn classify_and_link_topic(
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
            let (topic_id, _) =
                create_topic_node(db, &payload.new_topic.title, payload.new_topic.summary.as_deref())
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
                let (id, _) =
                    create_topic_node(db, &new_parent.title, new_parent.summary.as_deref()).await?;
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
    title: &str,
    summary: Option<&str>,
) -> Result<(i64, bool), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("topic title is empty".to_string());
    }

    if let Some(node) = find_similar_topic(db, title).await? {
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

    Ok((node_id, true))
}

async fn find_similar_topic(db: &DbPool, title: &str) -> Result<Option<NodeRecord>, String> {
    if let Some(node) = get_node_by_title(db, NodeType::Topic, title)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(node));
    }

    let normalized = normalize_title(title);
    let topics = list_nodes_by_type(db, NodeType::Topic, false)
        .await
        .map_err(|e| e.to_string())?;
    for topic in topics {
        if is_similar_title(&normalized, &normalize_title(&topic.title)) {
            return Ok(Some(topic));
        }
    }
    Ok(None)
}

fn normalize_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

// TODO: 判断标题是否相似太过简单
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

async fn mark_resource_error(
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

async fn get_processing_config(
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

fn resolve_resource_path(app_data_dir: &Path, file_path: &str) -> String {
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
