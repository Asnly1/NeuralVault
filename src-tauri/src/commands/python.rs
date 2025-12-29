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
