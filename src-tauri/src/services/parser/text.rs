//! Text file parsing utilities

use std::fs;

/// Parse text file content
pub fn parse_text_file(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// Build title from text (first 10 characters)
pub fn build_text_title(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "Untitled".to_string();
    }
    trimmed.chars().take(10).collect()
}
