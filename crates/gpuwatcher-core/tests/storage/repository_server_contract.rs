use super::fixtures::{open_repository, sample_server_input};
use gpuwatcher_core::error::AppError;
use gpuwatcher_core::repository::Repository;
use rusqlite::Connection;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[test]
fn repository_server_validation_crud_poll_targets_and_due_queries_keep_current_contract() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let mut invalid_host = sample_server_input();
    invalid_host.host = "-oProxyCommand=touch".to_string();
    let host_error = repository
        .save_server(invalid_host)
        .expect_err("host rejected");
    let mut private_key_material = sample_server_input();
    private_key_material.ssh_key_path =
        Some("-----BEGIN OPENSSH PRIVATE KEY-----\nsecret".to_string());
    let key_error = repository
        .save_server(private_key_material)
        .expect_err("private key material rejected");
    let missing_error = repository
        .set_server_enabled("missing-server", false)
        .expect_err("missing server rejected");
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let mut edited = sample_server_input();
    edited.id = Some(server.id.clone());
    edited.name = "Renamed Lab".to_string();
    edited.host = "changed.example.test".to_string();
    let updated = repository.save_server(edited).expect("server updated");

    assert_eq!(host_error.error_type, "server_config_invalid");
    assert_eq!(key_error.error_type, "server_config_invalid");
    assert_eq!(missing_error.error_type, "server_not_found");
    assert!(repository
        .get_health("missing-server")
        .expect("health lookup")
        .is_none());
    assert_eq!(updated.config_revision, server.config_revision + 1);
    assert!(!repository
        .poll_target_current(&server.id, server.config_revision)
        .expect("old revision stale"));
    assert!(repository
        .poll_target_current(&updated.id, updated.config_revision)
        .expect("new revision current"));
    assert_eq!(repository.due_servers().expect("due").len(), 1);
    repository
        .mark_poll_started(&updated.id, "2026-06-01T00:00:00+00:00")
        .expect("started");
    assert!(repository.due_servers().expect("due").is_empty());
    repository.delete_server(&updated.id).expect("deleted");
    assert!(repository.list_servers().expect("servers").is_empty());
}

#[test]
fn equivalent_server_saves_preserve_record_health_and_in_flight_poll_revision() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let error = AppError::new("transport_ssh", "ssh_timeout", "timeout");
    repository
        .store_failure(&server.id, &error, "2026-06-01T00:00:00+00:00")
        .expect("offline health");
    for polling in [false, true] {
        if polling {
            repository
                .mark_poll_started(&server.id, "2026-06-01T00:00:30+00:00")
                .expect("poll started");
        }
        let health = repository.get_health(&server.id).expect("health lookup");
        for normalized in [false, true] {
            let mut unchanged = sample_server_input();
            unchanged.id = Some(server.id.clone());
            if normalized {
                unchanged.name = " Lab GPU ".to_string();
                unchanged.host = " gpu.example.test ".to_string();
                unchanged.username = " alice ".to_string();
                unchanged.ssh_key_path = Some(" /Users/alice/.ssh/id_ed25519 ".to_string());
                unchanged.port = -1;
                unchanged.polling_interval_seconds = Some(30);
            }
            let saved = repository.save_server(unchanged).expect("equivalent save");
            assert_eq!(saved, server);
            assert_eq!(
                repository.get_health(&server.id).expect("preserved health"),
                health
            );
            assert!(repository
                .poll_target_current(&server.id, server.config_revision)
                .expect("poll target remains current"));
        }
    }
}

