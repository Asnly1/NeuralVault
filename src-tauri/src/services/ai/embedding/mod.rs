//! Embedding service for vector embeddings and search
//!
//! Split into submodules:
//! - `model`: EmbeddingService struct and embedding methods
//! - `store`: LanceDB storage operations

mod model;
mod store;

pub use model::{EmbeddingService, TextSegment};
pub use store::SearchResult;

// Column name constants (used by both model and store)
pub(crate) const VECTOR_KIND_TEXT: &str = "text";
pub(crate) const VECTOR_KIND_IMAGE: &str = "image";
pub(crate) const EMBEDDING_TYPE_TITLE: &str = "title";
pub(crate) const COLUMN_RELEVANCE_SCORE: &str = "_relevance_score";
pub(crate) const COLUMN_SCORE: &str = "_score";
pub(crate) const COLUMN_DISTANCE: &str = "_distance";

pub(crate) const COLUMN_VECTOR_ID: &str = "vector_id";
pub(crate) const COLUMN_NODE_ID: &str = "node_id";
pub(crate) const COLUMN_EMBEDDING_TYPE: &str = "embedding_type";
pub(crate) const COLUMN_VECTOR_KIND: &str = "vector_kind";
pub(crate) const COLUMN_EMBEDDING_MODEL: &str = "embedding_model";
pub(crate) const COLUMN_CHUNK_TEXT: &str = "chunk_text";
pub(crate) const COLUMN_CHUNK_INDEX: &str = "chunk_index";
pub(crate) const COLUMN_TOKEN_COUNT: &str = "token_count";
pub(crate) const COLUMN_EMBEDDING_HASH: &str = "embedding_hash";
pub(crate) const COLUMN_TEXT_VECTOR: &str = "text_vector";
pub(crate) const COLUMN_IMAGE_VECTOR: &str = "image_vector";
