mod app_state;
mod commands;
mod db;
mod error;
mod services;
mod utils;
mod window;

use std::fs;
use std::path::Path;
use std::sync::Arc;

use tauri::Manager;
use tokio::sync::Mutex;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub use app_state::AppState;
pub use error::{AppError, AppResult};
pub use window::{hide_hud, toggle_hud};

// ========== 命令重导出（按功能分组） ==========

// 资源命令
pub use commands::{
    capture_resource, get_all_resources, get_assets_path, get_resource_by_id,
    hard_delete_resource_command, process_pending_resources_command,
    soft_delete_resource_command, update_resource_content_command,
    update_resource_summary_command, update_resource_title_command,
    update_resource_user_note_command,
};

// 任务命令
pub use commands::{
    create_task, get_active_tasks, get_all_tasks, get_tasks_by_date,
    hard_delete_task_command, mark_task_as_cancelled_command, mark_task_as_done_command,
    mark_task_as_todo_command, soft_delete_task_command, update_task_description_command,
    update_task_due_date_command, update_task_priority_command, update_task_summary_command,
    update_task_title_command,
};

// 主题命令
pub use commands::{
    create_topic, get_resource_topics_command, get_task_topics_command, get_topic_command,
    get_topic_resources_command, get_topic_tasks_command, hard_delete_topic_command,
    link_resource_to_topic_command, link_task_to_topic_command, list_topics_command,
    soft_delete_topic_command, unlink_resource_from_topic_command, unlink_task_from_topic_command,
    update_topic_favourite_command, update_topic_resource_review_status_command,
    update_topic_summary_command, update_topic_title_command,
};

// 节点命令
pub use commands::{
    convert_resource_to_task_command, convert_resource_to_topic_command,
    convert_task_to_topic_command, convert_topic_to_task_command, list_node_revision_logs,
    list_pinned_nodes, list_unreviewed_nodes, update_node_pinned, update_node_review_status,
};

// 边命令
pub use commands::{
    confirm_edge_command, link_nodes_command, list_all_edges_command,
    list_edges_for_target_command, list_source_nodes_command, list_target_nodes_command,
    unlink_nodes_command,
};

// 搜索命令
pub use commands::{search_keyword, search_semantic, warmup_embedding};

// 聊天命令
pub use commands::{
    add_message_attachments, create_chat_message, create_chat_session, delete_chat_message,
    delete_chat_session, get_chat_session, list_chat_messages_command, list_chat_sessions,
    list_message_attachments_command, list_session_bound_resources_command,
    remove_message_attachment, send_chat_message, set_session_bindings_command,
    update_chat_message, update_chat_session_command,
};

// AI 配置命令
pub use commands::{
    get_ai_config_status, remove_api_key, save_api_key, set_classification_mode,
    set_processing_provider_model,
};

// 其他命令
pub use commands::{get_dashboard, read_clipboard};

// ========== 内部命令 ==========

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ========== 初始化 ==========

