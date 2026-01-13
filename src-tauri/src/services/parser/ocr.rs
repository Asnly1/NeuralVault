//! OCR (Optical Character Recognition) utilities

use image::DynamicImage;
use ocr_rs::OcrEngine;

use super::third_party_model_dir;

/// Build OCR engine using models from third_party_model directory
pub fn build_ocr_engine() -> Result<OcrEngine, String> {
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

/// Perform OCR on an image using the provided engine
/// TODO: 引入itertools，避免内存二次分配
pub fn ocr_image_with_engine(engine: &OcrEngine, image: &DynamicImage) -> Result<String, String> {
    let results = engine.recognize(image).map_err(|e| e.to_string())?;
    let text = results
        .into_iter()
        .map(|result| result.text)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text)
}

/// Parse image file using OCR
pub fn parse_image_file(path: &str) -> Result<String, String> {
    let image = image::open(path).map_err(|e| e.to_string())?;
    let engine = build_ocr_engine()?;
    let text = ocr_image_with_engine(&engine, &image)?;
    if text.trim().is_empty() {
        Err("OCR 未识别到文本".to_string())
    } else {
        Ok(text)
    }
}
