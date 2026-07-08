use crate::error::AppError;
use crate::models::{
    GpuHistoryResponseDto, ProcessRowDto, Server, ServerDetailDto, ServerOverviewDto,
};
use crate::read_model::{build_overview, build_process_rows, build_server_detail};
use crate::repository::now_string;
use crate::state::AppState;

pub fn initialize_app(state: &AppState) -> Result<Vec<ServerOverviewDto>, AppError> {
    list_overview(state)
}

pub fn list_servers(state: &AppState) -> Result<Vec<Server>, AppError> {
    let repository = state.repository()?;
    repository.list_servers()
}

pub fn list_overview(state: &AppState) -> Result<Vec<ServerOverviewDto>, AppError> {
    let repository = state.repository()?;
    let servers = repository.list_servers()?;
    let health = repository.all_health()?;
    let snapshots = repository.all_latest_snapshots()?;
    build_overview(&servers, &health, &snapshots)
}

pub fn get_server_detail(
    state: &AppState,
    id: String,
) -> Result<Option<ServerDetailDto>, AppError> {
    let repository = state.repository()?;
    let Some(server) = repository.get_server(&id)? else {
        return Ok(None);
    };
    let health = repository.get_health(&id)?;
    let snapshot = repository.latest_snapshot(&id)?;
    build_server_detail(server, health, snapshot).map(Some)
}

pub fn list_processes(state: &AppState) -> Result<Vec<ProcessRowDto>, AppError> {
    let repository = state.repository()?;
    let servers = repository.list_servers()?;
    let health = repository.all_health()?;
    let snapshots = repository.all_latest_snapshots()?;
    build_process_rows(&servers, &health, &snapshots)
}

pub fn list_gpu_history(
    state: &AppState,
    server_id: String,
    gpu_index: Option<i64>,
    gpu_uuid: Option<String>,
    range: String,
) -> Result<GpuHistoryResponseDto, AppError> {
    let repository = state.repository()?;
    repository.list_gpu_history(&server_id, gpu_index, gpu_uuid, &range, &now_string())
}
