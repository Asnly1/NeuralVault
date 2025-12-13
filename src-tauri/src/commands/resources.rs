use std::{fs, path::Path};

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    db::{
        link_resource_to_task, list_resources_for_task,
        unlink_resource_from_task, LinkResourceParams, NewResource, ResourceClassificationStatus,
        ResourceProcessingStage, ResourceSyncStatus, SourceMeta, VisibilityScope,
    },
    utils::{compute_sha256, get_assets_dir, get_extension, notify_python, parse_file_type},
};

use super::{
    CaptureRequest, CaptureResponse, LinkResourceRequest, LinkResourceResponse,
    TaskResourcesResponse,
};

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

/// 获取 assets 目录的完整路径
/// 
/// 用于前端将相对路径（如 "assets/xxx.png"）转换为完整路径
#[tauri::command]
pub fn get_assets_path(app: AppHandle) -> Result<String, String> {
    let assets_dir = get_assets_dir(&app)?;
    assets_dir
        .to_str()
        .ok_or_else(|| "无法转换路径为字符串".to_string())
        .map(|s| s.to_string())
}

/// 软删除资源
/// 
/// 将资源标记为已删除（is_deleted = 1, deleted_at = 当前时间）
/// 不会物理删除数据库记录和文件
#[tauri::command]
pub async fn soft_delete_resource_command(
    state: State<'_, AppState>,
    resource_id: i64,
) -> Result<LinkResourceResponse, String> {
    let pool = &state.db;

    crate::db::soft_delete_resource(pool, resource_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(LinkResourceResponse { success: true })
}

/// 硬删除资源（物理删除数据库记录、级联数据和文件）
/// 
/// 会删除：
/// - 数据库记录和级联数据（task_resource_link, context_chunks）
/// - assets 目录中的物理文件（如果存在）
#[tauri::command]
pub async fn hard_delete_resource_command(
    app: AppHandle,
    state: State<'_, AppState>,
    resource_id: i64,
) -> Result<LinkResourceResponse, String> {
    let pool = &state.db;

    // 1. 先获取资源信息，以便删除物理文件
    let resource = crate::db::get_resource_by_id(pool, resource_id)
        .await
        .map_err(|e| format!("获取资源失败: {}", e))?;

    // 2. 删除数据库记录（会级联删除关联记录和分块）
    crate::db::hard_delete_resource(pool, resource_id)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 删除物理文件（如果存在）
    if let Some(file_path) = resource.file_path {
        if file_path.starts_with("assets/") {
            let assets_dir = get_assets_dir(&app)?;
            let file_name = file_path.strip_prefix("assets/").unwrap_or(&file_path);
            let full_path = assets_dir.join(file_name);

            // 尝试删除文件，失败不影响主流程
            if full_path.exists() {
                if let Err(e) = fs::remove_file(&full_path) {
                    eprintln!("删除文件失败（已删除数据库记录）: {}", e);
                }
            }
        }
    }

    Ok(LinkResourceResponse { success: true })
}
