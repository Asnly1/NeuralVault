use crate::db::DbPool;
use crate::services::AIConfigService;
use crate::sidecar::PythonSidecar;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub python: Arc<PythonSidecar>,
    pub ai_config: Arc<Mutex<AIConfigService>>,
}
