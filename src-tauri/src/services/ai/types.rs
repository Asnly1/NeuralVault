use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub images: Vec<String>,
    pub files: Vec<String>,
}

impl ChatMessage {
    pub fn new(role: ChatRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            images: Vec::new(),
            files: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUsage {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone)]
pub enum ChatStreamEvent {
    AnswerDelta(String),
    ThinkingDelta(String),
    Usage(ChatUsage),
    Error(String),
    AnswerFullText(String),
    ThinkingFullText(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParentTopicCandidate {
    pub node_id: i64,
    pub title: String,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicCandidate {
    pub node_id: i64,
    pub title: String,
    pub summary: Option<String>,
    pub parents: Vec<ParentTopicCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTopicPayload {
    pub title: String,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignPayload {
    pub target_topic_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNewPayload {
    pub new_topic: NewTopicPayload,
    pub parent_topic_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicRevisionPayload {
    pub topic_id: i64,
    pub new_title: Option<String>,
    pub new_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestructurePayload {
    pub topics_to_revise: Vec<TopicRevisionPayload>,
    pub new_parent_topic: Option<NewTopicPayload>,
    pub reparent_target_ids: Vec<i64>,
    pub assign_current_resource_to_parent: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ClassifyTopicResponse {
    Assign {
        payload: AssignPayload,
        confidence_score: f64,
    },
    CreateNew {
        payload: CreateNewPayload,
        confidence_score: f64,
    },
    Restructure {
        payload: RestructurePayload,
        confidence_score: f64,
    },
}
