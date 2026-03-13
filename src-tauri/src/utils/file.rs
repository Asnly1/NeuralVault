use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use crate::db::ResourceSubtype;

pub fn parse_file_type(raw: Option<&str>) -> ResourceSubtype {
    match raw.map(|s| s.to_lowercase()) {
        Some(t) if t == "text" => ResourceSubtype::Text,
        Some(t) if t == "image" => ResourceSubtype::Image,
        Some(t) if t == "pdf" => ResourceSubtype::Pdf,
        Some(t) if t == "url" => ResourceSubtype::Url,
        Some(t) if t == "epub" => ResourceSubtype::Epub,
        Some(t) if t == "other" => ResourceSubtype::Other,
        _ => ResourceSubtype::Text,
    }
}

pub fn get_extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
}

pub fn get_assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    let assets_dir = app_data_dir.join("assets");

    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 目录失败: {}", e))?;

    Ok(assets_dir)
}

pub fn resolve_file_path(app: &AppHandle, file_path: &str) -> Result<String, String> {
    let path = Path::new(file_path);
    if path.is_absolute() {
        return Ok(path.to_string_lossy().to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    Ok(app_data_dir.join(file_path).to_string_lossy().to_string())
}
