//! Node Builder 模式
//!
//! 提供链式 API 简化节点创建

use sqlx::types::Json;
use uuid::Uuid;

use crate::db::{
    insert_node, DbPool, NewNode, NodeType, ResourceEmbeddingStatus, ResourceProcessingStage,
    ResourceSubtype, ReviewStatus, SourceMeta, TaskPriority, TaskStatus,
};

pub struct NodeBuilder {
    uuid: String,
    user_id: i64,
    title: String,
    summary: Option<String>,
    node_type: NodeType,
    task_status: Option<TaskStatus>,
    priority: Option<TaskPriority>,
    due_date: Option<String>,
    done_date: Option<String>,
    file_hash: Option<String>,
    file_path: Option<String>,
    file_content: Option<String>,
    user_note: Option<String>,
    resource_subtype: Option<ResourceSubtype>,
    source_meta: Option<SourceMeta>,
    embedded_hash: Option<String>,
    processing_hash: Option<String>,
    embedding_status: ResourceEmbeddingStatus,
    last_embedding_at: Option<String>,
    last_embedding_error: Option<String>,
    processing_stage: ResourceProcessingStage,
    review_status: ReviewStatus,
}

impl NodeBuilder {
    /// 创建资源节点 Builder
    pub fn resource() -> Self {
        Self::new(NodeType::Resource)
            .with_review_status(ReviewStatus::Unreviewed)
    }

    /// 创建任务节点 Builder
    pub fn task() -> Self {
        Self::new(NodeType::Task)
            .with_task_status(TaskStatus::Todo)
            .with_priority(TaskPriority::Medium)
            .with_review_status(ReviewStatus::Reviewed)
    }

    /// 创建主题节点 Builder
    pub fn topic() -> Self {
        Self::new(NodeType::Topic)
            .with_review_status(ReviewStatus::Reviewed)
    }

    fn new(node_type: NodeType) -> Self {
        Self {
            uuid: Uuid::new_v4().to_string(),
            user_id: 1,
            title: String::new(),
            summary: None,
            node_type,
            task_status: None,
            priority: None,
            due_date: None,
            done_date: None,
            file_hash: None,
            file_path: None,
            file_content: None,
            user_note: None,
            resource_subtype: None,
            source_meta: None,
            embedded_hash: None,
            processing_hash: None,
            embedding_status: ResourceEmbeddingStatus::Pending,
            last_embedding_at: None,
            last_embedding_error: None,
            processing_stage: ResourceProcessingStage::Todo,
            review_status: ReviewStatus::Unreviewed,
        }
    }

    // ========== 基础字段 ==========

