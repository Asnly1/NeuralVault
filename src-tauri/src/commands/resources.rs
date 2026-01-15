//! 资源相关命令

use std::{fs, path::Path};

use active_win_pos_rs::get_active_window;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{
    app_state::AppState,
    db::{
        get_node_by_id, hard_delete_node, list_all_resources, soft_delete_node,
        update_node_content, update_node_summary, update_node_title, update_node_user_note,
        update_resource_sync_status, NodeBuilder, NodeRecord, ResourceEmbeddingStatus, SourceMeta,
    },
    error::AppError,
    services::parser::{build_text_title, parse_resource_content, ProgressCallback},
    utils::{compute_sha256, get_assets_dir, get_extension, parse_file_type, resolve_file_path, validate_title},
    AppResult,
};

use super::{CaptureRequest, CaptureResponse};

// ========== 内部工具函数 ==========

fn load_or_copy_file_for_capture(
    app: &AppHandle,
    source_path: &str,
    resource_uuid: &str,
) -> AppResult<(Vec<u8>, i64, String, Option<String>)> {
    if source_path.starts_with("assets/") {
        let assets_dir = get_assets_dir(app)?;
        let file_name = source_path.strip_prefix("assets/").unwrap_or(source_path);
        let full_path = assets_dir.join(file_name);

        let bytes = fs::read(&full_path)?;
        let size = bytes.len() as i64;

        Ok((bytes, size, source_path.to_string(), Some(file_name.to_string())))
    } else {
        let bytes = fs::read(source_path)?;
        let size = bytes.len() as i64;

        let original_name = Path::new(source_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string());

        let ext = get_extension(source_path);
        let target_filename = match &ext {
            Some(e) => format!("{}.{}", resource_uuid, e),
            None => resource_uuid.to_string(),
        };

        let assets_dir = get_assets_dir(app)?;
        let target_path = assets_dir.join(&target_filename);

        fs::copy(source_path, &target_path)?;

        let relative_path = format!("assets/{}", target_filename);

        Ok((bytes, size, relative_path, original_name))
    }
}

#[derive(Debug, Clone, Serialize)]
struct ParseProgressPayload {
    node_id: i64,
    status: String,
    percentage: Option<u8>,
    error: Option<String>,
}

fn emit_parse_progress(
    app: Option<&AppHandle>,
    node_id: Option<i64>,
    status: &str,
    percentage: Option<u8>,
    error: Option<&str>,
) {
    let (app, node_id) = match (app, node_id) {
        (Some(app), Some(node_id)) => (app, node_id),
        _ => return,
    };

    let payload = ParseProgressPayload {
        node_id,
        status: status.to_string(),
        percentage,
        error: error.map(|message| message.to_string()),
    };
    let _ = app.emit("parse-progress", payload);
}

fn merge_source_meta(payload: Option<super::CaptureSourceMeta>) -> SourceMeta {
    let mut meta = SourceMeta {
        url: payload.as_ref().and_then(|m| m.url.clone()),
        window_title: payload.as_ref().and_then(|m| m.window_title.clone()),
        process_name: payload.as_ref().and_then(|m| m.process_name.clone()),
        captured_at: payload.as_ref().and_then(|m| m.captured_at.clone()),
    };

    if meta.window_title.is_none() || meta.process_name.is_none() {
        if let Ok(active) = get_active_window() {
            if meta.window_title.is_none() {
                meta.window_title = if active.title.is_empty() {
                    None
                } else {
                    Some(active.title)
                };
            }
            if meta.process_name.is_none() {
                meta.process_name = if active.app_name.is_empty() {
                    None
                } else {
                    Some(active.app_name)
                };
            }
        }
    }

    if meta.captured_at.is_none() {
        meta.captured_at = Some(chrono::Utc::now().to_rfc3339());
    }

    meta
}

// ========== 捕获资源 ==========

