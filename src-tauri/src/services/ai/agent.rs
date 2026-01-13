use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::services::ProviderConfig;

use super::llm::LlmService;
use super::types::{ClassifyTopicResponse, CreateNewPayload, NewTopicPayload, TopicCandidate};
pub struct AgentService {
    llm: Arc<LlmService>,
}

impl AgentService {
    pub fn new(llm: Arc<LlmService>) -> Self {
        Self { llm }
    }

    pub async fn summarize(
        &self,
        provider: &str,
        model: &str,
        provider_config: &ProviderConfig,
        content: &str,
        user_note: Option<&str>,
        min_length: i32,
        max_length: i32,
        file_path: Option<&str>,
        resource_subtype: Option<&str>,
    ) -> Result<String, String> {
        let content = content.trim();
        let max_length = std::cmp::max(min_length, max_length);
        let should_use_file = file_path.is_some() && resource_subtype != Some("text");

        let prompt = build_summary_prompt(content, user_note, max_length, should_use_file);
        let schema = summary_schema();

        let response = if should_use_file {
            match self
                .llm
                .generate_structured_json(
                    provider,
                    model,
                    provider_config,
                    &prompt,
                    schema.clone(),
                    file_path,
                    None,
                )
                .await
            {
                Ok(result) => result,
                Err(err) => {
                    if content.is_empty() {
                        return Err(format!(
                            "file upload failed and no content fallback: {err}"
                        ));
                    }
                    let fallback_prompt = build_summary_prompt(content, user_note, max_length, false);
                    self.llm
                        .generate_structured_json(
                            provider,
                            model,
                            provider_config,
                            &fallback_prompt,
                            schema,
                            None,
                            None,
                        )
                        .await
                        .map_err(|e| format!("summary fallback failed: {e}"))?
                }
            }
        } else {
            if content.is_empty() {
                return Ok(String::new());
            }
            self.llm
                .generate_structured_json(
                    provider,
                    model,
                    provider_config,
                    &prompt,
                    schema,
                    None,
                    None,
                )
                .await
                .map_err(|e| format!("summary request failed: {e}"))?
        };

        let summary: SummaryResponse = serde_json::from_str(&response)
            .map_err(|e| format!("summary parse failed: {e}"))?;
        let trimmed = summary.summary.trim();
        let mut result = trimmed.to_string();
        if result.chars().count() > max_length as usize {
            result = result.chars().take(max_length as usize).collect();
        }
        Ok(result)
    }

    pub async fn classify_topic(
        &self,
        provider: &str,
        model: &str,
        provider_config: &ProviderConfig,
        resource_summary: &str,
        candidates: Vec<TopicCandidate>,
    ) -> Result<ClassifyTopicResponse, String> {
        let summary = resource_summary.trim();
        if summary.is_empty() {
            return Ok(ClassifyTopicResponse::CreateNew {
                payload: CreateNewPayload {
                    new_topic: NewTopicPayload {
                        title: "未分类".to_string(),
                        summary: Some(String::new()),
                    },
                    parent_topic_id: None,
                },
                confidence_score: 0.0,
            });
        }

        let prompt = build_classify_prompt(summary, &candidates);
        let schema = classify_schema();

        let response = self
            .llm
            .generate_structured_json(
                provider,
                model,
                provider_config,
                &prompt,
                schema,
                None,
                None,
            )
            .await
            .map_err(|e| format!("classify request failed: {e}"))?;

        let parsed: ClassifyTopicResponse = serde_json::from_str(&response)
            .map_err(|e| format!("classify parse failed: {e}"))?;

        Ok(clamp_confidence(parsed))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SummaryResponse {
    summary: String,
}

fn build_summary_prompt(
    content: &str,
    user_note: Option<&str>,
    max_length: i32,
    use_file: bool,
) -> String {
    let mut lines = vec![
        "你是知识库助手，请根据用户提供的内容生成简洁摘要。".to_string(),
        String::new(),
        format!("请生成不超过 {} 字的中文摘要。", max_length),
    ];
    if let Some(note) = user_note {
        if !note.trim().is_empty() {
            lines.push(format!(
                "注意：必须围绕用户备注的意图来总结。用户备注：{}",
                note.trim()
            ));
        }
    }
    if !use_file && !content.is_empty() {
        lines.push(format!("内容：{}", content));
    }
    lines.join("\n")
}

fn summary_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "生成的摘要文本"
            }
        },
        "required": ["summary"]
    })
}

