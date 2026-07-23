mod db;

use db::{AppState, ExportBundle, WorldRow, WorldDetail, ObservationInput, StatsSnapshot};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("pw-decay-hunter.db");
            let state = AppState::new(db_path).expect("database init");
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_worlds,
            get_world_detail,
            save_world_with_observation,
            delete_world,
            get_stats,
            export_database,
            import_database,
            list_owner_worlds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn list_worlds(state: tauri::State<'_, AppState>) -> Result<Vec<WorldRow>, String> {
    state.list_worlds().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_world_detail(state: tauri::State<'_, AppState>, world_id: i64) -> Result<WorldDetail, String> {
    state.get_world_detail(world_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_world_with_observation(
    state: tauri::State<'_, AppState>,
    payload: ObservationInput,
) -> Result<WorldDetail, String> {
    state.save_world_with_observation(payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_world(state: tauri::State<'_, AppState>, world_id: i64) -> Result<(), String> {
    state.delete_world(world_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, AppState>) -> Result<StatsSnapshot, String> {
    state.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
fn export_database(state: tauri::State<'_, AppState>) -> Result<ExportBundle, String> {
    state.export_all().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_database(state: tauri::State<'_, AppState>, bundle: ExportBundle) -> Result<(), String> {
    state.import_all(bundle).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_owner_worlds(
    state: tauri::State<'_, AppState>,
    owner_name: String,
) -> Result<Vec<WorldRow>, String> {
    state.list_owner_worlds(&owner_name).map_err(|e| e.to_string())
}