fn init_tracing(log_dir: &Path) {
    let mut env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));
    for directive in ["sqlx=off", "sqlx::query=off", "sqlx::query::summary=off"] {
        if let Ok(parsed) = directive.parse() {
            env_filter = env_filter.add_directive(parsed);
        }
    }
    let log_path = log_dir.join("neuralvault.log");

    let file_layer = match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        Ok(_) => {
            let file_path = log_path.clone();
            Some(
                tracing_subscriber::fmt::layer()
                    .with_target(false)
                    .with_ansi(false)
                    .with_writer(move || -> Box<dyn std::io::Write + Send> {
                        match std::fs::OpenOptions::new()
                            .create(true)
                            .append(true)
                            .open(&file_path)
                        {
                            Ok(file) => Box::new(file),
                            Err(_) => Box::new(std::io::sink()),
                        }
                    }),
            )
        }
        Err(err) => {
            eprintln!(
                "Failed to open log file {}: {err}",
                log_path.display()
            );
            None
        }
    };

    let stdout_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_writer(std::io::stdout);

    if let Some(layer) = file_layer {
        let _ = tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .with(layer)
            .try_init();
    } else {
        let _ = tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .try_init();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ========== 数据库初始化 ==========
            let app_dir = app // 整个应用程序的运行时句柄
                // 返回一个路径解析器 (Path Resolver) 实例
                .path()
                // 调用 Tauri 的 API 获取操作系统标准的"应用数据目录"
                .app_data_dir()
                // 把 TauriError 转成 std::io::Error
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

            // 标准库 std::fs 的操作。如果目录不存在，就创建它；如果已存在，则什么都不做
            fs::create_dir_all(&app_dir)?;

            let log_dir = app_dir.join("logs");
            fs::create_dir_all(&log_dir)?;
            init_tracing(&log_dir);

            // 安全地将文件名拼接到目录后面，生成数据库文件的完整绝对路径
            let db_path = app_dir.join("neuralvault.sqlite3");
            // 强制阻塞当前线程，直到数据库连接池初始化完成
            let pool = tauri::async_runtime::block_on(db::init_pool(&db_path))?;

            // ========== AI 配置服务初始化 ==========
            let ai_config_service = services::AIConfigService::new(&app_dir)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            // 初始化好的 AppState（包含数据库连接池和 AI 服务）注入到 Tauri 的全局管理器中
            let ai_config = Arc::new(Mutex::new(ai_config_service));
            let ai_handle = services::AiServicesHandle::new_pending();

            // 异步初始化 AI 服务
            let ai_handle_init = ai_handle.clone();
            let app_dir_for_ai = app_dir.clone();
            tauri::async_runtime::spawn(async move {
                let config_service = match services::AIConfigService::new(&app_dir_for_ai) {
                    Ok(service) => service,
                    Err(err) => {
                        tracing::error!(error = %err, "AI config init failed");
                        ai_handle_init.set_error(err);
                        return;
                    }
                };

                match services::AiServices::new(&config_service).await {
                    Ok(services) => {
                        ai_handle_init.set_ready(Arc::new(services));
                        tracing::info!("AI services ready");
                    }
                    Err(err) => {
                        tracing::error!(error = %err, "AI services init failed");
                        ai_handle_init.set_error(err);
                    }
                }
            });

            // ========== AI Pipeline 初始化 ==========
            let ai_pipeline = Arc::new(services::AiPipeline::new(
                pool.clone(),
                ai_handle.clone(),
                ai_config.clone(),
                app_dir.clone(),
                app.handle().clone(),
            ));

            app.manage(AppState {
                db: pool,
                ai: ai_handle,
                ai_config,
                ai_pipeline,
            });

            // 重启后重新入队待处理资源
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let db = state.db.clone();
                    let pipeline = state.ai_pipeline.clone();
                    match pipeline.enqueue_pending_resources(&db).await {
                        Ok(count) => {
                            tracing::info!(requeued = count, "Requeued resources after restart");
                        }
                        Err(err) => {
                            tracing::error!(error = %err, "Failed to requeue resources after restart");
                        }
                    }
                }
            });

            // ========== HUD 窗口设置 ==========
            window::setup_hud(app)?;

            Ok(())
        })
        // 初始化 Shell 插件。允许你的 Rust 代码或前端代码执行系统命令（如打开终端、运行脚本）
        .plugin(tauri_plugin_shell::init())
        // 初始化 Opener 插件。用于调用系统默认程序打开文件或 URL（例如用默认浏览器打开网页）
        .plugin(tauri_plugin_opener::init())
        // 初始化全局快捷键插件。允许你的 Rust 代码或前端代码注册和监听全局快捷键（如 Ctrl+C、Alt+Space 等）
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 生成命令处理函数。把所有命令函数注册到 Tauri 的事件系统中，方便前端 JavaScript 代码调用
        .invoke_handler(tauri::generate_handler![
            // 系统
            greet,
            toggle_hud,
            hide_hud,
            read_clipboard,
            get_assets_path,
            get_dashboard,
            // 资源
            capture_resource,
            get_all_resources,
            get_resource_by_id,
            update_resource_content_command,
            update_resource_title_command,
            update_resource_summary_command,
            update_resource_user_note_command,
            soft_delete_resource_command,
            hard_delete_resource_command,
            process_pending_resources_command,
            // 任务
            create_task,
            get_all_tasks,
            get_active_tasks,
            get_tasks_by_date,
            update_task_title_command,
            update_task_description_command,
            update_task_summary_command,
            update_task_priority_command,
            update_task_due_date_command,
            mark_task_as_done_command,
            mark_task_as_todo_command,
            mark_task_as_cancelled_command,
            soft_delete_task_command,
            hard_delete_task_command,
            // 主题
            create_topic,
            get_topic_command,
            list_topics_command,
            update_topic_title_command,
            update_topic_summary_command,
            update_topic_favourite_command,
            soft_delete_topic_command,
            hard_delete_topic_command,
            link_resource_to_topic_command,
            unlink_resource_from_topic_command,
            update_topic_resource_review_status_command,
            get_topic_resources_command,
            get_resource_topics_command,
            link_task_to_topic_command,
            unlink_task_from_topic_command,
            get_topic_tasks_command,
            get_task_topics_command,
            // 节点
            list_pinned_nodes,
            list_unreviewed_nodes,
            update_node_review_status,
            update_node_pinned,
            list_node_revision_logs,
            convert_resource_to_topic_command,
            convert_resource_to_task_command,
            convert_topic_to_task_command,
            convert_task_to_topic_command,
            // 边
            link_nodes_command,
            unlink_nodes_command,
            list_target_nodes_command,
            list_source_nodes_command,
            confirm_edge_command,
            list_edges_for_target_command,
            list_all_edges_command,
            // 搜索
            search_semantic,
            search_keyword,
            warmup_embedding,
            // 聊天
            send_chat_message,
            create_chat_session,
            get_chat_session,
            list_chat_sessions,
            update_chat_session_command,
            delete_chat_session,
            create_chat_message,
            list_chat_messages_command,
            list_message_attachments_command,
            list_session_bound_resources_command,
            update_chat_message,
            delete_chat_message,
            add_message_attachments,
            remove_message_attachment,
            set_session_bindings_command,
            // AI 配置
            get_ai_config_status,
            save_api_key,
            remove_api_key,
            set_processing_provider_model,
            set_classification_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