fn build_classify_prompt(summary: &str, candidates: &[TopicCandidate]) -> String {
    let mut lines = vec![
        "你是知识库主题分类助手，根据候选主题判断归属或创建新主题，必要时重构层级。"
            .to_string(),
        String::new(),
        format!("新资源摘要: \"{}\"", summary),
        String::new(),
        "候选主题 (node_id, title, summary, parents):".to_string(),
    ];

    if candidates.is_empty() {
        lines.push("（无）".to_string());
    } else {
        for (idx, candidate) in candidates.iter().enumerate() {
            let parent_info = if candidate.parents.is_empty() {
                "None".to_string()
            } else {
                candidate
                    .parents
                    .iter()
                    .map(|parent| format!("{}:{}", parent.node_id, parent.title))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            lines.push(format!(
                "{}. [{}] {} - {} | parents: {}",
                idx + 1,
                candidate.node_id,
                candidate.title,
                candidate.summary.as_deref().unwrap_or(""),
                parent_info
            ));
        }
    }

    lines.push(String::new());
    lines.push("任务：选择一种 action 并返回结构化 JSON：".to_string());
    lines.push("1) assign: 资源属于现有主题，payload.target_topic_id 为 node_id。".to_string());
    lines.push(
        "2) create_new: 现有主题都不合适，payload.new_topic 填写 title/summary，可选 parent_topic_id。"
            .to_string(),
    );
    lines.push(
        "3) restructure: 需要重构层级，可修改已有主题，创建新父主题，并 reparent。"
            .to_string(),
    );

    lines.join("\n")
}

fn classify_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["assign", "create_new", "restructure"]
            },
            "payload": {
                "type": "object",
                "properties": {
                    "target_topic_id": { "type": "integer" },
                    "new_topic": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "summary": { "type": ["string", "null"] }
                        },
                        "required": ["title"]
                    },
                    "parent_topic_id": { "type": ["integer", "null"] },
                    "topics_to_revise": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "topic_id": { "type": "integer" },
                                "new_title": { "type": ["string", "null"] },
                                "new_summary": { "type": ["string", "null"] }
                            },
                            "required": ["topic_id"]
                        }
                    },
                    "new_parent_topic": {
                        "type": ["object", "null"],
                        "properties": {
                            "title": { "type": "string" },
                            "summary": { "type": ["string", "null"] }
                        },
                        "required": ["title"]
                    },
                    "reparent_target_ids": {
                        "type": "array",
                        "items": { "type": "integer" }
                    },
                    "assign_current_resource_to_parent": { "type": ["boolean", "null"] }
                }
            },
            "confidence_score": { "type": "number" }
        },
        "required": ["action", "payload", "confidence_score"]
    })
}

fn clamp_confidence(response: ClassifyTopicResponse) -> ClassifyTopicResponse {
    let clamp = |value: f64| value.max(0.0).min(1.0);
    match response {
        ClassifyTopicResponse::Assign {
            payload,
            confidence_score,
        } => ClassifyTopicResponse::Assign {
            payload,
            confidence_score: clamp(confidence_score),
        },
        ClassifyTopicResponse::CreateNew {
            payload,
            confidence_score,
        } => ClassifyTopicResponse::CreateNew {
            payload,
            confidence_score: clamp(confidence_score),
        },
        ClassifyTopicResponse::Restructure {
            payload,
            confidence_score,
        } => ClassifyTopicResponse::Restructure {
            payload,
            confidence_score: clamp(confidence_score),
        },
    }
}
