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
    let updated = repository.save_server(edited).expect("server updated");

    assert_eq!(host_error.error_type, "server_config_invalid");
    assert_eq!(key_error.error_type, "server_config_invalid");
    assert_eq!(missing_error.error_type, "server_not_found");
    assert!(repository
        .get_health("missing-server")
        .expect("health lookup")
        .is_none());
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
