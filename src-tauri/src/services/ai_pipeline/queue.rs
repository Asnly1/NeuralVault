//! Pipeline job queue management

use std::collections::HashSet;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use super::processor::process_resource_job;
use super::AI_QUEUE_BUFFER;
use crate::db::{list_resources_for_requeue, DbPool};
use crate::services::{AiServices, AiServicesHandle, AIConfigService};

#[derive(Debug)]
pub(crate) struct AiPipelineJob {
    pub node_id: i64,
}

#[derive(Clone)]
pub struct AiPipeline {
    sender: mpsc::Sender<AiPipelineJob>,
    inflight: Arc<Mutex<HashSet<i64>>>,
}

impl AiPipeline {
    pub fn new(
        db: DbPool,
        ai: AiServicesHandle,
        ai_config: Arc<Mutex<AIConfigService>>,
        app_data_dir: std::path::PathBuf,
        app_handle: AppHandle,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(AI_QUEUE_BUFFER);
        let inflight = Arc::new(Mutex::new(HashSet::new()));
        let inflight_worker = inflight.clone();
        let app_handle = app_handle.clone();

        tauri::async_runtime::spawn(async move {
            let ai_services = match ai.wait_ready().await {
                Ok(services) => services,
                Err(err) => {
                    tracing::error!(
                        error = %err,
                        "AI services init failed; pipeline stopped"
                    );
                    return;
                }
            };
            run_pipeline(
                receiver,
                inflight_worker,
                db,
                ai_services,
                ai_config,
                app_data_dir,
                app_handle,
            )
            .await;
        });

        Self { sender, inflight }
    }

    pub async fn enqueue_resource(&self, node_id: i64) -> Result<(), String> {
        {
            let mut inflight = self.inflight.lock().await;
            if inflight.contains(&node_id) {
                tracing::debug!(node_id, "AiPipeline job already inflight");
                return Ok(());
            }
            inflight.insert(node_id);
        }

        self.sender
            .send(AiPipelineJob { node_id })
            .await
            .map_err(|_| "AI pipeline stopped".to_string())?;

        tracing::debug!(node_id, "AiPipeline job enqueued");
        Ok(())
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
    app_handle: AppHandle,
) {
    let mut is_processing = false;
    while let Some(job) = receiver.recv().await {
        if !is_processing {
            is_processing = true;
            emit_embedding_status(&app_handle, "processing");
        }

        if let Err(err) =
            process_resource_job(&db, &ai, &ai_config, &app_data_dir, job.node_id).await
        {
            tracing::error!(
                node_id = job.node_id,
                error = %err,
                "AiPipeline job failed"
            );
        }

        let mut inflight = inflight.lock().await;
        inflight.remove(&job.node_id);

        if receiver.is_empty() && is_processing {
            is_processing = false;
            emit_embedding_status(&app_handle, "idle");
        }
    }

    if is_processing {
        emit_embedding_status(&app_handle, "idle");
    }
}

#[derive(Debug, Serialize)]
struct EmbeddingStatusPayload {
    status: String,
}

fn emit_embedding_status(app_handle: &AppHandle, status: &str) {
    let payload = EmbeddingStatusPayload {
        status: status.to_string(),
    };
    let _ = app_handle.emit("embedding-status", payload);
}
