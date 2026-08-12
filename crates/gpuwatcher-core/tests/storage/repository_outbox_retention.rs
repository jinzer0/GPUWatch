use std::sync::{mpsc, Barrier};
use std::thread;

use gpuwatcher_core::models::GpuAvailableWatchInput;
use rusqlite::Connection;

use super::fixtures::{open_repository, sample_server_input, success_fixture, SINGLE_SUCCESS_JSON};

fn watch_input(server_id: String, sustain_seconds: i64) -> GpuAvailableWatchInput {
    GpuAvailableWatchInput {
        id: None,
        server_id,
        gpu_uuid: Some("GPU-11111111-1111-1111-1111-111111111111".to_string()),
        gpu_index: 0,
        enabled: true,
        utilization_threshold_percent: None,
        memory_threshold_mib: None,
        sustain_seconds: Some(sustain_seconds),
        cooldown_seconds: Some(900),
    }
}

fn outbox_row_count(path: &std::path::Path) -> i64 {
    Connection::open(path)
        .expect("connection")
        .query_row("SELECT COUNT(*) FROM notification_outbox", [], |row| {
            row.get::<_, i64>(0)
        })
        .expect("outbox count")
}

fn insert_outbox_event(
    path: &std::path::Path,
    id: &str,
    server_id: &str,
    created_at: &str,
    title: &str,
) {
    let conn = Connection::open(path).expect("connection");
    conn.execute(
        "INSERT INTO notification_outbox(id, rule_id, server_id, event_type, title, body, created_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, "rule-1", server_id, "gpu_available", title, title, created_at],
    )
    .expect("insert outbox event");
}

#[test]
fn watch_outbox_consumes_once_and_bounds_rows() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    repository
        .save_gpu_available_watch(watch_input(server.id.clone(), 0))
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
        .expect("event");

    let events = repository.consume_notification_outbox().expect("outbox");

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].body, "Lab GPU · GPU 0 is available");
    assert_eq!(outbox_row_count(&db_path), 0);
}

#[test]
fn watch_outbox_consumes_once_across_concurrent_connections() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    repository
        .save_gpu_available_watch(watch_input(server.id.clone(), 0))
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
        .expect("event");

    let barrier = std::sync::Arc::new(Barrier::new(2));
    let (sender, receiver) = mpsc::channel();

    let first_path = db_path.clone();
    let first_barrier = std::sync::Arc::clone(&barrier);
    let first_sender = sender.clone();
    let first_handle = thread::spawn(move || {
        first_barrier.wait();
        let result = open_repository(&first_path)
            .consume_notification_outbox()
            .map(|events| events.len());
        first_sender.send(result).expect("send first result");
    });

    let second_path = db_path.clone();
    let second_barrier = std::sync::Arc::clone(&barrier);
    let second_handle = thread::spawn(move || {
        second_barrier.wait();
        let result = open_repository(&second_path)
            .consume_notification_outbox()
            .map(|events| events.len());
        sender.send(result).expect("send second result");
    });

    first_handle.join().expect("first join");
    second_handle.join().expect("second join");

    let mut errors = Vec::new();
    let mut batch_sizes = Vec::new();
    for result in receiver.iter().take(2) {
        match result {
            Ok(batch_size) => batch_sizes.push(batch_size),
            Err(error) => errors.push(error),
        }
    }

    assert!(errors.is_empty(), "unexpected errors: {errors:?}");
    batch_sizes.sort();
    assert_eq!(batch_sizes, vec![0, 1]);
    assert_eq!(outbox_row_count(&db_path), 0);
}

#[test]
fn watch_outbox_orders_same_timestamp_events_by_id() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    let server = repository
        .save_server(sample_server_input())
        .expect("server");
    let rule_id = "rule-1";
    let conn = Connection::open(&db_path).expect("connection");
    conn.execute(
        "INSERT INTO watch_rules(id, server_id, kind, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at) VALUES(?1, ?2, 'gpu_available', ?3, ?4, 1, 5, 1024, 0, 900, ?5, ?5)",
        rusqlite::params![rule_id, server.id, Some("GPU-11111111-1111-1111-1111-111111111111"), 0, "2026-06-02T00:00:00Z"],
    )
    .expect("watch rule");
    insert_outbox_event(
        &db_path,
        "b-event",
        &server.id,
        "2026-06-02T00:00:00Z",
        "b body",
    );
    insert_outbox_event(
        &db_path,
        "a-event",
        &server.id,
        "2026-06-02T00:00:00Z",
        "a body",
    );
    insert_outbox_event(
        &db_path,
        "c-event",
        &server.id,
        "2026-06-02T00:00:00Z",
        "c body",
    );

    let events = open_repository(&db_path)
        .consume_notification_outbox()
        .expect("outbox");

    assert_eq!(
        events
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        vec!["a-event", "b-event", "c-event"]
    );
    assert_eq!(outbox_row_count(&db_path), 0);
}
