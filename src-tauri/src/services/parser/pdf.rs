//! PDF parsing utilities

use pdf_oxide::converters::ConversionOptions;
use pdfium_render::prelude::*;

use super::ocr::{build_ocr_engine, ocr_image_with_engine};
use super::{third_party_model_dir, ProgressCallback};

const MIN_PDF_TEXT_QUALITY_SCORE: f64 = 0.6;

#[derive(Debug, Clone)]
pub struct PdfPageText {
    pub page_number: usize,
    pub text: String,
}

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

fn markdown_options() -> ConversionOptions {
    ConversionOptions {
        include_images: false,
        ..ConversionOptions::default()
    }
}

fn join_pdf_pages(pages: &[PdfPageText]) -> String {
    let mut output = String::new();

    for page in pages {
        if page.text.trim().is_empty() {
            continue;
        }
        if !output.is_empty() {
            output.push_str("\n---\n\n");
        }
        output.push_str(page.text.trim_end());
        output.push('\n');
    }

    output
}

fn text_quality_score(text: &str) -> f64 {
    let mut total = 0usize;
    let mut printable = 0usize;
    let mut alnum = 0usize;
    let mut control = 0usize;
    let mut replacement = 0usize;

    for ch in text.chars() {
        if ch.is_whitespace() {
            continue;
        }
        total += 1;

        if ch == '\u{FFFD}' {
            replacement += 1;
            continue;
        }
        if ch.is_control() {
            control += 1;
            continue;
        }

        printable += 1;
        if ch.is_alphanumeric() {
            alnum += 1;
        }
    }

    if total == 0 {
        return 0.0;
    }

    let printable_ratio = printable as f64 / total as f64;
    let alnum_ratio = alnum as f64 / total as f64;
    let replacement_ratio = replacement as f64 / total as f64;
    let control_ratio = control as f64 / total as f64;

    let mut score = 0.6 * printable_ratio + 0.4 * alnum_ratio;
    score -= 0.7 * replacement_ratio;
    score -= 0.5 * control_ratio;
    score.clamp(0.0, 1.0)
}

fn pages_quality_score(pages: &[PdfPageText]) -> f64 {
    text_quality_score(&join_pdf_pages(pages))
}

fn parse_pdf_pages(path: &str) -> Result<Vec<PdfPageText>, String> {
    let mut doc = pdf_oxide::PdfDocument::open(path).map_err(|e| e.to_string())?;
    let page_count = doc.page_count().map_err(|e| e.to_string())?;
    let options = markdown_options();
    let mut pages = Vec::new();

    for page_index in 0..page_count {
        let text = doc
            .to_markdown(page_index, &options)
            .map_err(|e| e.to_string())?;
        if !text.trim().is_empty() {
            pages.push(PdfPageText {
                page_number: page_index + 1,
                text,
            });
        }
    }

    if pages.is_empty() {
        return Err("PDF 无可提取文本".to_string());
    }

    Ok(pages)
}

fn parse_pdf_pages_with_ocr(
    path: &str,
    progress_callback: Option<&ProgressCallback>,
) -> Result<Vec<PdfPageText>, String> {
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
    let mut pages = Vec::new();

    for (index, page) in document.pages().iter().enumerate() {
        let image = page
            .render_with_config(&render_config)
            .map_err(|e| e.to_string())?
            .as_image();
        let text = ocr_image_with_engine(&engine, &image)?;
        if !text.trim().is_empty() {
            pages.push(PdfPageText {
                page_number: index + 1,
                text,
            });
        }

        let percentage = ((index + 1) * 100 / total_pages) as u8;
        if let Some(cb) = progress_callback {
            cb("ocr", Some(percentage), None);
        }
    }

    if pages.is_empty() {
        return Err("PDF OCR 未识别到文本".to_string());
    }

    Ok(pages)
}

pub fn parse_pdf_pages_with_fallback(
    path: &str,
    progress_callback: Option<&ProgressCallback>,
) -> Result<Vec<PdfPageText>, String> {
    let text_result = parse_pdf_pages(path);
    let text_score = text_result
        .as_ref()
        .map(|pages| pages_quality_score(pages))
        .unwrap_or(0.0);

    if text_score >= MIN_PDF_TEXT_QUALITY_SCORE {
        return text_result;
    }

    let ocr_result = parse_pdf_pages_with_ocr(path, progress_callback);
    match (text_result, ocr_result) {
        (Ok(text_pages), Ok(ocr_pages)) => {
            let ocr_score = pages_quality_score(&ocr_pages);
            let best_score = text_score.max(ocr_score);
            if best_score < MIN_PDF_TEXT_QUALITY_SCORE {
                Err(format!(
                    "PDF 文本质量过低({:.2}); OCR 质量过低({:.2})",
                    text_score, ocr_score
                ))
            } else if ocr_score >= text_score {
                Ok(ocr_pages)
            } else {
                Ok(text_pages)
            }
        }
        (Ok(_), Err(ocr_err)) => Err(format!(
            "PDF 文本质量过低({:.2}); OCR 失败: {}",
            text_score, ocr_err
        )),
        (Err(_), Ok(ocr_pages)) => Ok(ocr_pages),
        (Err(text_err), Err(ocr_err)) => Err(format!(
            "PDF 解析失败: {}; OCR 失败: {}",
            text_err, ocr_err
        )),
    }
}

/// Parse PDF file (try text extraction first, fallback to OCR)
pub fn parse_pdf_file(
    path: &str,
    progress_callback: Option<&ProgressCallback>,
) -> Result<String, String> {
    let pages = parse_pdf_pages_with_fallback(path, progress_callback)?;
    let output = join_pdf_pages(&pages);
    if output.trim().is_empty() {
        return Err("PDF 无可提取文本".to_string());
    }
    Ok(output)
}
