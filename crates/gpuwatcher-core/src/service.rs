mod collector;
mod connection;
mod queries;
mod results;
mod seed;
mod writes;

mod polling;

pub use connection::test_connection;
pub use polling::{poll_server_owned, refresh_server, refresh_server_inner};
pub use queries::{
    get_server_detail, initialize_app, list_gpu_history, list_overview, list_processes,
    list_servers,
};
pub use seed::seed_demo_data;
pub use writes::{delete_server, save_server, set_server_enabled};

#[cfg(test)]
use crate::error::AppError;
#[cfg(test)]
use crate::models::{ParsedCollectorPayload, Server, ServerInput, SuccessEnvelope};
#[cfg(test)]
use crate::protocol::parse_collector_json;
#[cfg(test)]
use collector::{SnapshotCollector, SnapshotFuture};
#[cfg(test)]
use polling::{poll_server_owned_with_collector, refresh_server_with_collector};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;

    #[derive(Clone)]
    enum MockOutcome {
        Success(String, SuccessEnvelope),
        Error(AppError),
        UpdateServerBeforeSuccess(ServerInput, String, SuccessEnvelope),
        Pending(Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>),
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
                    MockOutcome::Pending(started) => {
                        if let Some(sender) = started.lock().expect("started mutex poisoned").take()
                        {
                            let _ = sender.send(());
                        }
                        std::future::pending().await
                    }
                }
            })
        }
    }

    use std::sync::{Arc, Mutex};

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
        let fixture = include_str!("../../../fixtures/protocol/v1/success_multi_gpu.json");
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
        let source = include_str!("service.rs");
        let legacy_column = ["collector", "_command"].concat();
        let legacy_runner = ["run", "_collector"].concat();
        let legacy_binary = ["gpuwatcher", " --json"].concat();

        assert!(!source.contains(&legacy_column));
        assert!(!source.contains(&legacy_runner));
        assert!(!source.contains(&legacy_binary));
    }

    #[test]
    fn history_command_surface_is_present() {
        let commands_source = include_str!("service.rs");
        assert!(commands_source.contains("pub fn list_gpu_history"));
        assert!(commands_source.contains("repository.list_gpu_history"));
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
    async fn poll_server_failure_preserves_latest_success_and_history_gap() {
        let state = test_state();
        let server = save_test_server(&state);
        let (raw_json, success) = success_snapshot();
        let success_collector = MockCollector {
            outcome: MockOutcome::Success(raw_json.clone(), success),
        };
        poll_server_owned_with_collector(&state, &success_collector, server.clone())
            .await
            .expect("success poll");
        {
            let repository = state.repository.lock().expect("repository mutex poisoned");
            repository
                .insert_gpu_history_sample_for_test(&server.id, "2000-01-01T00:00:00Z")
                .expect("old history sample");
            assert_eq!(
                repository
                    .gpu_history_sample_count(&server.id)
                    .expect("history count"),
                3
            );
        }

        let failure_collector = MockCollector {
            outcome: MockOutcome::Error(AppError::new(
                "collector",
                "remote_gpu_query_failed",
                "base nvidia-smi GPU query failed",
            )),
        };
        let result = poll_server_owned_with_collector(&state, &failure_collector, server.clone())
            .await
            .expect("failure poll");

        assert!(!result.ok);
        assert_eq!(result.status, "error");
        assert_eq!(
            result.error_type.as_deref(),
            Some("remote_gpu_query_failed")
        );
        let repository = state.repository.lock().expect("repository mutex poisoned");
        let snapshot = repository
            .latest_snapshot(&server.id)
            .expect("snapshot lookup")
            .expect("snapshot preserved");
        assert_eq!(snapshot.raw_json, raw_json);
        let timestamps = repository
            .gpu_history_sample_timestamps(&server.id)
            .expect("history timestamps");
        assert_eq!(
            timestamps,
            vec![snapshot.received_at.clone(), snapshot.received_at]
        );
        let health = repository
            .get_health(&server.id)
            .expect("health lookup")
            .expect("health stored");
        assert_eq!(health.status, "stale");
        assert_eq!(
            health.last_error_type.as_deref(),
            Some("remote_gpu_query_failed")
        );
        assert!(health.last_success_at.is_some());
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

    #[tokio::test]
    async fn refresh_server_releases_in_flight_slot_after_success() {
        let state = test_state();
        let server = save_test_server(&state);
        let (raw_json, success) = success_snapshot();
        let collector = MockCollector {
            outcome: MockOutcome::Success(raw_json, success),
        };

        let first = refresh_server_with_collector(&state, &collector, server.id.clone())
            .await
            .expect("first refresh");
        let second = refresh_server_with_collector(&state, &collector, server.id.clone())
            .await
            .expect("second refresh");

        assert!(first.ok);
        assert!(second.ok);
        assert_eq!(second.error_type, None);
    }

    #[tokio::test]
    async fn refresh_server_releases_in_flight_slot_after_collector_error() {
        let state = test_state();
        let server = save_test_server(&state);
        let collector = MockCollector {
            outcome: MockOutcome::Error(AppError::new(
                "collector",
                "remote_gpu_query_failed",
                "base nvidia-smi GPU query failed",
            )),
        };

        let first = refresh_server_with_collector(&state, &collector, server.id.clone())
            .await
            .expect("first refresh");
        let second = refresh_server_with_collector(&state, &collector, server.id.clone())
            .await
            .expect("second refresh");

        assert!(!first.ok);
        assert!(!second.ok);
        assert_eq!(
            second.error_type.as_deref(),
            Some("remote_gpu_query_failed")
        );
    }

    #[tokio::test]
    async fn refresh_server_releases_in_flight_slot_after_active_future_is_cancelled() {
        let state = Arc::new(test_state());
        let server = save_test_server(&state);
        let (started_sender, started_receiver) = tokio::sync::oneshot::channel();
        let collector = Arc::new(MockCollector {
            outcome: MockOutcome::Pending(Arc::new(Mutex::new(Some(started_sender)))),
        });

        let pending_refresh = {
            let state = Arc::clone(&state);
            let collector = Arc::clone(&collector);
            let server_id = server.id.clone();
            tokio::spawn(async move {
                refresh_server_with_collector(state.as_ref(), collector.as_ref(), server_id).await
            })
        };
        started_receiver.await.expect("refresh started");
        pending_refresh.abort();
        assert!(pending_refresh
            .await
            .expect_err("refresh aborted")
            .is_cancelled());

        let (raw_json, success) = success_snapshot();
        let success_collector = MockCollector {
            outcome: MockOutcome::Success(raw_json, success),
        };
        let next = refresh_server_with_collector(&state, &success_collector, server.id)
            .await
            .expect("refresh after cancellation");

        assert!(next.ok);
        assert_eq!(next.error_type, None);
    }
}
