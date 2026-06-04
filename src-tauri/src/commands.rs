use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::command_runner::SystemSshRunner;
use crate::error::AppError;
use crate::models::{
    ConnectionTestResultDto, GpuHistoryResponseDto, ParsedCollectorPayload, ProcessRowDto, Server,
    ServerDetailDto, ServerInput, ServerOverviewDto, SuccessEnvelope,
};
use crate::no_install_collector::collect_no_install_snapshot;
use crate::protocol::parse_collector_json;
use crate::read_model::{build_overview, build_process_rows, build_server_detail};
use crate::repository::now_string;
use crate::state::AppState;

type SnapshotFuture<'a> =
    Pin<Box<dyn Future<Output = Result<(String, SuccessEnvelope), AppError>> + Send + 'a>>;

trait SnapshotCollector {
    fn collect_snapshot<'a>(
        &'a self,
        state: &'a AppState,
        server: &'a Server,
    ) -> SnapshotFuture<'a>;
}

impl SnapshotCollector for SystemSshRunner {
    fn collect_snapshot<'a>(
        &'a self,
        _state: &'a AppState,
        server: &'a Server,
    ) -> SnapshotFuture<'a> {
        Box::pin(collect_no_install_snapshot(self, server))
    }
}

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
                    let _ = poll_server_owned(state.inner(), server).await;
                    state.scheduler.finish(&server_id);
                });
            }
        }
    });
}

#[tauri::command]
pub fn initialize_app(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    list_overview(state)
}

#[tauri::command]
pub fn list_servers(state: State<'_, AppState>) -> Result<Vec<Server>, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    repository.list_servers()
}

#[tauri::command]
pub fn save_server(state: State<'_, AppState>, input: ServerInput) -> Result<Server, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    repository.save_server(input)
}

#[tauri::command]
pub fn delete_server(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    repository.delete_server(&id)
}

#[tauri::command]
pub fn set_server_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Server, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    repository.set_server_enabled(&id, enabled)
}

#[tauri::command]
pub fn seed_demo_data(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    let raw = include_str!("../../fixtures/protocol/v1/success_multi_gpu.json");
    {
        let repository = state.repository.lock().expect("repository mutex poisoned");
        let mut servers = repository.list_servers()?;
        let server = if let Some(existing) = servers.pop() {
            existing
        } else {
            repository.save_server(ServerInput {
                id: None,
                name: "Demo GPU Server".to_string(),
                host: "demo.local".to_string(),
                port: 22,
                username: "demo".to_string(),
                ssh_key_path: None,
                polling_interval_seconds: None,
                enabled: true,
            })?
        };
        let ParsedCollectorPayload::Success(success) = parse_collector_json(raw)? else {
            return Err(AppError::new(
                "protocol",
                "protocol_schema_invalid",
                "demo fixture was not a success envelope",
            ));
        };
        repository.store_success(&server.id, raw, &success, &now_string())?;
    }
    list_overview(state)
}

#[tauri::command]
pub fn list_overview(state: State<'_, AppState>) -> Result<Vec<ServerOverviewDto>, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    let servers = repository.list_servers()?;
    let health = repository.all_health()?;
    let snapshots = repository.all_latest_snapshots()?;
    build_overview(&servers, &health, &snapshots)
}

#[tauri::command]
pub fn get_server_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<ServerDetailDto>, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    let Some(server) = repository.get_server(&id)? else {
        return Ok(None);
    };
    let health = repository.get_health(&id)?;
    let snapshot = repository.latest_snapshot(&id)?;
    build_server_detail(server, health, snapshot).map(Some)
}

#[tauri::command]
pub fn list_processes(state: State<'_, AppState>) -> Result<Vec<ProcessRowDto>, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    let servers = repository.list_servers()?;
    let health = repository.all_health()?;
    let snapshots = repository.all_latest_snapshots()?;
    build_process_rows(&servers, &health, &snapshots)
}

