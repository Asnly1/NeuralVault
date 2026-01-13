use crate::db::DbPool;
use crate::services::{AIConfigService, AiPipeline, AiServices};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub ai: Arc<AiServices>,
    pub ai_config: Arc<Mutex<AIConfigService>>,
    pub ai_pipeline: Arc<AiPipeline>,
}
