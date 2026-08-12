use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::GpuAvailableWatchInput;
use rusqlite::Connection;

use super::fixtures::{open_repository, sample_server_input, success_fixture, SINGLE_SUCCESS_JSON};

fn watch_input(server_id: String) -> GpuAvailableWatchInput {
    GpuAvailableWatchInput {
        id: None,
        server_id,
        gpu_uuid: Some("GPU-11111111-1111-1111-1111-111111111111".to_string()),
        gpu_index: 0,
        enabled: true,
        utilization_threshold_percent: None,
        memory_threshold_mib: None,
        sustain_seconds: Some(300),
        cooldown_seconds: Some(900),
    }
}

#[test]
fn watch_storage_applies_defaults_sustains_rearms_and_consumes_once() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let rule = repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("rule");
    assert_eq!(rule.utilization_threshold_percent, 5.0);
    assert_eq!(rule.memory_threshold_mib, 1024);
    assert_eq!(rule.sustain_seconds, 300);
    assert_eq!(rule.cooldown_seconds, 900);

    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(5.0);
    success.gpus[0].memory_used_mib = Some(1024);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("start sustain");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:04:59Z",
        )
        .expect("still sustain");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:05:00Z",
        )
        .expect("trigger");
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("outbox")
            .len(),
        1
    );
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox consumed")
        .is_empty());

    success.gpus[0].gpu_utilization_percent = Some(6.0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:06:00Z",
        )
        .expect("rearm");
    success.gpus[0].gpu_utilization_percent = Some(5.0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:07:00Z",
        )
        .expect("restart sustain");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:12:00Z",
        )
        .expect("cooldown blocks");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:20:00Z",
        )
        .expect("cooldown elapsed");
    let events = repository.consume_notification_outbox().expect("outbox");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].body, "Lab GPU · GPU 0 is available");
}

#[test]
fn watch_uuid_never_falls_back_and_failure_or_missing_gpu_resets_sustain() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    success.gpus[0].uuid = "GPU-other".to_string();
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("uuid mismatch");
    success.gpus[0].uuid = "GPU-11111111-1111-1111-1111-111111111111".to_string();
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:05:00Z",
        )
        .expect("start only");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    repository
        .store_failure(
            &server.id,
            &AppError::new("transport_ssh", "down", "down"),
            "2026-06-02T00:06:00Z",
        )
        .expect("failure reset");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:11:00Z",
        )
        .expect("restart only");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
}

#[test]
fn watch_missing_gpu_disabled_rules_and_delete_reset_runtime_state() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let rule = repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("sustain starts");
    let mut missing = success.clone();
    missing.gpus.clear();
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &missing,
            "2026-06-02T00:04:00Z",
        )
        .expect("missing gpu resets");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:05:00Z",
        )
        .expect("new sustain starts");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());

    let mut disabled = watch_input(server.id.clone());
    disabled.id = Some(rule.id.clone());
    disabled.enabled = false;
    repository
        .save_gpu_available_watch(disabled)
        .expect("disable rule");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:11:00Z",
        )
        .expect("disabled poll");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    repository.delete_watch_rule(&rule.id).expect("delete rule");
    assert!(repository
        .list_watch_rules(&server.id)
        .expect("rules")
        .is_empty());
}

#[test]
fn watch_runtime_survives_restart_and_index_fallback_handles_unknown_metrics_as_false() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let mut input = watch_input(server.id.clone());
    input.gpu_uuid = None;
    input.sustain_seconds = Some(300);
    repository
        .save_gpu_available_watch(input)
        .expect("index rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = None;
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("unknown metric false");
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:01:00Z",
        )
        .expect("sustain starts");
    drop(repository);
    let repository = open_repository(&db_path);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:06:00Z",
        )
        .expect("restart retains sustain");
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("outbox")
            .len(),
        1
    );
}