#[test]
fn repeated_server_enabled_writes_preserve_record_health_and_poll_completion() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    for enabled in [true, false, true] {
        let current = repository
            .set_server_enabled(&server.id, enabled)
            .expect("transition");
        for polling in [false, true] {
            if polling && enabled {
                repository
                    .mark_poll_started(&server.id, "2026-06-01T00:00:00Z")
                    .expect("poll started");
            }
            let health = repository.get_health(&server.id).expect("health");
            for _ in 0..2 {
                assert_eq!(
                    repository
                        .set_server_enabled(&server.id, enabled)
                        .expect("repeated write"),
                    current
                );
                assert_eq!(
                    repository.get_health(&server.id).expect("preserved health"),
                    health
                );
                assert_eq!(
                    repository
                        .poll_target_current(&server.id, current.config_revision)
                        .expect("poll current"),
                    enabled
                );
            }
        }
        if enabled {
            repository
                .store_failure(
                    &server.id,
                    &AppError::new("transport_ssh", "ssh_timeout", "timeout"),
                    "2026-06-01T00:00:30Z",
                )
                .expect("poll completes");
            let health = repository
                .get_health(&server.id)
                .expect("health")
                .expect("health row");
            assert_eq!(health.status, "offline");
            assert_eq!(
                health.last_poll_finished_at.as_deref(),
                Some("2026-06-01T00:00:30Z")
            );
        }
    }
}

#[test]
fn server_enabled_transitions_increment_revision_and_invalidate_poll_targets() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository.sqlite3"));
    let mut current = repository
        .save_server(sample_server_input())
        .expect("server");
    for enabled in [false, true] {
        let changed = repository
            .set_server_enabled(&current.id, enabled)
            .expect("transition");
        assert_eq!(changed.config_revision, current.config_revision + 1);
        assert_eq!(changed.enabled, enabled);
        assert!(!repository
            .poll_target_current(&current.id, current.config_revision)
            .expect("old target stale"));
        assert_eq!(
            repository
                .get_health(&current.id)
                .expect("health")
                .expect("health row")
                .status,
            if enabled { "idle" } else { "disabled" }
        );
        current = changed;
    }
}

#[test]
fn server_enabled_compares_latest_value_after_waiting_for_a_wal_writer() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let (ready_tx, ready_rx) = mpsc::channel();
    let (attempt_tx, attempt_rx) = mpsc::channel();
    let worker_path = path.clone();
    let id = server.id.clone();
    let worker = thread::spawn(move || {
        let repository = Repository::open(&worker_path).expect("worker repository");
        ready_tx.send(()).expect("ready");
        attempt_rx.recv().expect("attempt");
        repository.set_server_enabled(&id, false)
    });
    ready_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker ready");
    let writer = Connection::open(&path).expect("writer");
    writer
        .execute_batch("BEGIN IMMEDIATE;")
        .expect("writer lock");
    writer.execute("UPDATE servers SET enabled = 0, config_revision = config_revision + 1, updated_at = '2026-06-01T00:00:00Z' WHERE id = ?1", [&server.id]).expect("concurrent transition");
    attempt_tx.send(()).expect("attempt");
    thread::sleep(Duration::from_millis(50));
    writer.execute_batch("COMMIT;").expect("release lock");
    let saved = worker
        .join()
        .expect("worker joined")
        .expect("latest value no-op");
    assert!(!saved.enabled);
    assert_eq!(saved.config_revision, server.config_revision + 1);
    assert_eq!(saved.updated_at, "2026-06-01T00:00:00Z");
    assert_eq!(
        repository.get_server(&server.id).expect("server"),
        Some(saved)
    );
}

#[test]
fn name_only_server_save_keeps_in_flight_poll_current_and_allows_completion() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    repository
        .mark_poll_started(&server.id, "2026-06-01T00:00:00+00:00")
        .expect("poll started");
    let health = repository.get_health(&server.id).expect("health lookup");
    assert_eq!(health.as_ref().expect("health row").status, "polling");
    let mut renamed = sample_server_input();
    renamed.id = Some(server.id.clone());
    renamed.name = "Renamed Lab".to_string();
    let saved = repository.save_server(renamed).expect("name updated");
    assert_eq!(saved.name, "Renamed Lab");
    assert_eq!(saved.config_revision, server.config_revision);
    assert_eq!(
        repository.get_health(&server.id).expect("preserved health"),
        health
    );
    assert!(repository
        .poll_target_current(&server.id, server.config_revision)
        .expect("in-flight poll current"));
    let error = AppError::new("transport_ssh", "ssh_timeout", "timeout");
    repository
        .store_failure(&server.id, &error, "2026-06-01T00:00:30+00:00")
        .expect("poll completion accepted");
    let completed = repository
        .get_health(&server.id)
        .expect("completed health")
        .expect("health row");
    assert_eq!(completed.status, "offline");
    assert_eq!(
        completed.last_poll_finished_at.as_deref(),
        Some("2026-06-01T00:00:30+00:00")
    );
    assert_eq!(
        repository
            .due_servers()
            .expect("polling no longer stranded")
            .len(),
        1
    );
}

