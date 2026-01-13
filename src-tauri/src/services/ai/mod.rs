mod agent;
mod embedding;
mod llm;
mod search;
mod types;

use std::sync::Arc;

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