#[test]
fn watch_duplicate_create_and_identical_save_preserve_rule_and_sustain() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let first = repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("first rule");
    let duplicate = repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("duplicate rule");
    assert_eq!(first.id, duplicate.id);
    assert_eq!(
        repository
            .list_watch_rules(&server.id)
            .expect("rules")
            .len(),
        1
    );
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("sustain starts");
    repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("identical save");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:05:00Z",
        )
        .expect("trigger");
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("outbox")
            .len(),
        1
    );
}

#[test]
fn watch_changes_reset_state_and_failure_preserves_triggered_disarm() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let mut input = watch_input(server.id.clone());
    input.sustain_seconds = Some(0);
    let rule = repository
        .save_gpu_available_watch(input.clone())
        .expect("rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("trigger");
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("outbox")
            .len(),
        1
    );
    repository
        .store_failure(
            &server.id,
            &AppError::new("transport_ssh", "down", "down"),
            "2026-06-02T00:01:00Z",
        )
        .expect("failure");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:20:00Z",
        )
        .expect("still disarmed");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    input.id = Some(rule.id.clone());
    input.memory_threshold_mib = Some(1);
    let updated = repository.save_gpu_available_watch(input).expect("update");
    assert_eq!(updated.id, rule.id);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:02:00Z",
        )
        .expect("changed rule rearmed");
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("outbox")
            .len(),
        1
    );
}

#[test]
fn watch_out_of_order_and_unknown_memory_do_not_trigger() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    repository
        .save_gpu_available_watch(watch_input(server.id.clone()))
        .expect("rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:10:00Z",
        )
        .expect("start");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("out of order reset");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:04:59Z",
        )
        .expect("not yet sustained");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
    success.gpus[0].memory_used_mib = None;
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:06:00Z",
        )
        .expect("unknown memory");
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
}

#[test]
fn watch_delete_and_server_delete_cascade_runtime_and_outbox() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let mut input = watch_input(server.id.clone());
    input.sustain_seconds = Some(0);
    let rule = repository.save_gpu_available_watch(input).expect("rule");
    let mut success = success_fixture(SINGLE_SUCCESS_JSON);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    success.gpus[0].memory_used_mib = Some(0);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("event");
    repository.delete_watch_rule(&rule.id).expect("delete rule");
    let connection = Connection::open(&db_path).expect("connection");
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM watch_runtime_state", [], |row| row
                .get::<_, i64>(0))
            .expect("runtime count"),
        0
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM notification_outbox", [], |row| row
                .get::<_, i64>(0))
            .expect("outbox count"),
        0
    );
    drop(connection);
    let mut server_rule_input = watch_input(server.id.clone());
    server_rule_input.sustain_seconds = Some(0);
    let rule = repository
        .save_gpu_available_watch(server_rule_input)
        .expect("new rule");
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:01:00Z",
        )
        .expect("pending server event");
    repository.delete_server(&server.id).expect("delete server");
    let connection = Connection::open(&db_path).expect("connection");
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM watch_rules WHERE id = ?1",
                [&rule.id],
                |row| row.get::<_, i64>(0)
            )
            .expect("rule count"),
        0
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM watch_runtime_state", [], |row| row
                .get::<_, i64>(0))
            .expect("runtime count"),
        0
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM notification_outbox", [], |row| row
                .get::<_, i64>(0))
            .expect("outbox count"),
        0
    );
}

#[test]
fn watch_explicit_id_rejects_cross_server_ownership() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let first_server = repository
        .save_server(sample_server_input())
        .expect("first server");
    let mut second_input = sample_server_input();
    second_input.host = "other.example.test".to_string();
    let second_server = repository.save_server(second_input).expect("second server");
    let rule = repository
        .save_gpu_available_watch(watch_input(first_server.id))
        .expect("rule");
    let mut update = watch_input(second_server.id);
    update.id = Some(rule.id);
    let error = repository
        .save_gpu_available_watch(update)
        .expect_err("cross-server update");
    assert_eq!(error.error_type, "watch_server_mismatch");
}
