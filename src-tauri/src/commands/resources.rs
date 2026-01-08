use std::{
    fs,
    path::{Path, PathBuf},
};

use active_win_pos_rs::get_active_window;
use image::DynamicImage;
use ocr_rs::OcrEngine;
use pdfium_render::prelude::*;
use serde::Serialize;
use sqlx::types::Json;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        get_node_by_id, insert_node, list_all_resources, update_node_content,
        update_node_summary, update_node_title, update_resource_sync_status, NewNode, NodeType,
        ResourceProcessingStage, ResourceSubtype, ResourceSyncStatus, ReviewStatus, SourceMeta,
    },
    utils::{compute_sha256, get_assets_dir, get_extension, parse_file_type, resolve_file_path},
    AppResult,
};

use super::{CaptureRequest, CaptureResponse};

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

fn third_party_model_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("Missing project root")
        .join("third_party_model")
}

fn build_ocr_engine() -> Result<OcrEngine, String> {
    let model_dir = third_party_model_dir();
    let det_path = model_dir.join("PP-OCRv5_mobile_det.mnn");
    let rec_path = model_dir.join("PP-OCRv5_mobile_rec.mnn");
    let charset_path = model_dir.join("ppocr_keys_v5.txt");

    let det_path = det_path
        .to_str()
        .ok_or_else(|| "OCR 检测模型路径不可用".to_string())?;
    let rec_path = rec_path
        .to_str()
        .ok_or_else(|| "OCR 识别模型路径不可用".to_string())?;
    let charset_path = charset_path
        .to_str()
        .ok_or_else(|| "OCR 字符集路径不可用".to_string())?;

    OcrEngine::new(det_path, rec_path, charset_path, None).map_err(|e| e.to_string())
}

fn build_pdfium() -> Result<Pdfium, String> {
    let model_dir = third_party_model_dir();
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
        &model_dir,
    ))
    .or_else(|_| Pdfium::bind_to_system_library())
    .map_err(|e| e.to_string())?;

    Ok(Pdfium::new(bindings))
}

fn ocr_image_with_engine(engine: &OcrEngine, image: &DynamicImage) -> Result<String, String> {
    let results = engine.recognize(image).map_err(|e| e.to_string())?;
    let text = results
        .into_iter()
        .map(|result| result.text)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text)
}

fn parse_image_file(path: &str) -> Result<String, String> {
    let image = image::open(path).map_err(|e| e.to_string())?;
    let engine = build_ocr_engine()?;
    let text = ocr_image_with_engine(&engine, &image)?;
    if text.trim().is_empty() {
        Err("OCR 未识别到文本".to_string())
    } else {
        Ok(text)
    }
}

fn build_text_title(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "Untitled".to_string();
    }
    trimmed.chars().take(10).collect()
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
                meta.window_title = if active.title.is_empty() { None } else { Some(active.title) };
            }
            if meta.process_name.is_none() {
                meta.process_name = if active.app_name.is_empty() { None } else { Some(active.app_name) };
            }
        }
    }

    if meta.captured_at.is_none() {
        meta.captured_at = Some(chrono::Utc::now().to_rfc3339());
    }

    meta
}

fn parse_text_file(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn parse_pdf_text(path: &str) -> Result<String, String> {
    let mut doc = pdf_oxide::PdfDocument::open(path).map_err(|e| e.to_string())?;
    let mut output = String::new();
    let page_count = doc.page_count().map_err(|e| e.to_string())?;
    for page_index in 0..page_count {
        let text = doc.extract_text(page_index).map_err(|e| e.to_string())?;
        if !text.trim().is_empty() {
            output.push_str(&format!("[Page {}]\n", page_index + 1));
            output.push_str(&text);
            output.push('\n');
        }
    }
    if output.trim().is_empty() {
        return Err("PDF 无可提取文本".to_string());
    }
    Ok(output)
}

fn parse_pdf_with_ocr(
    path: &str,
    app: Option<&AppHandle>,
    node_id: Option<i64>,
) -> Result<String, String> {
    let pdfium = build_pdfium()?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| e.to_string())?;
    let total_pages = document.pages().iter().count();
    if total_pages == 0 {
        return Err("PDF 没有可渲染页面".to_string());
    }

    emit_parse_progress(app, node_id, "ocr", Some(0), None);

    let render_config = PdfRenderConfig::new()
        .set_target_width(2000)
        .set_maximum_height(2000);
    let engine = build_ocr_engine()?;
    let mut output = String::new();

    for (index, page) in document.pages().iter().enumerate() {
        let image = page
            .render_with_config(&render_config)
            .map_err(|e| e.to_string())?
            .as_image();
        let text = ocr_image_with_engine(&engine, &image)?;
        if !text.trim().is_empty() {
            output.push_str(&format!("[Page {}]\n", index + 1));
            output.push_str(&text);
            output.push('\n');
        }

        let percentage = ((index + 1) * 100 / total_pages) as u8;
        emit_parse_progress(app, node_id, "ocr", Some(percentage), None);
    }

    if output.trim().is_empty() {
        return Err("PDF OCR 未识别到文本".to_string());
    }

    Ok(output)
}

fn parse_pdf_file(
    path: &str,
    app: Option<&AppHandle>,
    node_id: Option<i64>,
) -> Result<String, String> {
    let text_result = parse_pdf_text(path);
    if let Ok(text) = &text_result {
        if !text.trim().is_empty() {
            return Ok(text.clone());
        }
    }

    let ocr_result = parse_pdf_with_ocr(path, app, node_id);
    match (text_result, ocr_result) {
        (_, Ok(text)) => Ok(text),
        (Err(text_err), Err(ocr_err)) => Err(format!(
            "PDF 解析失败: {}; OCR 失败: {}",
            text_err, ocr_err
        )),
        (Ok(_), Err(ocr_err)) => Err(ocr_err),
    }
}

