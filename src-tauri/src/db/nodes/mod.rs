//! Node database operations
//!
//! Split into submodules:
//! - `crud`: Basic CRUD operations (insert, get, update, delete)
//! - `status`: Status update operations (task status, processing stage, sync status)
//! - `query`: Query operations (list, search)

mod crud;
mod query;
mod status;

pub use crud::*;
pub use query::*;
pub use status::*;

/// Common fields for SELECT queries
pub(crate) const NODE_FIELDS: &str = "node_id, uuid, user_id, title, summary, node_type, task_status, priority, due_date, done_date, \
    file_hash, file_path, file_content, user_note, resource_subtype, source_meta, embedded_hash, processing_hash, embedding_status, \
    last_embedding_at, last_embedding_error, processing_stage, review_status, is_pinned, pinned_at, created_at, updated_at, is_deleted, deleted_at";