    /// 设置标题
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = title.into();
        self
    }

    /// 设置摘要
    pub fn summary(mut self, summary: Option<impl Into<String>>) -> Self {
        self.summary = summary.map(|s| s.into());
        self
    }

    /// 设置用户 ID
    pub fn user_id(mut self, user_id: i64) -> Self {
        self.user_id = user_id;
        self
    }

    /// 设置 UUID（通常由 Builder 自动生成）
    pub fn uuid(mut self, uuid: impl Into<String>) -> Self {
        self.uuid = uuid.into();
        self
    }

    // ========== 任务相关字段 ==========

    /// 设置任务状态
    pub fn task_status(mut self, status: Option<TaskStatus>) -> Self {
        self.task_status = status;
        self
    }

    fn with_task_status(mut self, status: TaskStatus) -> Self {
        self.task_status = Some(status);
        self
    }

    /// 设置优先级
    pub fn priority(mut self, priority: Option<TaskPriority>) -> Self {
        self.priority = priority;
        self
    }

    fn with_priority(mut self, priority: TaskPriority) -> Self {
        self.priority = Some(priority);
        self
    }

    /// 设置截止日期
    pub fn due_date(mut self, due_date: Option<impl Into<String>>) -> Self {
        self.due_date = due_date.map(|s| s.into());
        self
    }

    /// 设置完成日期
    pub fn done_date(mut self, done_date: Option<impl Into<String>>) -> Self {
        self.done_date = done_date.map(|s| s.into());
        self
    }

    // ========== 资源相关字段 ==========

    /// 设置文件哈希
    pub fn file_hash(mut self, hash: Option<impl Into<String>>) -> Self {
        self.file_hash = hash.map(|s| s.into());
        self
    }

    /// 设置文件路径
    pub fn file_path(mut self, path: Option<impl Into<String>>) -> Self {
        self.file_path = path.map(|s| s.into());
        self
    }

    /// 设置文件内容
    pub fn file_content(mut self, content: Option<impl Into<String>>) -> Self {
        self.file_content = content.map(|s| s.into());
        self
    }

    /// 设置用户备注
    pub fn user_note(mut self, note: Option<impl Into<String>>) -> Self {
        self.user_note = note.map(|s| s.into());
        self
    }

    /// 设置资源子类型
    pub fn resource_subtype(mut self, subtype: Option<ResourceSubtype>) -> Self {
        self.resource_subtype = subtype;
        self
    }

    /// 设置资源来源元数据
    pub fn source_meta(mut self, meta: Option<SourceMeta>) -> Self {
        self.source_meta = meta;
        self
    }

    // ========== 嵌入相关字段 ==========

    /// 设置已嵌入的内容哈希
    pub fn embedded_hash(mut self, hash: Option<impl Into<String>>) -> Self {
        self.embedded_hash = hash.map(|s| s.into());
        self
    }

    /// 设置正在处理的内容哈希
    pub fn processing_hash(mut self, hash: Option<impl Into<String>>) -> Self {
        self.processing_hash = hash.map(|s| s.into());
        self
    }

    /// 设置嵌入状态
    pub fn embedding_status(mut self, status: ResourceEmbeddingStatus) -> Self {
        self.embedding_status = status;
        self
    }

    /// 设置最后嵌入时间
    pub fn last_embedding_at(mut self, at: Option<impl Into<String>>) -> Self {
        self.last_embedding_at = at.map(|s| s.into());
        self
    }

    /// 设置最后嵌入错误
    pub fn last_embedding_error(mut self, error: Option<impl Into<String>>) -> Self {
        self.last_embedding_error = error.map(|s| s.into());
        self
    }

    /// 设置处理阶段
    pub fn processing_stage(mut self, stage: ResourceProcessingStage) -> Self {
        self.processing_stage = stage;
        self
    }

    // ========== 审核状态 ==========

    /// 设置审核状态
    pub fn review_status(mut self, status: ReviewStatus) -> Self {
        self.review_status = status;
        self
    }

    fn with_review_status(mut self, status: ReviewStatus) -> Self {
        self.review_status = status;
        self
    }

    // ========== 构建方法 ==========

    /// 获取生成的 UUID
    pub fn get_uuid(&self) -> &str {
        &self.uuid
    }

    /// 构建 NewNode（不插入数据库）
    pub fn build(&self) -> NewNode<'_> {
        NewNode {
            uuid: &self.uuid,
            user_id: self.user_id,
            title: &self.title,
            summary: self.summary.as_deref(),
            node_type: self.node_type,
            task_status: self.task_status,
            priority: self.priority,
            due_date: self.due_date.as_deref(),
            done_date: self.done_date.as_deref(),
            file_hash: self.file_hash.as_deref(),
            file_path: self.file_path.as_deref(),
            file_content: self.file_content.as_deref(),
            user_note: self.user_note.as_deref(),
            resource_subtype: self.resource_subtype,
            source_meta: self.source_meta.as_ref().map(|m| Json(m.clone())),
            embedded_hash: self.embedded_hash.as_deref(),
            processing_hash: self.processing_hash.as_deref(),
            embedding_status: self.embedding_status,
            last_embedding_at: self.last_embedding_at.as_deref(),
            last_embedding_error: self.last_embedding_error.as_deref(),
            processing_stage: self.processing_stage,
            review_status: self.review_status,
        }
    }

    /// 插入到数据库并返回 node_id
    pub async fn insert(self, pool: &DbPool) -> Result<i64, sqlx::Error> {
        let new_node = self.build();
        insert_node(pool, new_node).await
    }

    /// 插入到数据库并返回 (node_id, uuid)
    pub async fn insert_with_uuid(self, pool: &DbPool) -> Result<(i64, String), sqlx::Error> {
        let uuid = self.uuid.clone();
        let node_id = self.insert(pool).await?;
        Ok((node_id, uuid))
    }
}

