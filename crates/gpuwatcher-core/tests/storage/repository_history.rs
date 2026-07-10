use gpuwatcher_core::error::AppError;

use super::fixtures::{
    history_timestamps, insert_history_sample, insert_named_history_sample, open_repository,
    sample_server_input, success_fixture, MULTI_SUCCESS_JSON, SINGLE_SUCCESS_JSON,
};

#[test]
fn repository_store_success_and_queries_project_gpu_history_without_zero_fabrication() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let mut first_success = success_fixture(MULTI_SUCCESS_JSON);
    first_success.gpus[0].memory_used_mib = Some(1024);
    first_success.gpus[1].memory_used_mib = Some(64000);
    repository
        .store_success(
            &server.id,
            MULTI_SUCCESS_JSON,
            &first_success,
            "2026-06-02T00:00:00Z",
        )
        .expect("first success stored");
    let mut second_success = success_fixture(MULTI_SUCCESS_JSON);
    second_success.gpus[0].memory_used_mib = Some(2048);
    second_success.gpus[1].memory_used_mib = Some(65000);
    repository
        .store_success(
            &server.id,
            MULTI_SUCCESS_JSON,
            &second_success,
            "2026-06-02T00:30:00Z",
        )
        .expect("second success stored");
    let mut nullable_success = success_fixture(SINGLE_SUCCESS_JSON);
    let gpu = nullable_success.gpus.first_mut().expect("gpu");
    gpu.memory_used_mib = None;
    gpu.gpu_utilization_percent = None;
    gpu.encoder_utilization_percent = None;
    gpu.temperature_celsius = None;
    gpu.pcie_rx_kib_per_sec = None;

    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &nullable_success,
            "2026-06-02T00:45:00Z",
        )
        .expect("nullable success stored");
    let history = repository
        .list_gpu_history(&server.id, None, None, "1h", "2026-06-02T01:00:00Z")
        .expect("history");

    assert_eq!(history.server_id, server.id);
    assert_eq!(history.server_name, server.name);
    assert_eq!(history.range, "1h");
    assert_eq!(history.started_at, "2026-06-02T00:00:00Z");
    assert_eq!(history.series.len(), 3);
    let first_gpu = history
        .series
        .iter()
        .find(|series| {
            series.gpu_uuid.as_deref() == Some("GPU-00000000-0000-0000-0000-000000000000")
        })
        .expect("first gpu series");
    let second_gpu = history
        .series
        .iter()
        .find(|series| series.gpu_index == 1)
        .expect("second gpu series");
    let nullable_gpu = history
        .series
        .iter()
        .find(|series| series.samples[0].memory_used_mib.is_none())
        .expect("nullable gpu series");
    assert_eq!(first_gpu.samples.len(), 2);
    assert_eq!(second_gpu.samples.len(), 2);
    assert_eq!(first_gpu.samples[0].memory_used_mib, Some(1024));
    assert_eq!(first_gpu.samples[1].memory_used_mib, Some(2048));
    assert_eq!(nullable_gpu.samples[0].gpu_utilization_percent, None);
}

#[test]
fn repository_list_gpu_history_filters_and_rejects_invalid_requests() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let success = success_fixture(MULTI_SUCCESS_JSON);
    repository
        .store_success(
            &server.id,
            MULTI_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("success stored");

    let by_index = repository
        .list_gpu_history(&server.id, Some(1), None, "6h", "2026-06-02T01:00:00Z")
        .expect("history by index");
    let by_uuid = repository
        .list_gpu_history(
            &server.id,
            None,
            Some("GPU-00000000-0000-0000-0000-000000000000".to_string()),
            "24h",
            "2026-06-02T01:00:00Z",
        )
        .expect("history by uuid");
    let invalid_range = repository
        .list_gpu_history("missing", None, None, "2h", "2026-06-02T01:00:00Z")
        .expect_err("invalid range");
    let missing_server = repository
        .list_gpu_history("missing", None, None, "1h", "2026-06-02T01:00:00Z")
        .expect_err("missing server");

    assert_eq!(by_index.series.len(), 1);
    assert_eq!(by_index.series[0].gpu_index, 1);
    assert_eq!(by_uuid.series.len(), 1);
    assert_eq!(by_uuid.series[0].gpu_index, 0);
    assert_eq!(invalid_range.error_type, "invalid_history_range");
    assert_eq!(missing_server.error_type, "server_not_found");
}

