use crate::db::DbPool;
use crate::sidecar::PythonSidecar;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub python: Arc<PythonSidecar>,
}
