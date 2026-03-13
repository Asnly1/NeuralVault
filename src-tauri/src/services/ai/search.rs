use std::sync::Arc;

use super::embedding::{EmbeddingService, SearchResult};

pub struct SearchService {
    embedding: Arc<EmbeddingService>,
}

impl SearchService {
    pub fn new(embedding: Arc<EmbeddingService>) -> Self {
        Self { embedding }
    }

    pub async fn search_hybrid(
        &self,
        query: &str,
        embedding_type: &str,
        node_ids: Option<&[i64]>,
        limit: u64,
    ) -> Result<Vec<SearchResult>, String> {
        self.embedding
            .search_hybrid(query, embedding_type, node_ids, limit)
            .await
    }
}
