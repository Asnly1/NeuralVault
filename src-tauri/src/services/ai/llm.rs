use std::path::Path;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use crate::services::ProviderConfig;

use super::types::{ChatMessage, ChatRole, ChatStreamEvent, ChatUsage};

const DEFAULT_GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com";

pub struct LlmService {
    client: Client,
}

impl LlmService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn stream_chat<F, Fut>(
        &self,
        provider: &str,
        model: &str,
        provider_config: &ProviderConfig,
        messages: &[ChatMessage],
        thinking_effort: Option<&str>,
        mut on_event: F,
    ) -> Result<(), String>
    where
        F: FnMut(ChatStreamEvent) -> Fut,
        Fut: std::future::Future<Output = Result<(), String>>,
    {
        let provider = provider.to_lowercase();
        if provider != "gemini" && provider != "google" {
            return Err(format!("provider {provider} not supported"));
        }

        let api_key = provider_config.api_key.trim();
        if api_key.is_empty() {
            return Err("missing api key".to_string());
        }

        let base_url = build_base_url(provider_config.base_url.as_deref());

        let mut contents: Vec<GeminiContent> = Vec::new();
        for message in messages {
            let role = match message.role {
                ChatRole::User => "user",
                ChatRole::Assistant => "model",
                ChatRole::System => "user",
            };

            let mut parts: Vec<GeminiPart> = Vec::new();
            for file_path in &message.files {
                let file_data = self.upload_file(&base_url, api_key, file_path).await?;
                parts.push(GeminiPart::file(file_data));
            }
            for image_path in &message.images {
                let file_data = self.upload_file(&base_url, api_key, image_path).await?;
                parts.push(GeminiPart::file(file_data));
            }
            if !message.content.trim().is_empty() {
                parts.push(GeminiPart::text(message.content.clone()));
            }

            if !parts.is_empty() {
                contents.push(GeminiContent {
                    role: role.to_string(),
                    parts,
                });
            }
        }

        if contents.is_empty() {
            return Err("no messages to send".to_string());
        }

        let generation_config = build_thinking_config(thinking_effort, true).map(|thinking_config| {
            GeminiGenerationConfig {
                response_mime_type: None,
                response_json_schema: None,
                thinking_config: Some(thinking_config),
            }
        });
        let request = GeminiGenerateRequest {
            contents,
            generation_config,
        };

        let url = format!(
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
            base_url, model
        );

        let response = self
            .client
            .post(url)
            .header("x-goog-api-key", api_key)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("gemini stream request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("gemini stream request failed: {status} {body}"));
        }

        let mut stream = response.bytes_stream();
        let mut buffer: Vec<u8> = Vec::new();
        let mut answer_text = String::new();
        let mut thinking_text = String::new();
        let mut usage: Option<ChatUsage> = None;

        while let Some(chunk_result) = stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("gemini stream read error: {e}"))?;
            buffer.extend_from_slice(&bytes);

            while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer[..pos].to_vec();
                buffer.drain(..pos + 1);
                let line = String::from_utf8_lossy(&line_bytes).trim().to_string();

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                let data = if let Some(stripped) = line.strip_prefix("data:") {
                    stripped.trim()
                } else {
                    line.trim()
                };

                if data.is_empty() || data == "[DONE]" {
                    continue;
                }

                let chunk: GeminiStreamResponse = serde_json::from_str(data)
                    .map_err(|e| format!("gemini stream payload invalid: {e}"))?;

                if let Some(metadata) = chunk.usage_metadata {
                    if let (Some(input), Some(output), Some(total)) = (
                        metadata.prompt_token_count,
                        metadata.candidates_token_count,
                        metadata.total_token_count,
                    ) {
                        usage = Some(ChatUsage {
                            input_tokens: input,
                            output_tokens: output,
                            reasoning_tokens: metadata.thoughts_token_count.unwrap_or(0),
                            total_tokens: total,
                        });
                    }
                }

                if let Some(candidates) = chunk.candidates {
                    if let Some(candidate) = candidates.first() {
                        if let Some(content) = candidate.content.as_ref() {
                            for part in &content.parts {
                                if let Some(text) = part.text.as_ref() {
                                    if part.thought {
                                        thinking_text.push_str(text);
                                        on_event(ChatStreamEvent::ThinkingDelta(text.clone())).await?;
                                    } else {
                                        answer_text.push_str(text);
                                        on_event(ChatStreamEvent::AnswerDelta(text.clone())).await?;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if !answer_text.is_empty() {
            on_event(ChatStreamEvent::AnswerFullText(answer_text)).await?;
        }
        if !thinking_text.is_empty() {
            on_event(ChatStreamEvent::ThinkingFullText(thinking_text)).await?;
        }
        if let Some(usage) = usage {
            on_event(ChatStreamEvent::Usage(usage)).await?;
        }

        Ok(())
    }

    pub async fn generate_structured_json(
        &self,
        provider: &str,
        model: &str,
        provider_config: &ProviderConfig,
        prompt: &str,
        schema: serde_json::Value,
        file_path: Option<&str>,
        thinking_effort: Option<&str>,
    ) -> Result<String, String> {
        let provider = provider.to_lowercase();
        if provider != "gemini" && provider != "google" {
            return Err(format!("provider {provider} not supported"));
        }

        let api_key = provider_config.api_key.trim();
        if api_key.is_empty() {
            return Err("missing api key".to_string());
        }

        let base_url = build_base_url(provider_config.base_url.as_deref());

        let mut parts = Vec::new();
        if let Some(path) = file_path {
            let file_data = self.upload_file(&base_url, api_key, path).await?;
            parts.push(GeminiPart::file(file_data));
        }
        parts.push(GeminiPart::text(prompt.to_string()));

        let contents = vec![GeminiContent {
            role: "user".to_string(),
            parts,
        }];

        let generation_config = GeminiGenerationConfig {
            response_mime_type: Some("application/json".to_string()),
            response_json_schema: Some(schema),
            thinking_config: build_thinking_config(thinking_effort, false),
        };

        let request = GeminiGenerateRequest {
            contents,
            generation_config: Some(generation_config),
        };

        let url = format!("{}/v1beta/models/{}:generateContent", base_url, model);
        let response = self
            .client
            .post(url)
            .header("x-goog-api-key", api_key)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("gemini request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("gemini request failed: {status} {body}"));
        }

        let response: GeminiGenerateResponse = response
            .json()
            .await
            .map_err(|e| format!("gemini response invalid: {e}"))?;

        let mut output = String::new();
        if let Some(candidate) = response.candidates.and_then(|mut list| list.pop()) {
            if let Some(content) = candidate.content {
                for part in content.parts {
                    if let Some(text) = part.text {
                        output.push_str(&text);
                    }
                }
            }
        }

        if output.trim().is_empty() {
            return Err("gemini response missing text".to_string());
        }

        Ok(output)
    }

    async fn upload_file(
        &self,
        base_url: &str,
        api_key: &str,
        file_path: &str,
    ) -> Result<GeminiFileData, String> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(format!("file not found: {file_path}"));
        }

        let bytes = std::fs::read(path).map_err(|e| format!("read file failed: {e}"))?;
        let num_bytes = bytes.len();
        let mime_type = guess_mime_type(file_path);
        let display_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file");

        let start_request = serde_json::json!({
            "file": {
                "display_name": display_name,
            }
        });

        let start_response = self
            .client
            .post(format!("{}/upload/v1beta/files", base_url))
            .header("x-goog-api-key", api_key)
            .header("X-Goog-Upload-Protocol", "resumable")
            .header("X-Goog-Upload-Command", "start")
            .header("X-Goog-Upload-Header-Content-Length", num_bytes.to_string())
            .header("X-Goog-Upload-Header-Content-Type", mime_type.as_str())
            .header("content-type", "application/json")
            .json(&start_request)
            .send()
            .await
            .map_err(|e| format!("gemini upload start failed: {e}"))?;

        if !start_response.status().is_success() {
            let status = start_response.status();
            let body = start_response.text().await.unwrap_or_default();
            return Err(format!("gemini upload start failed: {status} {body}"));
        }

        let upload_url = start_response
            .headers()
            .get("x-goog-upload-url")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| "gemini upload missing upload url".to_string())?
            .to_string();

        let upload_response = self
            .client
            .post(upload_url)
            .header("x-goog-api-key", api_key)
            .header("X-Goog-Upload-Offset", "0")
            .header("X-Goog-Upload-Command", "upload, finalize")
            .header("content-length", num_bytes.to_string())
            .body(bytes)
            .send()
            .await
            .map_err(|e| format!("gemini upload failed: {e}"))?;

        if !upload_response.status().is_success() {
            let status = upload_response.status();
            let body = upload_response.text().await.unwrap_or_default();
            return Err(format!("gemini upload failed: {status} {body}"));
        }

        let upload_info: GeminiUploadResponse = upload_response
            .json()
            .await
            .map_err(|e| format!("gemini upload response invalid: {e}"))?;

        let mut file = upload_info.file;
        if file.state.as_deref() != Some("ACTIVE") {
            file = self
                .wait_for_file_active(base_url, api_key, &file.name)
                .await?;
        }

        let final_mime = file
            .mime_type
            .clone()
            .unwrap_or_else(|| mime_type.clone());

        Ok(GeminiFileData {
            file_uri: file.uri,
            mime_type: final_mime,
        })
    }

    async fn wait_for_file_active(
        &self,
        base_url: &str,
        api_key: &str,
        file_name: &str,
    ) -> Result<GeminiFileRecord, String> {
        let url = format!("{}/v1beta/files/{}", base_url, file_name);

        for _ in 0..40 {
            let response = self
                .client
                .get(&url)
                .header("x-goog-api-key", api_key)
                .send()
                .await
                .map_err(|e| format!("gemini get file failed: {e}"))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("gemini get file failed: {status} {body}"));
            }

            let info: GeminiUploadResponse = response
                .json()
                .await
                .map_err(|e| format!("gemini file response invalid: {e}"))?;
            let file = info.file;
            match file.state.as_deref() {
                Some("ACTIVE") => return Ok(file),
                Some("FAILED") => {
                    return Err(format!("gemini file processing failed: {file_name}"));
                }
                _ => {
                    sleep(Duration::from_millis(500)).await;
                }
            }
        }

        Err(format!("gemini file processing timeout: {file_name}"))
    }
}

