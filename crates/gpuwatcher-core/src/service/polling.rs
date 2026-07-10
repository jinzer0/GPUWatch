use crate::error::AppError;
use crate::models::{ConnectionTestResultDto, Server};
use crate::repository::now_string;
use crate::state::AppState;

use super::collector::SnapshotCollector;
use super::results::{discarded_result, error_result};

pub async fn refresh_server(
    state: &AppState,
    id: String,
) -> Result<ConnectionTestResultDto, AppError> {
    refresh_server_with_collector(state, &state.runner, id).await
}

pub(super) async fn refresh_server_with_collector<C>(
    state: &AppState,
    collector: &C,
    id: String,
) -> Result<ConnectionTestResultDto, AppError>
where
    C: SnapshotCollector + ?Sized,
{
    if !state.scheduler.try_start(&id) {
        return Ok(ConnectionTestResultDto {
            ok: false,
            status: "polling".to_string(),
            error_type: Some("poll_already_running".to_string()),
            message: Some("poll already running for this server or global cap reached".to_string()),
        });
    }

    let _slot = state.scheduler.guard(&id);
    refresh_server_inner_with_collector(state, collector, &id).await
}

pub async fn refresh_server_inner(
    state: &AppState,
    id: &str,
) -> Result<ConnectionTestResultDto, AppError> {
    refresh_server_inner_with_collector(state, &state.runner, id).await
}

async fn refresh_server_inner_with_collector<C>(
    state: &AppState,
    collector: &C,
    id: &str,
) -> Result<ConnectionTestResultDto, AppError>
where
    C: SnapshotCollector + ?Sized,
{
    let server = {
        let repository = state.repository()?;
        let server = repository
            .get_server(id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))?;
        if !server.enabled {
            return Ok(ConnectionTestResultDto {
                ok: false,
                status: "disabled".to_string(),
                error_type: Some("server_disabled".to_string()),
                message: Some("server is disabled".to_string()),
            });
        }
        server
    };

    poll_server_owned_with_collector(state, collector, server).await
}

pub async fn poll_server_owned(
    state: &AppState,
    server: Server,
) -> Result<ConnectionTestResultDto, AppError> {
    poll_server_owned_with_collector(state, &state.runner, server).await
}

pub(super) async fn poll_server_owned_with_collector<C>(
    state: &AppState,
    collector: &C,
    server: Server,
) -> Result<ConnectionTestResultDto, AppError>
where
    C: SnapshotCollector + ?Sized,
{
    let started_at = now_string();
    let id = server.id.clone();
    let config_revision = server.config_revision;

    {
        let repository = state.repository()?;
        if !repository.poll_target_current(&id, config_revision)? {
            return Ok(discarded_result());
        }
        repository.mark_poll_started(&id, &started_at)?;
    }

    match collector.collect_snapshot(state, &server).await {
        Ok((raw_json, success)) => {
            let finished_at = now_string();
            let repository = state.repository()?;
            if !repository.poll_target_current(&id, config_revision)? {
                return Ok(discarded_result());
            }
            repository.store_success(&id, &raw_json, &success, &finished_at)?;
            Ok(ConnectionTestResultDto {
                ok: true,
                status: "online".to_string(),
                error_type: None,
                message: Some("snapshot stored".to_string()),
            })
        }
        Err(error) => store_failure_if_current(state, &id, config_revision, error),
    }
}

fn store_failure_if_current(
    state: &AppState,
    id: &str,
    config_revision: i64,
    error: AppError,
) -> Result<ConnectionTestResultDto, AppError> {
    let finished_at = now_string();
    let repository = state.repository()?;
    if !repository.poll_target_current(id, config_revision)? {
        return Ok(discarded_result());
    }
    repository.store_failure(id, &error, &finished_at)?;
    Ok(error_result(error))
}
