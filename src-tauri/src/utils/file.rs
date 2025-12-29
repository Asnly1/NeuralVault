use std::{fs, path::{Path, PathBuf}};

use tauri::{AppHandle, Manager};

use crate::db::ResourceFileType;

pub fn parse_file_type(raw: Option<&str>) -> ResourceFileType {
    // 如果 raw 是 None：map 直接跳过闭包，什么都不做，直接返回 None
    // 如果 raw 是 Some("PDF")：
    // map 会把 "PDF" 从 Option 的盒子里"拆"出来
    // 把它传给你写的闭包 |s| s.to_lowercase()
    // 闭包执行，把 "PDF" 变成了 "pdf"（注意：to_lowercase() 会分配内存生成一个新的 String）
    // map 会把这个新的 "pdf" 重新包装 进一个 Some 盒子
    // 最终返回 Option<String>
    match raw.map(|s| s.to_lowercase()) {
        // Some(t) 是一个"模式"：它的意思是，"如果这个盒子不为空（是 Some），那么把盒子里的东西取出来，并且临时命名为 t"
        Some(t) if t == "text" => ResourceFileType::Text,
        Some(t) if t == "image" => ResourceFileType::Image,
        Some(t) if t == "pdf" => ResourceFileType::Pdf,
        Some(t) if t == "url" => ResourceFileType::Url,
        Some(t) if t == "epub" => ResourceFileType::Epub,
        Some(t) if t == "other" => ResourceFileType::Other,
        _ => ResourceFileType::Text,
    }
}

/// 从文件路径中提取扩展名
pub fn get_extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
}

/// 获取 assets 目录路径，如果不存在则创建
pub fn get_assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    let assets_dir = app_data_dir.join("assets");

    // 创建 assets 目录（如果不存在）
    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 目录失败: {}", e))?;

    Ok(assets_dir)
}
