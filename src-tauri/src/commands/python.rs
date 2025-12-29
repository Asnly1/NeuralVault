use tauri::State;
use crate::app_state::AppState;

#[tauri::command]
pub async fn check_python_health(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    state.python.check_health().await
}

#[tauri::command]
pub fn is_python_running(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.python.is_running())
}

/// 获取 Python 后端动态分配的端口
/// 
/// 前端通过此命令获取端口号，用于建立 WebSocket 连接
#[tauri::command]
pub fn get_python_port(state: State<'_, AppState>) -> Result<u16, String> {
    Ok(state.python.get_port())
}
