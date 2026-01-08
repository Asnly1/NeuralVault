// Tauri 命令模块
//
// 提供前端可调用的所有命令函数。

mod ai_config;
mod clipboard;
mod dashboard;
mod python;
mod chat;
mod edges;
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

pub use ai_config::*;
pub use clipboard::*;
pub use dashboard::*;
pub use python::*;
pub use chat::*;
pub use edges::*;
pub use resources::*;
pub use search::*;
pub use tasks::*;
pub use topics::*;
pub use types::*;
