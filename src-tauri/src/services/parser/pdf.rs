//! PDF parsing utilities

use pdfium_render::prelude::*;

use super::ocr::{build_ocr_engine, ocr_image_with_engine};
use super::{third_party_model_dir, ProgressCallback};

/// Build Pdfium instance
fn build_pdfium() -> Result<Pdfium, String> {
    let model_dir = third_party_model_dir();
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
        &model_dir,
    ))
    .or_else(|_| Pdfium::bind_to_system_library())
    .map_err(|e| e.to_string())?;

    Ok(Pdfium::new(bindings))
}

/// Extract text from PDF using pdf_oxide
/// TODO: 转成markdown
/// TODO: 添加页数
pub fn parse_pdf_text(path: &str) -> Result<String, String> {
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

/// Parse PDF using OCR (render pages as images then OCR)
pub fn parse_pdf_with_ocr(
    path: &str,
    progress_callback: Option<&ProgressCallback>,
) -> Result<String, String> {
    let pdfium = build_pdfium()?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| e.to_string())?;
    let total_pages = document.pages().iter().count();
    if total_pages == 0 {
        return Err("PDF 没有可渲染页面".to_string());
    }

    if let Some(cb) = progress_callback {
        cb("ocr", Some(0), None);
    }

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
        if let Some(cb) = progress_callback {
            cb("ocr", Some(percentage), None);
        }
    }

    if output.trim().is_empty() {
        return Err("PDF OCR 未识别到文本".to_string());
    }

    Ok(output)
}

/// Parse PDF file (try text extraction first, fallback to OCR)
/// TODO: 判断逻辑太简单
pub fn parse_pdf_file(
    path: &str,
    progress_callback: Option<&ProgressCallback>,
) -> Result<String, String> {
    let text_result = parse_pdf_text(path);
    if let Ok(text) = &text_result {
        if !text.trim().is_empty() {
            return Ok(text.clone());
        }
    }

    let ocr_result = parse_pdf_with_ocr(path, progress_callback);
    match (text_result, ocr_result) {
        (_, Ok(text)) => Ok(text),
        (Err(text_err), Err(ocr_err)) => Err(format!(
            "PDF 解析失败: {}; OCR 失败: {}",
            text_err, ocr_err
        )),
        (Ok(_), Err(ocr_err)) => Err(ocr_err),
    }
}
