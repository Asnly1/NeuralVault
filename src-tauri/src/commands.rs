use std::{fs, path::Path, path::PathBuf};

use clipboard_rs::{common::RustImage, Clipboard, ClipboardContext, ContentFormat};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::{
    db::{
        get_task_by_id, insert_resource, insert_task, link_resource_to_task, list_active_tasks,
        list_resources_for_task, list_unclassified_resources, unlink_resource_from_task,
        LinkResourceParams, NewResource, NewTask, ResourceClassificationStatus, ResourceFileType,
        ResourceProcessingStage, ResourceRecord, ResourceSyncStatus, SourceMeta, TaskPriority,
        TaskRecord, TaskStatus, VisibilityScope,
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

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateTaskResponse {
    pub task: TaskRecord,
}

#[derive(Debug, Serialize)]
pub struct DashboardData {
    pub tasks: Vec<TaskRecord>,
    pub resources: Vec<ResourceRecord>,
}

fn parse_file_type(raw: Option<&str>) -> ResourceFileType {
    // 如果 raw 是 None：map 直接跳过闭包，什么都不做，直接返回 None
    // 如果 raw 是 Some("PDF")：
    // map 会把 "PDF" 从 Option 的盒子里"拆"出来
    // 把它传给你写的闭包 |s| s.to_lowercase()
    // 闭包执行，把 "PDF" 变成了 "pdf"（注意：to_lowercase() 会分配内存生成一个新的 String）
    // map 会把这个新的 "pdf" 重新包装 进一个 Some 盒子
    // 最终返回 Option<String>
    match raw.map(|s| s.to_lowercase()) {
        // Some(t) 是一个"模式"：它的意思是，"如果这个盒子不为空（是 Some），那么把盒子里的东西取出来，并且临时命名为 t"
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

/// 从文件路径中提取扩展名
fn get_extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
}

/// 获取 assets 目录路径，如果不存在则创建
fn get_assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    let assets_dir = app_data_dir.join("assets");

    // 创建 assets 目录（如果不存在）
    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 目录失败: {}", e))?;

    Ok(assets_dir)
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
#[tauri::command]
pub async fn capture_resource(
    app: AppHandle,
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

    // 生成资源 UUID（用于文件名和数据库记录）
    let resource_uuid = Uuid::new_v4().to_string();

    // ========== 读取文件内容 ==========
    // content_bytes: 用于计算 hash 的字节（文本+文件 或 单独文本 或 单独文件）
    // content_for_db: 文本内容存入数据库
    // file_size_bytes: 文件大小（仅文件有）
    // stored_file_path: 存储在应用目录中的相对路径（如 "assets/abc123.pdf"）
    // generated_display_name: 自动生成的显示名称
    let (content_bytes, content_for_db, file_size_bytes, stored_file_path, generated_display_name) =
        // take() 会把 content: Option<String> 中的值取出来（变成 None 留在原地），并将所有权转移出来
        match (content.take(), file_path.clone()) {
            // ========== 情况1: 既有文本又有文件 ==========
            (Some(text), Some(source_path)) => {
                // 检查是否是从剪贴板粘贴的文件（已保存到 assets 目录）
                if source_path.starts_with("assets/") {
                    // 从剪贴板粘贴的图片，文件已经保存到 assets 目录
                    let assets_dir = get_assets_dir(&app)?;
                    let file_name = source_path.strip_prefix("assets/").unwrap_or(&source_path);
                    let full_path = assets_dir.join(file_name);

                    // 读取文件内容
                    let file_bytes =
                        fs::read(&full_path).map_err(|e| format!("读取文件失败: {}", e))?;

                    // 拼接文本和文件字节
                    let text_bytes = text.as_bytes();
                    let mut combined_bytes =
                        Vec::with_capacity(text_bytes.len() + file_bytes.len());
                    combined_bytes.extend_from_slice(text_bytes);
                    combined_bytes.extend_from_slice(&file_bytes);

                    let combined_size = combined_bytes.len() as i64;

                    (
                        combined_bytes,
                        Some(text),
                        Some(combined_size),
                        Some(source_path.clone()),
                        Some(file_name.to_string()),
                    )
                } else {
                    // 正常的外部文件
                    // 读取文件内容
                    let file_bytes =
                        fs::read(&source_path).map_err(|e| format!("读取文件失败: {}", e))?;

                    // 拼接文本和文件字节
                    let text_bytes = text.as_bytes();
                    let mut combined_bytes =
                        Vec::with_capacity(text_bytes.len() + file_bytes.len());
                    combined_bytes.extend_from_slice(text_bytes);
                    combined_bytes.extend_from_slice(&file_bytes);

                    // 总大小 = 文本 + 文件
                    let combined_size = combined_bytes.len() as i64;

                    // 提取原始文件名作为 display_name
                    let original_name = Path::new(&source_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string());

                    // 获取文件扩展名
                    let ext = get_extension(&source_path);

                    // 构建目标文件名: {uuid}.{ext}
                    let target_filename = match &ext {
                        Some(e) => format!("{}.{}", resource_uuid, e),
                        None => resource_uuid.clone(),
                    };

                    // 获取 assets 目录并复制文件
                    let assets_dir = get_assets_dir(&app)?;
                    let target_path = assets_dir.join(&target_filename);

                    // 复制文件到应用目录
                    fs::copy(&source_path, &target_path)
                        .map_err(|e| format!("复制文件失败: {}", e))?;

                    // 存储相对路径
                    let relative_path = format!("assets/{}", target_filename);

                    (
                        combined_bytes,      // hash 用拼接后的字节
                        Some(text),          // 文本存数据库
                        Some(combined_size), // 文本+文件 总大小
                        Some(relative_path), // 文件路径
                        original_name,       // 文件名作为 display_name
                    )
                }
            }

            // ========== 情况2: 只有文本 ==========
            (Some(text), None) => {
                let size = text.as_bytes().len() as i64;

                // 取文本前20个字符作为 display_name
                let name = {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        let chars: Vec<char> = trimmed.chars().take(21).collect();
                        if chars.len() > 20 {
                            let sample: String = chars.into_iter().take(20).collect();
                            Some(format!("{sample}..."))
                        } else {
                            Some(chars.into_iter().collect())
                        }
                    }
                };

                (
                    text.clone().into_bytes(), // hash 用文本字节
                    Some(text),                // 文本存数据库
                    Some(size),                // 文本大小
                    None,                      // 无文件路径
                    name,                      // 文本前20字符
                )
            }

            // ========== 情况3: 只有文件 ==========
            (None, Some(source_path)) => {
                // 检查是否是从剪贴板粘贴的文件（已保存到 assets 目录）
                // 相对路径格式: "assets/xxx.png"
                if source_path.starts_with("assets/") {
                    // 从剪贴板粘贴的图片，文件已经保存到 assets 目录
                    let assets_dir = get_assets_dir(&app)?;
                    let file_name = source_path.strip_prefix("assets/").unwrap_or(&source_path);
                    let full_path = assets_dir.join(file_name);

                    // 读取文件内容计算 hash
                    let bytes =
                        fs::read(&full_path).map_err(|e| format!("读取文件失败: {}", e))?;
                    let size = bytes.len() as i64;

                    (
                        bytes,                    // hash 用文件字节
                        None,                     // 无文本
                        Some(size),               // 文件大小
                        Some(source_path.clone()), // 保持相对路径
                        Some(file_name.to_string()), // 文件名
                    )
                } else {
                    // 正常的外部文件，需要复制到 assets 目录
                    // 读取原始文件
                    let bytes =
                        fs::read(&source_path).map_err(|e| format!("读取文件失败: {}", e))?;
                    let size = bytes.len() as i64;

                    // 提取原始文件名
                    let original_name = Path::new(&source_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string());

                    // 获取文件扩展名
                    let ext = get_extension(&source_path);

                    // 构建目标文件名: {uuid}.{ext}
                    let target_filename = match &ext {
                        Some(e) => format!("{}.{}", resource_uuid, e),
                        None => resource_uuid.clone(),
                    };

                    // 获取 assets 目录并复制文件
                    let assets_dir = get_assets_dir(&app)?;
                    let target_path = assets_dir.join(&target_filename);

                    // 复制文件到应用目录
                    fs::copy(&source_path, &target_path)
                        .map_err(|e| format!("复制文件失败: {}", e))?;

                    // 存储相对路径
                    let relative_path = format!("assets/{}", target_filename);

                    (
                        bytes,               // hash 用文件字节
                        None,                // 无文本
                        Some(size),          // 文件大小
                        Some(relative_path), // 文件路径
                        original_name,       // 文件名
                    )
                }
            }

            // ========== 情况4: 什么都没有 ==========
            (None, None) => return Err("content 或 file_path 至少提供一个".into()),
        };

    // ========== 生成 display_name ==========
    // 优先级: 用户传入 > generated_display_name（已包含文件名或文本前20字符）
    let display_name = display_name.or(generated_display_name);

    // ========== 计算文件哈希 ==========
    let file_hash = compute_sha256(&content_bytes);

    // ========== 解析文件类型 ==========
    let resource_type = parse_file_type(file_type.as_deref());

    // ========== 解析来源元信息 ==========
    let meta = source_meta.map(|m| SourceMeta {
        url: m.url,
        window_title: m.window_title,
    });

    // ========== 插入数据库 ==========
    let pool = &state.db;
    let resource_id = crate::db::insert_resource(
        pool,
        NewResource {
            uuid: &resource_uuid,
            source_meta: meta.as_ref(),
            file_hash: &file_hash,
            file_type: resource_type,
            // 文本内容存数据库，二进制文件不存
            content: content_for_db.as_deref(),
            display_name: display_name.as_deref(),
            // 存储相对路径（如 "assets/abc123.pdf"）
            file_path: stored_file_path.as_deref(),
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

    // ========== 异步通知 Python ==========
    // 不阻塞主流程
    tauri::async_runtime::spawn(notify_python(resource_uuid.clone()));

    Ok(CaptureResponse {
        resource_id,
        resource_uuid,
    })
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    payload: CreateTaskRequest,
) -> Result<CreateTaskResponse, String> {
    let status = payload.status.unwrap_or(TaskStatus::Inbox);
    let priority = payload.priority.unwrap_or(TaskPriority::Medium);

    let uuid = Uuid::new_v4().to_string();
    let pool = &state.db;
    let task_id = insert_task(
        pool,
        NewTask {
            uuid: &uuid,
            parent_task_id: None,
            root_task_id: None,
            title: payload.title.as_deref(),
            description: payload.description.as_deref(),
            suggested_subtasks: None,
            status,
            priority,
            due_date: payload.due_date.as_deref(),
            user_id: 1,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let task = get_task_by_id(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(CreateTaskResponse { task })
}

#[tauri::command]
pub async fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardData, String> {
    let pool = &state.db;
    let tasks = list_active_tasks(pool).await.map_err(|e| e.to_string())?;
    let resources = list_unclassified_resources(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(DashboardData { tasks, resources })
}

/// 关联资源到任务的请求
#[derive(Debug, Deserialize)]
pub struct LinkResourceRequest {
    pub task_id: i64,
    pub resource_id: i64,
    /// 可见范围: "this" | "subtree" | "global"
    pub visibility_scope: Option<String>,
    /// 本地别名，可在任务上下文中给资源起个别名
    pub local_alias: Option<String>,
}

/// 关联/取消关联资源的响应
#[derive(Debug, Serialize)]
pub struct LinkResourceResponse {
    pub success: bool,
}


/// 将资源关联到任务
#[tauri::command]
pub async fn link_resource(
    state: State<'_, AppState>,
    payload: LinkResourceRequest,
) -> Result<LinkResourceResponse, String> {
    let pool = &state.db;

    // 解析可见范围，默认为 subtree
    let visibility_scope = match payload.visibility_scope.as_deref() {
        Some("this") => VisibilityScope::This,
        Some("global") => VisibilityScope::Global,
        _ => VisibilityScope::Subtree,
    };

    link_resource_to_task(
        pool,
        LinkResourceParams {
            task_id: payload.task_id,
            resource_id: payload.resource_id,
            visibility_scope,
            local_alias: payload.local_alias.as_deref(),
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(LinkResourceResponse { success: true })
}

/// 取消资源与任务的关联
#[tauri::command]
pub async fn unlink_resource(
    state: State<'_, AppState>,
    task_id: i64,
    resource_id: i64,
) -> Result<LinkResourceResponse, String> {
    let pool = &state.db;

    unlink_resource_from_task(pool, task_id, resource_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(LinkResourceResponse { success: true })
}

/// 获取任务关联资源的响应
#[derive(Debug, Serialize)]
pub struct TaskResourcesResponse {
    pub resources: Vec<ResourceRecord>,
}

/// 获取任务关联的资源列表
#[tauri::command]
pub async fn get_task_resources(
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<TaskResourcesResponse, String> {
    let pool = &state.db;

    let resources = list_resources_for_task(pool, task_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(TaskResourcesResponse { resources })
}

#[derive(Debug, Serialize)]
pub struct SeedResponse {
    pub tasks_created: usize,
    pub resources_created: usize,
}

#[tauri::command]
pub async fn seed_demo_data(state: State<'_, AppState>) -> Result<SeedResponse, String> {
    let pool = &state.db;

    let demo_tasks = vec![
        (
            "梳理需求列表",
            "整理上周访谈要点，准备下周评审。",
            TaskStatus::Inbox,
            TaskPriority::High,
            Some("2024-12-31"),
        ),
        (
            "整理知识库",
            "把历史文档分类到知识库，补充标签。",
            TaskStatus::Todo,
            TaskPriority::Medium,
            None,
        ),
        (
            "实现 Capture PoC",
            "验证 HUD 捕获流程并写出技术风险。",
            TaskStatus::Doing,
            TaskPriority::High,
            Some("2024-12-20"),
        ),
    ];

    let mut task_ids = Vec::new();
    for (title, desc, status, priority, due) in demo_tasks {
        let uuid = Uuid::new_v4().to_string();
        let task_id = insert_task(
            pool,
            NewTask {
                uuid: &uuid,
                parent_task_id: None,
                root_task_id: None,
                title: Some(title),
                description: Some(desc),
                suggested_subtasks: None,
                status,
                priority,
                due_date: due,
                user_id: 1,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        task_ids.push(task_id);
    }

    let demo_resources: Vec<(&str, &str, Option<&str>, Option<&str>)> = vec![
        ("访谈记录.txt", "text", Some("整理后打标签"), None),
        ("需求文档.pdf", "pdf", Some("最新需求文档"), None),
        (
            "灵感链接",
            "url",
            Some("产品灵感参考"),
            Some("https://example.com/ideas"),
        ),
    ];

    for (name, file_type, content, url) in &demo_resources {
        let uuid = Uuid::new_v4().to_string();
        let file_hash = format!("hash-{uuid}");
        let meta = url.map(|u| SourceMeta {
            url: Some(u.to_string()),
            window_title: None,
        });
        insert_resource(
            pool,
            NewResource {
                uuid: &uuid,
                source_meta: meta.as_ref(),
                file_hash: &file_hash,
                file_type: match *file_type {
                    "pdf" => ResourceFileType::Pdf,
                    "url" => ResourceFileType::Url,
                    "image" => ResourceFileType::Image,
                    "epub" => ResourceFileType::Epub,
                    "other" => ResourceFileType::Other,
                    _ => ResourceFileType::Text,
                },
                content: *content,
                display_name: Some(name),
                file_path: None,
                file_size_bytes: None,
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
    }

    Ok(SeedResponse {
        tasks_created: task_ids.len(),
        resources_created: demo_resources.len(),
    })
}

// ========== 剪贴板相关 ==========

/// 剪贴板内容类型
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "data")]
// serde在序列化时将额外创建两个键
// 例子：ClipboardContent::Image { file_path: "/tmp/a.png".into(), file_name: "a.png".into() }
// {
//     "type": "Image",
//     "data": {
//       "file_path": "/tmp/a.png",
//       "file_name": "a.png"
//     }
//   }
pub enum ClipboardContent {
    /// 图片：返回保存后的文件路径
    Image { file_path: String, file_name: String },
    /// 文件列表：返回文件路径数组
    Files { paths: Vec<String> },
    /// 纯文本
    Text { content: String },
    /// HTML 内容
    Html { content: String, plain_text: Option<String> },
    /// 剪贴板为空
    Empty,
}

/// 读取剪贴板响应
#[derive(Debug, Serialize)]
pub struct ReadClipboardResponse {
    pub content: ClipboardContent,
}

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