#[tauri::command]
pub async fn capture_resource(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CaptureRequest,
) -> AppResult<CaptureResponse> {
    let CaptureRequest {
        mut content,
        file_path,
        file_type,
        source_meta,
    } = payload;

    let subtype = parse_file_type(file_type.as_deref());

    let builder = NodeBuilder::resource();
    let resource_uuid = builder.get_uuid().to_string();

    let file_info = match file_path.as_deref() {
        Some(source_path) => Some(load_or_copy_file_for_capture(&app, source_path, &resource_uuid)?),
        None => None,
    };

    let (file_bytes, stored_file_path, file_display_name) = match &file_info {
        Some((bytes, _size, stored_path, name)) => {
            (Some(bytes.as_slice()), Some(stored_path.as_str()), name.clone())
        }
        None => (None, None, None),
    };

    let resolved_path = match stored_file_path {
        Some(path) => Some(resolve_file_path(&app, path)?),
        None => None,
    };

    let file_hash = if let Some(bytes) = file_bytes {
        compute_sha256(bytes)
    } else if let Some(text) = content.as_ref() {
        compute_sha256(text.as_bytes())
    } else {
        return Err(AppError::Validation("content 或 file_path 至少提供一个".to_string()));
    };

    let user_note = if file_info.is_some() {
        content.take()
    } else {
        None
    };

    let title = build_resource_title(file_display_name.as_deref(), content.as_deref());
    let meta = merge_source_meta(source_meta);

    let node_id = builder
        .title(&title)
        .file_hash(Some(&file_hash))
        .file_path(stored_file_path)
        .user_note(user_note.as_deref())
        .resource_subtype(Some(subtype))
        .source_meta(Some(meta))
        .insert(&state.db)
        .await?;

    emit_parse_progress(Some(&app), Some(node_id), "parsing", Some(0), None);

    // Create progress callback for parser
    let app_clone = app.clone();
    let progress_callback: ProgressCallback = Box::new(move |status, percentage, error| {
        emit_parse_progress(Some(&app_clone), Some(node_id), status, percentage, error);
    });

    let file_content_result = parse_resource_content(
        subtype,
        content.as_deref(),
        resolved_path.as_deref(),
        Some(&progress_callback),
    );

    let mut should_enqueue = false;
    match file_content_result {
        Ok(text) => {
            if let Some(content) = text.as_deref() {
                tracing::debug!(
                    node_id,
                    subtype = ?subtype,
                    content = %content,
                    "Parsed resource content"
                );
                update_node_content(&state.db, node_id, Some(content), Some(&file_hash)).await?;
                should_enqueue = !content.trim().is_empty();
            }
            emit_parse_progress(Some(&app), Some(node_id), "done", Some(100), None);
        }
        Err(err) => {
            update_resource_sync_status(
                &state.db,
                node_id,
                ResourceEmbeddingStatus::Error,
                None,
                Some(&err),
            )
            .await?;
            emit_parse_progress(Some(&app), Some(node_id), "error", None, Some(&err));
        }
    }

    if should_enqueue {
        if let Err(err) = state.ai_pipeline.enqueue_resource(node_id).await {
            update_resource_sync_status(
                &state.db,
                node_id,
                ResourceEmbeddingStatus::Error,
                None,
                Some(&err),
            )
            .await?;
            emit_parse_progress(Some(&app), Some(node_id), "error", None, Some(&err));
        }
    }

    Ok(CaptureResponse {
        node_id,
        node_uuid: resource_uuid,
    })
}

fn build_resource_title(file_name: Option<&str>, content: Option<&str>) -> String {
    if let Some(name) = file_name {
        if !name.trim().is_empty() {
            return name.to_string();
        }
    }

    if let Some(text) = content {
        let title = build_text_title(text);
        if !title.trim().is_empty() {
            return title;
        }
    }

    "Untitled".to_string()
}

// ========== 查询资源 ==========

#[tauri::command]
pub async fn get_all_resources(state: State<'_, AppState>) -> AppResult<Vec<NodeRecord>> {
    Ok(list_all_resources(&state.db).await?)
}

#[tauri::command]
pub fn get_assets_path(app: AppHandle) -> AppResult<String> {
    let path = get_assets_dir(&app)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_resource_by_id(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<NodeRecord> {
    Ok(get_node_by_id(&state.db, node_id).await?)
}

// ========== 更新资源 ==========

#[tauri::command]
pub async fn update_resource_content_command(
    state: State<'_, AppState>,
    node_id: i64,
    content: String,
) -> AppResult<()> {
    let file_hash = compute_sha256(content.as_bytes());
    update_node_content(&state.db, node_id, Some(&content), Some(&file_hash)).await?;
    state.ai_pipeline.enqueue_resource(node_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_resource_title_command(
    state: State<'_, AppState>,
    node_id: i64,
    title: String,
) -> AppResult<()> {
    let title = validate_title(&title)?;
    Ok(update_node_title(&state.db, node_id, title).await?)
}

#[tauri::command]
pub async fn update_resource_summary_command(
    state: State<'_, AppState>,
    node_id: i64,
    summary: Option<String>,
) -> AppResult<()> {
    Ok(update_node_summary(&state.db, node_id, summary.as_deref()).await?)
}

#[tauri::command]
pub async fn update_resource_user_note_command(
    state: State<'_, AppState>,
    node_id: i64,
    user_note: String,
) -> AppResult<()> {
    let note = if user_note.trim().is_empty() {
        None
    } else {
        Some(user_note.as_str())
    };
    Ok(update_node_user_note(&state.db, node_id, note).await?)
}

// ========== 删除资源 ==========

#[tauri::command]
pub async fn soft_delete_resource_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(soft_delete_node(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn hard_delete_resource_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(hard_delete_node(&state.db, node_id).await?)
}

// ========== 处理待定资源 ==========

#[tauri::command]
pub async fn process_pending_resources_command(state: State<'_, AppState>) -> AppResult<usize> {
    state
        .ai
        .wait_ready()
        .await
        .map_err(|e| AppError::AiService(format!("AI 服务未就绪: {e}")))?;
    let count = state
        .ai_pipeline
        .enqueue_pending_resources(&state.db)
        .await
        .map_err(|e| AppError::AiService(format!("处理资源失败: {e}")))?;
    Ok(count)
}
