use clipboard_rs::{common::RustImage, Clipboard, ClipboardContext, ContentFormat};
use tauri::AppHandle;
use uuid::Uuid;

use crate::utils::get_assets_dir;

use super::{ClipboardContent, ReadClipboardResponse};

/// 读取系统剪贴板内容
/// 
/// 优先级：文件 > 图片 > HTML > 文本
/// 注意：文件优先于图片，因为复制文件时 macOS 会同时放置预览图片
#[tauri::command]
pub fn read_clipboard(app: AppHandle) -> Result<ReadClipboardResponse, String> {
    let ctx = ClipboardContext::new().map_err(|e| format!("无法访问剪贴板: {}", e))?;

    // 1. 优先检查文件列表（复制文件时 macOS 会同时生成预览图片，所以文件优先）
    if ctx.has(ContentFormat::Files) {
        if let Ok(files) = ctx.get_files() {
            if !files.is_empty() {
                return Ok(ReadClipboardResponse {
                    content: ClipboardContent::Files { paths: files },
                });
            }
        }
    }

    // 2. 检查图片（截图或复制的图片）
    if ctx.has(ContentFormat::Image) {
        if let Ok(img) = ctx.get_image() {
            // 生成唯一文件名
            let uuid = Uuid::new_v4().to_string();
            let file_name = format!("{}.png", uuid);
            
            // 获取 assets 目录
            let assets_dir = get_assets_dir(&app)?;
            let target_path = assets_dir.join(&file_name);
            
            // 保存图片
            img.save_to_path(target_path.to_str().unwrap_or_default())
                .map_err(|e| format!("保存图片失败: {}", e))?;
            
            // 返回相对路径
            let relative_path = format!("assets/{}", file_name);
            
            return Ok(ReadClipboardResponse {
                content: ClipboardContent::Image {
                    file_path: relative_path,
                    file_name,
                },
            });
        }
    }

    // 3. 检查 HTML（可能来自网页复制）
    if ctx.has(ContentFormat::Html) {
        if let Ok(html) = ctx.get_html() {
            if !html.trim().is_empty() {
                // 同时尝试获取纯文本版本
                let plain_text = ctx.get_text().ok().filter(|t| !t.trim().is_empty());
                
                return Ok(ReadClipboardResponse {
                    content: ClipboardContent::Html {
                        content: html,
                        plain_text,
                    },
                });
            }
        }
    }

    // 4. 检查纯文本
    if ctx.has(ContentFormat::Text) {
        if let Ok(text) = ctx.get_text() {
            if !text.trim().is_empty() {
                return Ok(ReadClipboardResponse {
                    content: ClipboardContent::Text { content: text },
                });
            }
        }
    }

    // 5. 剪贴板为空
    Ok(ReadClipboardResponse {
        content: ClipboardContent::Empty,
    })
}
