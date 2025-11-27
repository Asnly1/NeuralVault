use std::{fs, path::Path};

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::{
        NewResource, ResourceClassificationStatus, ResourceFileType, ResourceProcessingStage,
        ResourceSyncStatus, SourceMeta,
    },
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CaptureSourceMeta {
    pub url: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CaptureRequest {
    pub content: Option<String>,
    pub display_name: Option<String>,
    pub file_path: Option<String>,
    pub file_type: Option<String>,
    pub source_meta: Option<CaptureSourceMeta>,
}

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub resource_id: i64,
    pub resource_uuid: String,
}

fn parse_file_type(raw: Option<&str>) -> ResourceFileType {
    // 如果 raw 是 None：map 直接跳过闭包，什么都不做，直接返回 None
    // 如果 raw 是 Some("PDF")：
    // map 会把 "PDF" 从 Option 的盒子里“拆”出来
    // 把它传给你写的闭包 |s| s.to_lowercase()
    // 闭包执行，把 "PDF" 变成了 "pdf"（注意：to_lowercase() 会分配内存生成一个新的 String）
    // map 会把这个新的 "pdf" 重新包装 进一个 Some 盒子
    // 最终返回 Option<String>
    match raw.map(|s| s.to_lowercase()) {
        // Some(t) 是一个“模式”：它的意思是，“如果这个盒子不为空（是 Some），那么把盒子里的东西取出来，并且临时命名为 t”
        Some(t) if t == "image" => ResourceFileType::Image,
        Some(t) if t == "pdf" => ResourceFileType::Pdf,
        Some(t) if t == "url" => ResourceFileType::Url,
        Some(t) if t == "epub" => ResourceFileType::Epub,
        Some(t) if t == "other" => ResourceFileType::Other,
        _ => ResourceFileType::Text,
    }
}

fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

async fn notify_python(resource_uuid: String) {
    let client = reqwest::Client::new();
    let body = json!({ "resource_uuid": resource_uuid });
    // 失败不影响本地存储；仅记录错误
    if let Err(err) = client
        .post("http://127.0.0.1:8000/ingest/notify")
        .json(&body)
        .send()
        .await
    {
        eprintln!("notify python failed: {err}");
    }
}

// 这个宏将 Rust 函数 capture_resource 标记为可供前端调用的命令
// rename = "quick_capture" 意味着前端 JS 调用时使用 invoke('quick_capture', ...)
// 而不是函数名 capture_resource
#[tauri::command(rename = "quick_capture")]
pub async fn capture_resource(
    state: State<'_, AppState>,
    payload: CaptureRequest,
) -> Result<CaptureResponse, String> {
    let CaptureRequest {
        mut content,
        display_name,
        file_path,
        file_type,
        source_meta,
    } = payload;

    let (content_bytes, content_for_db, file_size_bytes, file_path_for_db) =
        // content 是 Option<String>, take() 会把里面的值取出来（变成 None 留在原地），并将所有权转移出来
        match (content.take(), file_path.clone()) {
            (Some(text), path_opt) => {
                let size = text.as_bytes().len() as i64;
                (text.clone().into_bytes(), Some(text), Some(size), path_opt)
            }
            (None, Some(path)) => {
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                let size = bytes.len() as i64;
                (bytes, None, Some(size), Some(path))
            }
            (None, None) => return Err("content 或 file_path 至少提供一个".into()),
        };

    // 优先用户传入，其次取文件名；如仅有文本，取前 5 个字符作为名称
    let display_name = display_name
        // or_else: 如果前面的值存在，就用前面的；如果不存在，执行这段代码来生成一个兜底值
        .or_else(|| {
            file_path
                // 把 Option<String> 变成了 Option<&String>
                .as_ref()
                // 把 Option<&String> 中的 &String 拿出来，作为p
                // Path::new(p) 把字符串包装成路径对象
                // file_name() 提取路径的最后一部分
                .and_then(|p| Path::new(p).file_name())
                // os (&OsStr): 这是操作系统的原生字符串，未必是合法的 UTF-8
                // to_string_lossy(): 尝试转成 UTF-8 字符串
                // .to_string() 把它变成一个真正的、拥有所有权的 String
                .map(|os| os.to_string_lossy().to_string())
        })
        .or_else(|| {
            content_for_db.as_ref().and_then(|text| {
                // trim: 去掉字符串“首尾”的空白字符
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    // 尝试取前 21 个字符
                    let chars: Vec<char> = trimmed.chars().take(21).collect();
                    
                    if chars.len() > 20 {
                        // 如果拿到了 21 个，说明原库肯定超过 20 个
                        // 取前 20 个拼上省略号
                        let sample: String = chars.into_iter().take(20).collect();
                        Some(format!("{sample}..."))
                    } else {
                        // 如果不到 21 个，说明原库就很短，直接全用
                        let sample: String = chars.into_iter().collect();
                        Some(sample)
                    }
                }
            })
        });

    let file_hash = compute_sha256(&content_bytes);
    let resource_uuid = Uuid::new_v4().to_string();
    let resource_type = parse_file_type(file_type.as_deref());
    let meta = source_meta.map(|m| SourceMeta {
        url: m.url,
        window_title: m.window_title,
    });

    let pool = &state.db;
    let resource_id = crate::db::insert_resource(
        pool,
        NewResource {
            uuid: &resource_uuid,
            source_meta: meta.as_ref(),
            file_hash: &file_hash,
            file_type: resource_type,
            content: content_for_db.as_deref(),
            display_name: display_name.as_deref(),
            file_path: file_path_for_db.as_deref(),
            file_size_bytes,
            indexed_hash: None,
            processing_hash: None,
            sync_status: ResourceSyncStatus::Pending,
            last_indexed_at: None,
            last_error: None,
            processing_stage: ResourceProcessingStage::Todo,
            classification_status: ResourceClassificationStatus::Unclassified,
            user_id: 1,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // 异步通知 Python，不影响主流程
    tauri::async_runtime::spawn(notify_python(resource_uuid.clone()));
    // 流程：
    // Rust 主线程执行到 spawn 时，只是创建一个任务包（Task），把它扔进“任务队列”
    // 不等待任务执行，主线程直接继续往下走，瞬间返回 Ok 给前端
    // 前端用户看到“保存成功”
    // 与此同时，Rust 的后台运行时（Runtime，底层通常是 Tokio）会找一个空闲线程来执行 notify_python
    // 如果 Python 通知的慢，或者失败了，完全不影响用户在前台的感知
    
    Ok(CaptureResponse {
        resource_id,
        resource_uuid,
    })
}