fn build_base_url(base_url: Option<&str>) -> String {
    let base = base_url
        .unwrap_or(DEFAULT_GEMINI_BASE_URL)
        .trim()
        .trim_end_matches('/');
    if base.is_empty() {
        DEFAULT_GEMINI_BASE_URL.to_string()
    } else {
        base.to_string()
    }
}

fn guess_mime_type(path: &str) -> String {
    let ext = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "html" | "htm" => "text/html",
        "xml" => "application/xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    };

    mime.to_string()
}

fn build_thinking_config(
    thinking_effort: Option<&str>,
    include_thoughts: bool,
) -> Option<GeminiThinkingConfig> {
    let effort = thinking_effort?.trim();
    if effort.is_empty() {
        return None;
    }

    Some(GeminiThinkingConfig {
        thinking_level: effort.to_string(),
        include_thoughts: if include_thoughts { Some(true) } else { None },
    })
}

#[derive(Serialize)]
struct GeminiGenerateRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Serialize, Clone)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_data: Option<GeminiFileData>,
}

impl GeminiPart {
    fn text(text: String) -> Self {
        Self {
            text: Some(text),
            file_data: None,
        }
    }

    fn file(file_data: GeminiFileData) -> Self {
        Self {
            text: None,
            file_data: Some(file_data),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
struct GeminiFileData {
    file_uri: String,
    mime_type: String,
}

#[derive(Serialize, Clone)]
struct GeminiGenerationConfig {
    #[serde(rename = "responseMimeType", skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
    #[serde(rename = "responseJsonSchema", skip_serializing_if = "Option::is_none")]
    response_json_schema: Option<serde_json::Value>,
    #[serde(rename = "thinkingConfig", skip_serializing_if = "Option::is_none")]
    thinking_config: Option<GeminiThinkingConfig>,
}

#[derive(Serialize, Clone)]
struct GeminiThinkingConfig {
    #[serde(rename = "thinkingLevel")]
    thinking_level: String,
    #[serde(rename = "includeThoughts", skip_serializing_if = "Option::is_none")]
    include_thoughts: Option<bool>,
}

#[derive(Deserialize)]
struct GeminiUploadResponse {
    file: GeminiFileRecord,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiFileRecord {
    name: String,
    uri: String,
    mime_type: Option<String>,
    state: Option<String>,
}

#[derive(Deserialize)]
struct GeminiGenerateResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiResponseContent>,
}

#[derive(Deserialize)]
struct GeminiResponseContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponsePart {
    text: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiStreamResponse {
    candidates: Option<Vec<GeminiStreamCandidate>>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Deserialize)]
struct GeminiStreamCandidate {
    content: Option<GeminiStreamContent>,
}

#[derive(Deserialize)]
struct GeminiStreamContent {
    parts: Vec<GeminiStreamPart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiStreamPart {
    text: Option<String>,
    #[serde(default)]
    thought: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    prompt_token_count: Option<i64>,
    candidates_token_count: Option<i64>,
    thoughts_token_count: Option<i64>,
    total_token_count: Option<i64>,
}
