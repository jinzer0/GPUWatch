use std::time::Duration;

use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::{
    ConnectionTestResultDto, GpuHistoryResponseDto, ProcessRowDto, Server, ServerDetailDto,
    ServerInput, ServerOverviewDto,
};
use gpuwatcher_core::service;
use gpuwatcher_core::state::AppState;
use tauri::{AppHandle, Manager, State};

pub fn start_polling_loop(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let due_servers = {
                let state = app_handle.state::<AppState>();
                let repository = state.repository.lock().expect("repository mutex poisoned");
                repository.due_servers()
            };
            let Ok(due_servers) = due_servers else {
                continue;
            };

            for server in due_servers {
                let state = app_handle.state::<AppState>();
                let server_id = server.id.clone();
                if !state.scheduler.try_start(&server_id) {
                    continue;
                }
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<AppState>();
                    let _ = service::poll_server_owned(state.inner(), server).await;
                    state.scheduler.finish(&server_id);
                });
            }
        }
    });
}

#[tauri::command]
pub fn initialize_app(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    service::initialize_app(state.inner())
}

#[tauri::command]
pub fn list_servers(state: State<'_, AppState>) -> Result<Vec<Server>, AppError> {
    service::list_servers(state.inner())
}

#[tauri::command]
pub fn save_server(state: State<'_, AppState>, input: ServerInput) -> Result<Server, AppError> {
    service::save_server(state.inner(), input)
}

#[tauri::command]
pub fn delete_server(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    service::delete_server(state.inner(), id)
}

#[tauri::command]
pub fn set_server_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Server, AppError> {
    service::set_server_enabled(state.inner(), id, enabled)
}

#[tauri::command]
pub fn seed_demo_data(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    service::seed_demo_data(state.inner())
}

#[tauri::command]
pub fn list_overview(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    service::list_overview(state.inner())
}

#[tauri::command]
pub fn get_server_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<ServerDetailDto>, AppError> {
    service::get_server_detail(state.inner(), id)
}

#[tauri::command]
pub fn list_processes(state: State<'_, AppState>) -> Result<Vec<ProcessRowDto>, AppError> {
    service::list_processes(state.inner())
}

#[tauri::command]
pub fn list_gpu_history(
    state: State<'_, AppState>,
    server_id: String,
    gpu_index: Option<i64>,
    gpu_uuid: Option<String>,
    range: String,
) -> Result<GpuHistoryResponseDto, AppError> {
    service::list_gpu_history(state.inner(), server_id, gpu_index, gpu_uuid, range)
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionTestResultDto, AppError> {
    service::test_connection(state.inner(), id).await
}

#[tauri::command]
pub async fn refresh_server(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionTestResultDto, AppError> {
    if !state.scheduler.try_start(&id) {
        return Ok(ConnectionTestResultDto {
            ok: false,
            status: "polling".to_string(),
            error_type: Some("poll_already_running".to_string()),
            message: Some("poll already running for this server or global cap reached".to_string()),
        });
    }

    let result = service::refresh_server_inner(state.inner(), &id).await;
    state.scheduler.finish(&id);
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn tauri_command_surface_is_registered() {
        let commands_source = include_str!("commands.rs");
        let lib_source = include_str!("lib.rs");

        assert!(commands_source.contains("#[tauri::command]"));
        assert!(commands_source.contains("service::list_gpu_history"));
        assert!(lib_source.contains("commands::list_gpu_history"));
    }
}
