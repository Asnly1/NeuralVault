mod agent;
mod embedding;
mod llm;
mod search;
mod types;

use std::sync::Arc;

use tokio::sync::watch;

use crate::services::AIConfigService;

pub use agent::AgentService;
pub use embedding::EmbeddingService;
pub use llm::LlmService;
pub use search::SearchService;
pub use types::*;

#[derive(Clone)]
pub struct AiServices {
    pub embedding: Arc<EmbeddingService>,
    pub llm: Arc<LlmService>,
    pub agent: Arc<AgentService>,
    pub search: Arc<SearchService>,
}

impl AiServices {
    pub async fn new(config_service: &AIConfigService) -> Result<Self, String> {
        let vector_config = config_service.get_vector_config()?;
        let embedding = Arc::new(EmbeddingService::new(vector_config).await?);
        let llm = Arc::new(LlmService::new());
        let agent = Arc::new(AgentService::new(llm.clone()));
        let search = Arc::new(SearchService::new(embedding.clone()));

        Ok(Self {
            embedding,
            llm,
            agent,
            search,
        })
    }
}

#[derive(Clone)]
enum AiServicesStatus {
    Pending,
    Ready(Arc<AiServices>),
    Error(String),
}

#[derive(Clone)]
pub struct AiServicesHandle {
    sender: watch::Sender<AiServicesStatus>,
}

impl AiServicesHandle {
    pub fn new_pending() -> Self {
        let (sender, _receiver) = watch::channel(AiServicesStatus::Pending);
        Self { sender }
    }

    pub fn set_ready(&self, services: Arc<AiServices>) {
        let _ = self.sender.send(AiServicesStatus::Ready(services));
    }

    pub fn set_error(&self, error: String) {
        let _ = self.sender.send(AiServicesStatus::Error(error));
    }

    pub async fn wait_ready(&self) -> Result<Arc<AiServices>, String> {
        let mut receiver = self.sender.subscribe();
        loop {
            let status = receiver.borrow().clone();
            match status {
                AiServicesStatus::Ready(services) => return Ok(services),
                AiServicesStatus::Error(err) => return Err(err),
                AiServicesStatus::Pending => receiver
                    .changed()
                    .await
                    .map_err(|_| "AI services init channel closed".to_string())?,
            }
        }
    }
}
