use crate::db::DbPool;
use crate::services::{AIConfigService, AiPipeline, AiServicesHandle};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub ai: AiServicesHandle,
    pub ai_config: Arc<Mutex<AIConfigService>>,
    pub ai_pipeline: Arc<AiPipeline>,
}