fn parse_resource_content(
    app: Option<&AppHandle>,
    node_id: Option<i64>,
    subtype: ResourceSubtype,
    content: Option<&str>,
    file_path: Option<&str>,
) -> Result<Option<String>, String> {
    match subtype {
        ResourceSubtype::Text => {
            if let Some(text) = content {
                Ok(Some(text.to_string()))
            } else if let Some(path) = file_path {
                Ok(Some(parse_text_file(path)?))
            } else {
                Err("缺少文本内容".to_string())
            }
        }
        ResourceSubtype::Pdf => {
            let path = file_path.ok_or_else(|| "缺少 PDF 路径".to_string())?;
            Ok(Some(parse_pdf_file(path, app, node_id)?))
        }
        ResourceSubtype::Image => {
            let path = file_path.ok_or_else(|| "缺少图片路径".to_string())?;
            emit_parse_progress(app, node_id, "ocr", Some(0), None);
            let text = parse_image_file(path)?;
            emit_parse_progress(app, node_id, "ocr", Some(100), None);
            Ok(Some(text))
        }
        ResourceSubtype::Url => Ok(content.map(|c| c.to_string())),
        ResourceSubtype::Epub | ResourceSubtype::Other => Err("暂不支持该类型".to_string()),
    }
}

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

    let resource_uuid = Uuid::new_v4().to_string();
    let subtype = parse_file_type(file_type.as_deref());

    let file_info = match file_path.as_deref() {
        Some(source_path) => Some(load_or_copy_file_for_capture(&app, source_path, &resource_uuid)?),
        None => None,
    };

    let (file_bytes, stored_file_path, file_display_name) = match &file_info {
        Some((bytes, _size, stored_path, name)) => (Some(bytes.as_slice()), Some(stored_path.as_str()), name.clone()),
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
        return Err("content 或 file_path 至少提供一个".into());
    };

    let user_note = if file_info.is_some() { content.take() } else { None };

    let title = if let Some(name) = file_display_name.as_ref() {
        name.clone()
    } else if let Some(text) = content.as_ref() {
        build_text_title(text)
    } else {
        "Untitled".to_string()
    };
    let title = if title.trim().is_empty() {
        "Untitled".to_string()
    } else {
        title
    };

    let meta = merge_source_meta(source_meta);

    let node_id = insert_node(
        &state.db,
        NewNode {
            uuid: &resource_uuid,
            user_id: 1,
            title: &title,
            summary: None,
            node_type: NodeType::Resource,
            task_status: None,
            priority: None,
            due_date: None,
            done_date: None,
            file_hash: Some(&file_hash),
            file_path: stored_file_path,
            file_content: None,
            user_note: user_note.as_deref(),
            resource_subtype: Some(subtype),
            source_meta: Some(Json(meta)),
            indexed_hash: None,
            processing_hash: None,
            sync_status: ResourceSyncStatus::Pending,
            last_indexed_at: None,
            last_error: None,
            processing_stage: ResourceProcessingStage::Todo,
            review_status: ReviewStatus::Unreviewed,
        },
    )
    .await?;

    emit_parse_progress(Some(&app), Some(node_id), "parsing", Some(0), None);

    let file_content_result = parse_resource_content(
        Some(&app),
        Some(node_id),
        subtype,
        content.as_deref(),
        resolved_path.as_deref(),
    );

    let mut should_enqueue = false;
    match file_content_result {
        Ok(text) => {
            if let Some(content) = text.as_deref() {
                update_node_content(&state.db, node_id, Some(content), Some(&file_hash)).await?;
                should_enqueue = !content.trim().is_empty();
            }
            emit_parse_progress(Some(&app), Some(node_id), "done", Some(100), None);
        }
        Err(err) => {
            update_resource_sync_status(
                &state.db,
                node_id,
                ResourceSyncStatus::Error,
                None,
                Some(&err),
            )
            .await?;
            emit_parse_progress(Some(&app), Some(node_id), "error", None, Some(&err));
        }
    }

    if should_enqueue {
        state.ai_pipeline.enqueue_resource(node_id).await?;
    }

    Ok(CaptureResponse {
        node_id,
        node_uuid: resource_uuid,
    })
}

#[tauri::command]
pub async fn get_all_resources(state: State<'_, AppState>) -> AppResult<Vec<crate::db::NodeRecord>> {
    Ok(list_all_resources(&state.db).await?)
}

#[tauri::command]
pub fn get_assets_path(app: AppHandle) -> AppResult<String> {
    let path = get_assets_dir(&app)?;
    Ok(path.to_string_lossy().to_string())
}

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
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("title 不能为空".into());
    }
    Ok(update_node_title(&state.db, node_id, trimmed).await?)
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
pub async fn soft_delete_resource_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(crate::db::soft_delete_node(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn hard_delete_resource_command(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<()> {
    Ok(crate::db::hard_delete_node(&state.db, node_id).await?)
}

#[tauri::command]
pub async fn get_resource_by_id(
    state: State<'_, AppState>,
    node_id: i64,
) -> AppResult<crate::db::NodeRecord> {
    Ok(get_node_by_id(&state.db, node_id).await?)
}