#[test]
fn repository_list_gpu_history_groups_by_gpu_identity_when_names_drift() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    drop(repository);
    for (received_at, name, memory_used_mib) in [
        ("2026-06-02T00:00:00Z", Some("NVIDIA A100"), 1024),
        ("2026-06-02T00:15:00Z", None, 2048),
        ("2026-06-02T00:30:00Z", Some("NVIDIA A100-SXM4"), 3072),
    ] {
        insert_named_history_sample(&db_path, &server.id, received_at, name, memory_used_mib);
    }
    let repository = open_repository(&db_path);

    let history = repository
        .list_gpu_history(&server.id, None, None, "1h", "2026-06-02T01:00:00Z")
        .expect("history");

    assert_eq!(history.series.len(), 1);
    assert_eq!(history.series[0].gpu_index, 0);
    assert_eq!(
        history.series[0].gpu_uuid.as_deref(),
        Some("GPU-00000000-0000-0000-0000-000000000000")
    );
    assert_eq!(history.series[0].name.as_deref(), Some("NVIDIA A100"));
    assert_eq!(history.series[0].samples.len(), 3);
}

#[test]
fn repository_store_failure_prunes_history_without_replacing_latest_success() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let success = success_fixture(SINGLE_SUCCESS_JSON);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-01T00:00:00Z",
        )
        .expect("success stored");
    drop(repository);
    for received_at in [
        "2026-06-01T00:59:59Z",
        "2026-06-01T01:00:00Z",
        "2026-06-01T12:00:00Z",
    ] {
        insert_history_sample(&db_path, &server.id, received_at);
    }
    let repository = open_repository(&db_path);

    repository
        .store_failure(
            &server.id,
            &AppError::new("transport_ssh", "ssh_unreachable", "host unreachable"),
            "2026-06-02T01:00:00Z",
        )
        .expect("failure stored");

    assert_eq!(
        history_timestamps(&db_path, &server.id),
        vec![
            "2026-06-01T01:00:00Z".to_string(),
            "2026-06-01T12:00:00Z".to_string(),
        ]
    );
    let snapshot = repository
        .latest_snapshot(&server.id)
        .expect("snapshot lookup")
        .expect("snapshot preserved");
    let health = repository
        .get_health(&server.id)
        .expect("health")
        .expect("health exists");
    assert_eq!(snapshot.received_at, "2026-06-01T00:00:00Z");
    assert_eq!(health.status, "stale");
    assert_eq!(health.last_error_type.as_deref(), Some("ssh_unreachable"));
}

#[test]
fn repository_store_success_and_prune_gpu_history_use_fixed_utc_24_hour_cutoff() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    drop(repository);
    for received_at in [
        "2026-05-31T23:59:59Z",
        "2026-06-01T00:00:00Z",
        "2026-06-01T12:00:00Z",
    ] {
        insert_history_sample(&db_path, &server.id, received_at);
    }
    let repository = open_repository(&db_path);
    let success = success_fixture(SINGLE_SUCCESS_JSON);
    repository
        .store_success(
            &server.id,
            SINGLE_SUCCESS_JSON,
            &success,
            "2026-06-02T00:00:00Z",
        )
        .expect("success stored");
    assert_eq!(
        history_timestamps(&db_path, &server.id),
        vec![
            "2026-06-01T00:00:00Z".to_string(),
            "2026-06-01T12:00:00Z".to_string(),
            "2026-06-02T00:00:00Z".to_string(),
        ]
    );
    drop(repository);
    for received_at in ["2026-06-01T09:59:59Z", "2026-06-01T10:00:01Z"] {
        insert_history_sample(&db_path, &server.id, received_at);
    }
    let repository = open_repository(&db_path);

    repository
        .prune_gpu_history("2026-06-02T10:00:00Z")
        .expect("history pruned");

    assert_eq!(
        history_timestamps(&db_path, &server.id),
        vec![
            "2026-06-01T10:00:01Z".to_string(),
            "2026-06-01T12:00:00Z".to_string(),
            "2026-06-02T00:00:00Z".to_string(),
        ]
    );
}
