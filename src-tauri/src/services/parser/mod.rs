//! File parsing services
//!
//! Provides text extraction from various file types:
//! - Text files
//! - Images (via OCR)
//! - PDFs (text extraction + OCR fallback)

mod ocr;
mod pdf;
mod text;

pub use ocr::{parse_image_file};
pub use pdf::{parse_pdf_file, parse_pdf_pages_with_fallback};
pub use text::{build_text_title, parse_text_file};

use std::path::PathBuf;

use crate::db::ResourceSubtype;

/// Get the third-party model directory path
pub fn third_party_model_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("Missing project root")
        .join("third_party_model")
}

/// Progress callback for long-running parse operations
pub type ProgressCallback = Box<dyn Fn(&str, Option<u8>, Option<&str>) + Send + Sync>;

/// Parse resource content based on subtype
pub fn parse_resource_content(
    subtype: ResourceSubtype,
    content: Option<&str>,
    file_path: Option<&str>,
    progress_callback: Option<&ProgressCallback>,
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
            Ok(Some(parse_pdf_file(path, progress_callback)?))
        }
        ResourceSubtype::Image => {
            let path = file_path.ok_or_else(|| "缺少图片路径".to_string())?;
            if let Some(cb) = progress_callback {
                cb("ocr", Some(0), None);
            }
            let text = parse_image_file(path)?;
            if let Some(cb) = progress_callback {
                cb("ocr", Some(100), None);
            }
            Ok(Some(text))
        }
        ResourceSubtype::Url => Ok(content.map(|c| c.to_string())),
        ResourceSubtype::Epub | ResourceSubtype::Other => Err("暂不支持该类型".to_string()),
    }
}
