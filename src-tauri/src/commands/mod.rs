//! Tauri 命令模块
//!
//! 提供前端可调用的所有命令函数。
//! 按功能分组导出，便于维护和查找。

mod ai_config;
mod chat;
mod chat_stream;
mod clipboard;
mod dashboard;
mod edges;
mod nodes;
mod resources;
mod search;
mod tasks;
mod topics;
mod types;

// ========== 简单命令宏 ==========
// 这些宏用于生成重复模式的 Tauri 命令，减少样板代码

/// 生成简单的 Tauri 命令（调用单个 db 函数，返回 ()）
///
/// 使用 `AppResult` 返回类型，自动将 `sqlx::Error` 转换为 `AppError`。
///
/// 用法: `simple_void_command!(command_name, db_function, param1: Type1, param2: Type2);`
#[macro_export]
macro_rules! simple_void_command {
    // 1 个参数版本
    ($cmd_name:ident, $db_fn:path, $param1:ident : $ty1:ty) => {
        #[tauri::command]
        pub async fn $cmd_name(
            state: tauri::State<'_, crate::AppState>,
            $param1: $ty1,
        ) -> crate::AppResult<()> {
            Ok($db_fn(&state.db, $param1).await?)
        }
    };
    // 2 个参数版本
    ($cmd_name:ident, $db_fn:path, $param1:ident : $ty1:ty, $param2:ident : $ty2:ty) => {
        #[tauri::command]
        pub async fn $cmd_name(
            state: tauri::State<'_, crate::AppState>,
            $param1: $ty1,
            $param2: $ty2,
        ) -> crate::AppResult<()> {
            Ok($db_fn(&state.db, $param1, $param2).await?)
        }
    };
    // 3 个参数版本
    ($cmd_name:ident, $db_fn:path, $param1:ident : $ty1:ty, $param2:ident : $ty2:ty, $param3:ident : $ty3:ty) => {
        #[tauri::command]
        pub async fn $cmd_name(
            state: tauri::State<'_, crate::AppState>,
            $param1: $ty1,
            $param2: $ty2,
            $param3: $ty3,
        ) -> crate::AppResult<()> {
            Ok($db_fn(&state.db, $param1, $param2, $param3).await?)
        }
    };
}

// ========== 类型导出 ==========
pub use types::*;

// ========== 资源命令 ==========
pub use resources::{
    capture_resource, get_all_resources, get_assets_path, get_resource_by_id,
    hard_delete_resource_command, process_pending_resources_command,
    soft_delete_resource_command, update_resource_content_command,
    update_resource_summary_command, update_resource_title_command,
    update_resource_user_note_command,
};

// ========== 任务命令 ==========
pub use tasks::{
    create_task, get_active_tasks, get_all_tasks, get_tasks_by_date,
    hard_delete_task_command, mark_task_as_cancelled_command, mark_task_as_done_command,
    mark_task_as_todo_command, soft_delete_task_command, update_task_description_command,
    update_task_due_date_command, update_task_priority_command, update_task_summary_command,
    update_task_title_command,
};

// ========== 主题命令 ==========
pub use topics::{
    create_topic, get_resource_topics_command, get_task_topics_command, get_topic_command,
    get_topic_resources_command, get_topic_tasks_command, hard_delete_topic_command,
    link_resource_to_topic_command, link_task_to_topic_command, list_topics_command,
    soft_delete_topic_command, unlink_resource_from_topic_command, unlink_task_from_topic_command,
    update_topic_favourite_command, update_topic_resource_review_status_command,
    update_topic_summary_command, update_topic_title_command,
};

// ========== 节点命令 ==========
pub use nodes::{
    convert_resource_to_task_command, convert_resource_to_topic_command,
    convert_task_to_topic_command, convert_topic_to_task_command, list_node_revision_logs,
    list_pinned_nodes, list_unreviewed_nodes, update_node_pinned, update_node_review_status,
};

// ========== 边命令 ==========
pub use edges::{
    confirm_edge_command, link_nodes_command, list_edges_for_target_command,
    list_source_nodes_command, list_target_nodes_command, unlink_nodes_command,
};

// ========== 搜索命令 ==========
pub use search::{search_keyword, search_semantic, warmup_embedding};

// ========== 聊天命令 ==========
pub use chat::{
    add_message_attachments, create_chat_message, create_chat_session, delete_chat_message,
    delete_chat_session, get_chat_session, list_chat_messages_command, list_chat_sessions,
    list_message_attachments_command, list_session_bound_resources_command,
    remove_message_attachment, set_session_bindings_command, update_chat_message,
    update_chat_session_command,
};
pub use chat_stream::send_chat_message;

// ========== AI 配置命令 ==========
pub use ai_config::{
    get_ai_config_status, remove_api_key, save_api_key, set_classification_mode,
    set_processing_provider_model,
};

// ========== 其他命令 ==========
pub use clipboard::read_clipboard;
pub use dashboard::get_dashboard;