#[test]
fn server_save_compares_the_record_after_waiting_for_a_wal_writer() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    let (ready_tx, ready_rx) = mpsc::channel();
    let (attempt_tx, attempt_rx) = mpsc::channel();
    let writer_path = db_path.clone();
    let server_id = server.id.clone();
    let save_attempt = thread::spawn(move || {
        let repository = Repository::open(&writer_path).expect("repository open");
        ready_tx.send(()).expect("ready signal");
        attempt_rx.recv().expect("save signal");
        let mut input = sample_server_input();
        input.id = Some(server_id);
        repository.save_server(input)
    });
    ready_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("connection ready");
    let writer = Connection::open(&db_path).expect("writer connection");
    writer
        .execute_batch("BEGIN IMMEDIATE;")
        .expect("writer lock held");
    writer.execute(
        "UPDATE servers SET name = 'Concurrent rename', config_revision = config_revision + 1 WHERE id = ?1",
        [&server.id],
    ).expect("concurrent edit");
    attempt_tx.send(()).expect("save attempted");
    thread::sleep(Duration::from_millis(50));
    writer
        .execute_batch("COMMIT;")
        .expect("release writer lock");
    let saved = save_attempt
        .join()
        .expect("save thread joined")
        .expect("save after writer");
    assert_eq!(saved.name, server.name);
    assert_eq!(saved.config_revision, server.config_revision + 1);
    assert_eq!(
        repository.get_server(&server.id).expect("server lookup"),
        Some(saved)
    );
}

#[test]
fn repository_due_servers_skip_polling_servers_and_apply_offline_backoff() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server saved");
    assert_eq!(repository.due_servers().expect("due").len(), 1);

    repository
        .mark_poll_started(&server.id, "2026-06-01T00:00:00+00:00")
        .expect("started");
    assert!(repository.due_servers().expect("due").is_empty());

    let error = AppError::new("transport_ssh", "ssh_timeout", "timeout");
    repository
        .store_failure(
            &server.id,
            &error,
            &gpuwatcher_core::repository::now_string(),
        )
        .expect("offline failure");
    assert!(repository.due_servers().expect("backoff").is_empty());
}

#[test]
fn repository_waits_for_transient_cross_connection_writer_lock() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    drop(repository);

    let writer = Connection::open(&db_path).expect("lock connection");
    writer
        .execute_batch("BEGIN IMMEDIATE;")
        .expect("writer lock held");

    let (attempt_tx, attempt_rx) = mpsc::channel();
    let writer_path = db_path.clone();
    let save_attempt = thread::spawn(move || {
        let repository = Repository::open(&writer_path).expect("repository open");
        attempt_tx.send(()).expect("attempt signal");
        repository.save_server(sample_server_input())
    });

    attempt_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("save attempted");
    thread::sleep(Duration::from_millis(50));
    writer
        .execute_batch("COMMIT;")
        .expect("release writer lock");

    let saved = save_attempt
        .join()
        .expect("save thread joined")
        .expect("save waited for transient lock");

    assert_eq!(saved.name, "Lab GPU");
}

#[test]
fn repository_uses_wal_journal_mode_for_file_databases() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    drop(repository);

    let conn = Connection::open(&db_path).expect("sqlite connection");
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .expect("journal mode");

    assert_eq!(mode, "wal");
}
