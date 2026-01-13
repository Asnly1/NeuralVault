mod app_state;
mod commands;
mod db;
mod error;
mod services;
mod utils;
mod window;

use std::fs;
use std::sync::Arc;

use tauri::{Manager};
use tokio::sync::Mutex;
use tracing_subscriber::EnvFilter;

pub use app_state::AppState;
pub use error::{AppError, AppResult};
pub use commands::{
    capture_resource, get_all_resources, get_resource_by_id, get_assets_path, get_dashboard,
    create_task, soft_delete_task_command, hard_delete_task_command, mark_task_as_done_command,
    mark_task_as_todo_command, mark_task_as_cancelled_command, update_task_priority_command, update_task_due_date_command,
    update_task_title_command, update_task_description_command, update_task_summary_command,
    get_tasks_by_date, get_all_tasks, get_active_tasks,
    update_resource_content_command, update_resource_title_command, update_resource_summary_command,
    update_resource_user_note_command,
    soft_delete_resource_command, hard_delete_resource_command,
    process_pending_resources_command,
    link_nodes_command, unlink_nodes_command, list_target_nodes_command, list_source_nodes_command,
    read_clipboard, get_ai_config_status, save_api_key,
    remove_api_key, set_processing_provider_model, set_classification_mode, send_chat_message, create_chat_session, get_chat_session,
    list_chat_sessions, update_chat_session_command, delete_chat_session, create_chat_message,
    list_chat_messages_command, list_message_attachments_command, list_session_bound_resources_command,
    update_chat_message, delete_chat_message, add_message_attachments, remove_message_attachment,
    set_session_bindings_command,
    // Topic commands
    create_topic, get_topic_command, list_topics_command,
    update_topic_title_command, update_topic_summary_command, update_topic_favourite_command,
    soft_delete_topic_command, hard_delete_topic_command,
    link_resource_to_topic_command, unlink_resource_from_topic_command,
    update_topic_resource_review_status_command, get_topic_resources_command, get_resource_topics_command,
    link_task_to_topic_command, unlink_task_from_topic_command, get_topic_tasks_command, get_task_topics_command,
    // Search commands
    search_semantic, search_keyword, warmup_embedding,
    // Node commands
    list_pinned_nodes, list_unreviewed_nodes, update_node_review_status, update_node_pinned,
    list_node_revision_logs, convert_resource_to_topic_command, convert_resource_to_task_command,
    convert_topic_to_task_command, convert_task_to_topic_command,
    confirm_edge_command, list_edges_for_target_command,
};
pub use window::{hide_hud, toggle_hud};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn init_tracing() {
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_writer(std::io::stdout)
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

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

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let db = state.db.clone();
                    let pipeline = state.ai_pipeline.clone();
                    match pipeline.enqueue_pending_resources(&db).await {
                        Ok(count) => {
                            tracing::info!(
                                requeued = count,
                                "Requeued resources after restart"
                            );
                        }
                        Err(err) => {
                            tracing::error!(
                                error = %err,
                                "Failed to requeue resources after restart"
                            );
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
        // 初始化全局快捷键插件
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 注册前端（JavaScript）可以调用的 Rust 函数
        .invoke_handler(tauri::generate_handler![
            greet,
            capture_resource,
            create_task,
            soft_delete_task_command,
            hard_delete_task_command,
            soft_delete_resource_command,
            hard_delete_resource_command,
            process_pending_resources_command,
            get_dashboard,
            get_all_resources,
            get_resource_by_id,
            link_nodes_command,
            unlink_nodes_command,
            list_target_nodes_command,
            list_source_nodes_command,
            toggle_hud,
            hide_hud,
            read_clipboard,
            get_assets_path,
            mark_task_as_done_command,
            mark_task_as_todo_command,
            mark_task_as_cancelled_command,
            update_task_priority_command,
            update_task_due_date_command,
            update_task_title_command,
            update_task_description_command,
            update_task_summary_command,
            update_resource_summary_command,
            get_tasks_by_date,
            get_all_tasks,
            get_active_tasks,
            update_resource_content_command,
            update_resource_title_command,
            update_resource_user_note_command,
            get_ai_config_status,
            save_api_key,
            remove_api_key,
            set_processing_provider_model,
            set_classification_mode,
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
            // Topic commands
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
            // Search commands
            search_semantic,
            search_keyword,
            warmup_embedding,
            // Node commands
            list_pinned_nodes,
            list_unreviewed_nodes,
            update_node_review_status,
            update_node_pinned,
            list_node_revision_logs,
            convert_resource_to_topic_command,
            convert_resource_to_task_command,
            convert_topic_to_task_command,
            convert_task_to_topic_command,
            confirm_edge_command,
            list_edges_for_target_command
        ])
        // 启动应用
        // tauri::generate_context!()：这个宏会读取你的 tauri.conf.json 配置文件，并在编译时将其转化为代码。它告诉构建器应用的名称、版本、图标等信息。
        // 一旦调用 .run()，程序就会进入事件循环（Event Loop），直到你关闭窗口，程序才会退出。
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
