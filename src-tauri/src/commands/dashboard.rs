use tauri::State;

use crate::{
    app_state::AppState,
    db::{list_active_tasks, list_all_resources},
};

use super::{DashboardData};

#[tauri::command]
pub async fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardData, String> {
    let pool = &state.db;
    let tasks = list_active_tasks(pool).await.map_err(|e| e.to_string())?;
    let resources = list_all_resources(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(DashboardData { tasks, resources })
}