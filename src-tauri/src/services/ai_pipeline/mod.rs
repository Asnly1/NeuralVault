//! AI processing pipeline
//!
//! Handles resource processing including summarization, embedding, and topic classification.
//!
//! Split into submodules:
//! - `queue`: Pipeline job queue management
//! - `processor`: Resource processing logic
//! - `classifier`: Topic classification logic

mod classifier;
mod processor;
mod queue;

pub use queue::AiPipeline;
pub(crate) use processor::get_processing_config;

// Constants
pub(crate) const AI_QUEUE_BUFFER: usize = 32;
pub(crate) const SUMMARY_MAX_LENGTH: i32 = 100;
pub(crate) const SUMMARY_MIN_LENGTH: i32 = 10;
pub(crate) const CLASSIFY_TOP_K: i32 = 10;
pub(crate) const CLASSIFY_SIMILARITY_THRESHOLD: f64 = 0.7;
pub(crate) const REVIEW_CONFIDENCE_THRESHOLD: f64 = 0.8;
pub(crate) const TOPIC_TITLE_SIMILARITY_THRESHOLD: f64 = 0.8;
