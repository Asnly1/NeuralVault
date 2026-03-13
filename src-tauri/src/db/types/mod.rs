//! 数据库类型模块
//!
//! 拆分为三个子模块：
//! - `enums`: 枚举类型（NodeType, TaskStatus 等）
//! - `records`: 记录类型（NodeRecord, EdgeRecord 等）
//! - `inputs`: 输入类型（NewNode, NewEdge 等）

mod enums;
mod inputs;
mod records;

use sqlx::{Pool, Sqlite};

/// 数据库连接池类型别名
pub type DbPool = Pool<Sqlite>;

/// 数据库迁移器
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

// 导出枚举类型
pub use enums::{
    BindingType, EdgeRelationType, EmbeddingType, NodeType, ResourceEmbeddingStatus,
    ResourceProcessingStage, ResourceSubtype, ReviewStatus, SessionType, TaskPriority, TaskStatus,
};

// 导出记录类型
pub use records::{
    ChatMessageRecord, ChatSessionRecord, EdgeRecord, NodeRecord, NodeRevisionLogRecord,
    SourceMeta,
};

// 导出输入类型
pub use inputs::{
    EmbedChunkResult, NewChatMessage, NewChatSession, NewEdge, NewMessageAttachment, NewNode,
    NewNodeRevisionLog,
};

