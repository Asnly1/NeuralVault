use std::collections::HashSet;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::db::{
    delete_context_chunks_by_type, get_node_by_id, get_node_by_title, insert_context_chunks,
    insert_edge_if_missing, insert_node, list_nodes_by_type, update_node_summary,
    update_resource_processing_stage, update_resource_sync_status, DbPool,
    EmbeddingType, EdgeRelationType, NewEdge, NewNode, NodeRecord, NodeType,
    ResourceProcessingStage, ResourceEmbeddingStatus, ReviewStatus, EmbedChunkResult,
};
use crate::services::AIConfigService;
use crate::sidecar::PythonSidecar;

const AI_QUEUE_BUFFER: usize = 32;
const SUMMARY_MAX_LENGTH: i32 = 100;

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
        python: Arc<PythonSidecar>,
        ai_config: Arc<Mutex<AIConfigService>>,
    ) -> Self {
        // 创建一个mpsc通道，AI_QUEUE_BUFFER是通道的缓冲区大小
        // 如果超过AI_QUEUE_BUFFER，新的任务会阻塞，直到有空闲位置
        let (sender, receiver) = mpsc::channel(AI_QUEUE_BUFFER);
        let inflight = Arc::new(Mutex::new(HashSet::new()));
        // 只是增加一个引用计数，不会增加新的数据
        // 但是可以被送进新线程里面
        let inflight_worker = inflight.clone();

        tauri::async_runtime::spawn(async move {
            run_pipeline(receiver, inflight_worker, db, python, ai_config).await;
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
}

async fn run_pipeline(
    mut receiver: mpsc::Receiver<AiPipelineJob>,
    inflight: Arc<Mutex<HashSet<i64>>>,
    db: DbPool,
    python: Arc<PythonSidecar>,
    ai_config: Arc<Mutex<AIConfigService>>,
) {
    // receiver.recv().await:
    // 空闲时等待：如果队列里没有任务，代码运行到这里会暂停，释放 CPU 资源，直到有新的 AiPipelineJob 被发送过来。
    // 收到任务时唤醒：一旦有任务，它会醒来，把任务赋值给 job，进入循环体。
    // 通道关闭时退出：如果所有的发送端都被销毁了（比如程序关闭），recv() 会返回 None，循环结束，函数退出。
    while let Some(job) = receiver.recv().await {
        // 串行处理每个文件，如果某个文件出错了，也不会panic，而是只打印错误信息，继续处理下一个文件
        // TODO: 改造为Pipeline，可以并行处理多个文件
        if let Err(err) = process_resource_job(&db, &python, &ai_config, job.node_id).await {
            eprintln!("[AiPipeline] node {} failed: {}", job.node_id, err);
        }

        let mut inflight = inflight.lock().await;
        inflight.remove(&job.node_id);
    }
}

async fn process_resource_job(
    db: &DbPool,
    python: &PythonSidecar,
    ai_config: &Arc<Mutex<AIConfigService>>,
    node_id: i64,
) -> Result<(), String> {
    // 1. 获取node
    let node = get_node_by_id(db, node_id).await.map_err(|e| e.to_string())?;
    if node.node_type != NodeType::Resource || node.is_deleted {
        return Ok(());
    }

    // 2. 确保content不为空
    let content = node
        .file_content // Option<String>
        .as_deref() // Option<&str>
        .unwrap_or("") // &str
        .trim() // &str
        .to_string(); // String
    if content.is_empty() {
        mark_resource_error(db, node_id, &node, "resource content is empty").await?;
        return Ok(());
    }

    let processing_result: Result<(String, String, String), String> = async {
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
        let (provider, model) = get_processing_provider_model(ai_config).await?;

        // 5. 获取summary
        let summary = request_summary(python, &provider, &model, &content, node.user_note.as_deref()).await?;
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

        ensure_python_ready(python).await?;
        
        // 6. 更新处理阶段为Embedding
        update_resource_processing_stage(db, node_id, ResourceProcessingStage::Embedding)
            .await
            .map_err(|e| e.to_string())?;
        
        // 7. 同步summary和content的embedding
        sync_embeddings_for_type(
            db,
            python,
            node_id,
            EmbeddingType::Summary,
            summary.as_str(),
            false,
        )
        .await?;
        sync_embeddings_for_type(
            db,
            python,
            node_id,
            EmbeddingType::Content,
            content.as_str(),
            true,
        )
        .await?;

        update_resource_processing_stage(db, node_id, ResourceProcessingStage::Done)
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

        Ok((provider, model, summary))
    }
    .await;

    // 8. 更新检查处理结果
    let (provider, model, summary) = match processing_result {
        Ok(data) => data,
        Err(err) => {
            mark_resource_error(db, node_id, &node, &err).await?;
            return Err(err);
        }
    };

    // 9. 分类
    if !summary.is_empty() {
        if let Err(err) = classify_and_link_topic(db, python, &provider, &model, &node, &summary)
            .await
        {
            eprintln!("[AiPipeline] topic classify failed: {}", err);
        }
    }

    Ok(())
}

async fn sync_embeddings_for_type(
    db: &DbPool,
    python: &PythonSidecar,
    node_id: i64,
    embedding_type: EmbeddingType,
    text: &str,
    chunk: bool,
) -> Result<(), String> {
    delete_context_chunks_by_type(db, node_id, embedding_type)
        .await
        .map_err(|e| e.to_string())?;

    if text.trim().is_empty() {
        request_delete_embedding(python, node_id, embedding_type).await?;
        return Ok(());
    }

    // TODO:更新processing_hash
    let response = request_embed(python, node_id, embedding_type, text, chunk).await?;
    if response.chunks.is_empty() {
        return Ok(());
    }

    let chunks: Vec<EmbedChunkResult> = response
        .chunks
        .into_iter()
        .map(|chunk| EmbedChunkResult {
            chunk_text: chunk.chunk_text,
            chunk_index: chunk.chunk_index,
            qdrant_uuid: chunk.qdrant_uuid,
            embedding_hash: chunk.embedding_hash,
            token_count: chunk.token_count,
        })
        .collect();

    insert_context_chunks(
        db,
        node_id,
        embedding_type,
        &chunks,
        response.dense_embedding_model.as_deref(),
        response.sparse_embedding_model.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn classify_and_link_topic(
    db: &DbPool,
    python: &PythonSidecar,
    provider: &str,
    model: &str,
    node: &NodeRecord,
    summary: &str,
) -> Result<(), String> {
    let topics = list_nodes_by_type(db, NodeType::Topic, false)
        .await
        .map_err(|e| e.to_string())?;
    let candidates: Vec<TopicCandidate> = topics
        .iter()
        .map(|topic| TopicCandidate {
            title: topic.title.clone(),
            summary: topic.summary.clone(),
        })
        .collect();

    let response = request_classify(python, provider, model, summary, candidates).await?;
    let topic_name = response.topic_name.trim();

    let topic_id = ensure_topic_node(db, topic_name).await?;
    insert_edge_if_missing(
        db,
        NewEdge {
            source_node_id: topic_id,
            target_node_id: node.node_id,
            relation_type: EdgeRelationType::Contains,
            confidence_score: Some(response.confidence),
            is_manual: false,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn ensure_topic_node(db: &DbPool, title: &str) -> Result<i64, String> {
    if let Some(node) = get_node_by_title(db, NodeType::Topic, title)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(node.node_id);
    }

    let uuid = Uuid::new_v4().to_string();
    let insert_result = insert_node(
        db,
        NewNode {
            uuid: &uuid,
            user_id: 1,
            title,
            summary: None,
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
    .await;

    if let Ok(node_id) = insert_result {
        return Ok(node_id);
    }

    if let Some(node) = get_node_by_title(db, NodeType::Topic, title)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(node.node_id);
    }

    Err("failed to create topic".to_string())
}

async fn mark_resource_error(
    db: &DbPool,
    node_id: i64,
    node: &NodeRecord,
    message: &str,
) -> Result<(), String> {
    update_resource_processing_stage(db, node_id, ResourceProcessingStage::Done)
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

async fn ensure_python_ready(python: &PythonSidecar) -> Result<(), String> {
    if python.check_health().await.is_ok() {
        return Ok(());
    }
    python.wait_for_health(2).await
}

async fn get_processing_provider_model(
    ai_config: &Arc<Mutex<AIConfigService>>,
) -> Result<(String, String), String> {
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
        .ok_or_else(|| format!("provider {provider} not configured"))?;
    if provider_config.api_key.is_empty() {
        return Err(format!("provider {provider} missing api key"));
    }
    if !provider_config.enabled {
        return Err(format!("provider {provider} is disabled"));
    }

    Ok((provider, model))
}

async fn request_summary(
    python: &PythonSidecar,
    provider: &str,
    model: &str,
    content: &str,
    user_note: Option<&str>,
) -> Result<String, String> {
    let url = format!("{}/agent/summary", python.get_base_url());
    let request = SummaryRequest {
        provider,
        model,
        content,
        user_note,
        max_length: SUMMARY_MAX_LENGTH,
    };

    let response = python
        .client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("summary request failed: {e}"))?
        // 将 HTTP 协议层面的“业务失败”（状态码 400-599）强制转换为 Rust 代码层面的 Result::Err
        .error_for_status()
        .map_err(|e| format!("summary request failed: {e}"))?
        // 读取字节流
        // 解析JSON
        // 匹配字段
        // 构造SummaryResponse
        .json::<SummaryResponse>()
        .await
        .map_err(|e| format!("summary response invalid: {e}"))?;

    Ok(response.summary)
}

async fn request_embed(
    python: &PythonSidecar,
    node_id: i64,
    embedding_type: EmbeddingType,
    text: &str,
    chunk: bool,
) -> Result<EmbedResponse, String> {
    let url = format!("{}/agent/embedding", python.get_base_url());
    let request = EmbedRequest {
        node_id,
        text,
        embedding_type,
        replace: true,
        chunk,
    };

    python
        .client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("embedding request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("embedding request failed: {e}"))?
        .json::<EmbedResponse>()
        .await
        .map_err(|e| format!("embedding response invalid: {e}"))
}

async fn request_delete_embedding(
    python: &PythonSidecar,
    node_id: i64,
    embedding_type: EmbeddingType,
) -> Result<(), String> {
    let url = format!("{}/agent/embedding/delete", python.get_base_url());
    let request = DeleteEmbeddingRequest {
        node_id,
        embedding_type,
    };

    python
        .client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("embedding delete failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("embedding delete failed: {e}"))?;

    Ok(())
}

async fn request_classify(
    python: &PythonSidecar,
    provider: &str,
    model: &str,
    summary: &str,
    candidates: Vec<TopicCandidate>,
) -> Result<ClassifyTopicResponse, String> {
    let url = format!("{}/agent/classify", python.get_base_url());
    let request = ClassifyTopicRequest {
        provider: provider.to_string(),
        model: model.to_string(),
        resource_summary: summary.to_string(),
        candidates,
    };

    python
        .client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("classify request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("classify request failed: {e}"))?
        .json::<ClassifyTopicResponse>()
        .await
        .map_err(|e| format!("classify response invalid: {e}"))
}

#[derive(Debug, Serialize)]
struct SummaryRequest<'a> {
    provider: &'a str,
    model: &'a str,
    content: &'a str,
    user_note: Option<&'a str>,
    max_length: i32,
}

#[derive(Debug, Deserialize)]
struct SummaryResponse {
    summary: String,
}

#[derive(Debug, Serialize)]
struct EmbedRequest<'a> {
    node_id: i64,
    text: &'a str,
    embedding_type: EmbeddingType,
    replace: bool,
    chunk: bool,
}

#[derive(Debug, Serialize)]
struct DeleteEmbeddingRequest {
    node_id: i64,
    embedding_type: EmbeddingType,
}

#[derive(Debug, Deserialize)]
struct EmbedResponse {
    node_id: i64,
    embedding_type: EmbeddingType,
    chunks: Vec<EmbedChunkResult>,
    dense_embedding_model: Option<String>,
    sparse_embedding_model: Option<String>,
}

#[derive(Debug, Serialize)]
struct TopicCandidate {
    title: String,
    summary: Option<String>,
}

#[derive(Debug, Serialize)]
struct ClassifyTopicRequest {
    provider: String,
    model: String,
    resource_summary: String,
    candidates: Vec<TopicCandidate>,
}

#[derive(Debug, Deserialize)]
struct ClassifyTopicResponse {
    topic_name: String,
    confidence: f64,
}