#[tauri::command]
pub fn list_gpu_history(
    state: State<'_, AppState>,
    server_id: String,
    gpu_index: Option<i64>,
    gpu_uuid: Option<String>,
    range: String,
) -> Result<GpuHistoryResponseDto, AppError> {
    let repository = state.repository.lock().expect("repository mutex poisoned");
    repository.list_gpu_history(&server_id, gpu_index, gpu_uuid, &range, &now_string())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionTestResultDto, AppError> {
    let server = {
        let repository = state.repository.lock().expect("repository mutex poisoned");
        repository
            .get_server(&id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))?
    };
    match state.runner.collect_snapshot(state.inner(), &server).await {
        Ok((_raw_json, _success)) => Ok(ConnectionTestResultDto {
            ok: true,
            status: "online".to_string(),
            error_type: None,
            message: Some("no-install snapshot collection succeeded".to_string()),
        }),
        Err(error) => Ok(error_result(error)),
    }
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

    let result = refresh_server_inner(state.inner(), &id).await;
    state.scheduler.finish(&id);
    result
}

async fn refresh_server_inner(
    state: &AppState,
    id: &str,
) -> Result<ConnectionTestResultDto, AppError> {
    let server = {
        let repository = state.repository.lock().expect("repository mutex poisoned");
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

    poll_server_owned(state, server).await
}

pub async fn poll_server_owned(
    state: &AppState,
    server: Server,
) -> Result<ConnectionTestResultDto, AppError> {
    poll_server_owned_with_collector(state, &state.runner, server).await
}

async fn poll_server_owned_with_collector<C>(
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
        let repository = state.repository.lock().expect("repository mutex poisoned");
        if !repository.poll_target_current(&id, config_revision)? {
            return Ok(discarded_result());
        }
        repository.mark_poll_started(&id, &started_at)?;
    }

    match collector.collect_snapshot(state, &server).await {
        Ok((raw_json, success)) => {
            let finished_at = now_string();
            let repository = state.repository.lock().expect("repository mutex poisoned");
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
    let repository = state.repository.lock().expect("repository mutex poisoned");
    if !repository.poll_target_current(id, config_revision)? {
        return Ok(discarded_result());
    }
    repository.store_failure(id, &error, &finished_at)?;
    Ok(error_result(error))
}

fn discarded_result() -> ConnectionTestResultDto {
    ConnectionTestResultDto {
        ok: false,
        status: "stale_discarded".to_string(),
        error_type: Some("stale_poll_discarded".to_string()),
        message: Some("poll result was discarded because server configuration changed".to_string()),
    }
}

fn error_result(error: AppError) -> ConnectionTestResultDto {
    ConnectionTestResultDto {
        ok: false,
        status: if error.layer == "transport_ssh" {
            "offline"
        } else {
            "error"
        }
        .to_string(),
        error_type: Some(error.error_type),
        message: Some(error.message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    enum MockOutcome {
        Success(String, SuccessEnvelope),
        Error(AppError),
        UpdateServerBeforeSuccess(ServerInput, String, SuccessEnvelope),
    }

    struct MockCollector {
        outcome: MockOutcome,
    }

    impl SnapshotCollector for MockCollector {
        fn collect_snapshot<'a>(
            &'a self,
            state: &'a AppState,
            _server: &'a Server,
        ) -> SnapshotFuture<'a> {
            Box::pin(async move {
                match &self.outcome {
                    MockOutcome::Success(raw_json, success) => {
                        Ok((raw_json.clone(), success.clone()))
                    }
                    MockOutcome::Error(error) => Err(error.clone()),
                    MockOutcome::UpdateServerBeforeSuccess(input, raw_json, success) => {
                        let repository =
                            state.repository.lock().expect("repository mutex poisoned");
                        repository.save_server(input.clone())?;
                        Ok((raw_json.clone(), success.clone()))
                    }
                }
            })
        }
    }

    fn test_state() -> AppState {
        AppState::new(crate::repository::Repository::in_memory().expect("repository"))
    }

    fn server_input(id: Option<String>, name: &str) -> ServerInput {
        ServerInput {
            id,
            name: name.to_string(),
            host: "gpu.example.test".to_string(),
            port: 22,
            username: "alice".to_string(),
            ssh_key_path: None,
            polling_interval_seconds: Some(30),
            enabled: true,
        }
    }

    fn save_test_server(state: &AppState) -> Server {
        let repository = state.repository.lock().expect("repository mutex poisoned");
        repository
            .save_server(server_input(None, "Lab GPU"))
            .expect("server")
    }

    fn success_snapshot() -> (String, SuccessEnvelope) {
        let fixture = include_str!("../../fixtures/protocol/v1/success_multi_gpu.json");
        let ParsedCollectorPayload::Success(success) =
            parse_collector_json(fixture).expect("fixture")
        else {
            panic!("expected success fixture");
        };
        let raw_json = serde_json::to_string(&success).expect("raw json");
        (raw_json, success)
    }

    #[test]
    fn polling_runtime_does_not_reference_legacy_command_execution() {
        let source = include_str!("commands.rs");
        let legacy_column = ["collector", "_command"].concat();
        let legacy_runner = ["run", "_collector"].concat();
        let legacy_binary = ["gpuwatcher", " --json"].concat();

        assert!(!source.contains(&legacy_column));
        assert!(!source.contains(&legacy_runner));
        assert!(!source.contains(&legacy_binary));
    }

    #[test]
    fn history_command_surface_is_present() {
        let commands_source = include_str!("commands.rs");
        let lib_source = include_str!("lib.rs");

        assert!(commands_source.contains("pub fn list_gpu_history"));
        assert!(commands_source.contains("repository.list_gpu_history"));
        assert!(lib_source.contains("commands::list_gpu_history"));
    }

    #[tokio::test]
    async fn poll_server_stores_synthesized_snapshot_on_success() {
        let state = test_state();
        let server = save_test_server(&state);
        let (raw_json, success) = success_snapshot();
        let collector = MockCollector {
            outcome: MockOutcome::Success(raw_json.clone(), success),
        };

        let result = poll_server_owned_with_collector(&state, &collector, server.clone())
            .await
            .expect("poll result");

        assert!(result.ok);
        assert_eq!(result.status, "online");
        assert_eq!(result.message.as_deref(), Some("snapshot stored"));
        let repository = state.repository.lock().expect("repository mutex poisoned");
        let snapshot = repository
            .latest_snapshot(&server.id)
            .expect("snapshot lookup")
            .expect("snapshot stored");
        assert_eq!(snapshot.raw_json, raw_json);
        assert_eq!(
            repository
                .gpu_history_sample_count(&server.id)
                .expect("history count"),
            2
        );
        let health = repository
            .get_health(&server.id)
            .expect("health lookup")
            .expect("health stored");
        assert_eq!(health.status, "online");
        assert!(health.last_success_at.is_some());
    }

    #[tokio::test]
    async fn poll_server_missing_nvidia_smi_updates_health_as_failure() {
        let state = test_state();
        let server = save_test_server(&state);
        let collector = MockCollector {
            outcome: MockOutcome::Error(AppError::new(
                "collector",
                "nvidia_smi_missing",
                "nvidia-smi not found",
            )),
        };

        let result = poll_server_owned_with_collector(&state, &collector, server.clone())
            .await
            .expect("poll result");

        assert!(!result.ok);
        assert_eq!(result.status, "error");
        assert_eq!(result.error_type.as_deref(), Some("nvidia_smi_missing"));
        let repository = state.repository.lock().expect("repository mutex poisoned");
        assert!(repository
            .latest_snapshot(&server.id)
            .expect("snapshot lookup")
            .is_none());
        assert_eq!(
            repository
                .gpu_history_sample_count(&server.id)
                .expect("history count"),
            0
        );
        let health = repository
            .get_health(&server.id)
            .expect("health lookup")
            .expect("health stored");
        assert_eq!(health.status, "error");
        assert_eq!(
            health.last_error_type.as_deref(),
            Some("nvidia_smi_missing")
        );
    }

    #[tokio::test]
    async fn poll_server_discards_success_when_config_revision_changes() {
        let state = test_state();
        let server = save_test_server(&state);
        let (raw_json, success) = success_snapshot();
        let collector = MockCollector {
            outcome: MockOutcome::UpdateServerBeforeSuccess(
                server_input(Some(server.id.clone()), "Renamed GPU"),
                raw_json,
                success,
            ),
        };

        let result = poll_server_owned_with_collector(&state, &collector, server.clone())
            .await
            .expect("poll result");

        assert!(!result.ok);
        assert_eq!(result.status, "stale_discarded");
        let repository = state.repository.lock().expect("repository mutex poisoned");
        assert!(repository
            .latest_snapshot(&server.id)
            .expect("snapshot lookup")
            .is_none());
        assert_eq!(
            repository
                .gpu_history_sample_count(&server.id)
                .expect("history count"),
            0
        );
        let health = repository
            .get_health(&server.id)
            .expect("health lookup")
            .expect("health stored");
        assert_eq!(health.status, "idle");
        assert!(health.last_poll_started_at.is_some());
        assert!(health.last_poll_finished_at.is_none());
    }
}
