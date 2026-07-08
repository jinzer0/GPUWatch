use std::path::{Path, PathBuf};

use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::{ParsedCollectorPayload, ServerInput, SuccessEnvelope};
use gpuwatcher_core::protocol::parse_collector_json;
use gpuwatcher_core::repository::Repository;
use rusqlite::{params, Connection};

pub const SINGLE_SUCCESS_JSON: &str =
    include_str!("../../../../fixtures/protocol/v1/success_single_gpu.json");
pub const MULTI_SUCCESS_JSON: &str =
    include_str!("../../../../fixtures/protocol/v1/success_multi_gpu.json");

pub fn sample_server_input() -> ServerInput {
    ServerInput {
        id: None,
        name: "Lab GPU".to_string(),
        host: "gpu.example.test".to_string(),
        port: 22,
        username: "alice".to_string(),
        ssh_key_path: Some("/Users/alice/.ssh/id_ed25519".to_string()),
        polling_interval_seconds: None,
        enabled: true,
    }
}

pub fn isolated_server_input() -> ServerInput {
    ServerInput {
        id: None,
        name: "Isolated GPU".to_string(),
        host: "isolated.example.test".to_string(),
        port: 22,
        username: "gpuwatch".to_string(),
        ssh_key_path: None,
        polling_interval_seconds: Some(30),
        enabled: true,
    }
}

pub fn open_repository(path: &Path) -> Repository {
    let repository = Repository::open(path).expect("repository open");
    repository.migrate().expect("repository migration");
    repository
}

pub fn success_fixture(raw: &str) -> SuccessEnvelope {
    let ParsedCollectorPayload::Success(success) =
        parse_collector_json(raw).expect("parse fixture")
    else {
        panic!("expected success fixture")
    };
    success
}

pub fn sqlite_columns(path: &Path, table: &str) -> Vec<String> {
    let conn = Connection::open(path).expect("sqlite connection");
    table_columns(&conn, table)
}

pub fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .expect("table info");
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .expect("columns")
        .collect::<Result<Vec<_>, _>>()
        .expect("column names")
}

pub fn table_indexes(conn: &Connection, table: &str) -> Vec<String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA index_list({table})"))
        .expect("index list");
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .expect("indexes")
        .collect::<Result<Vec<_>, _>>()
        .expect("index names")
}

pub fn create_legacy_database(path: &Path) {
    let parent = path.parent().expect("db parent");
    std::fs::create_dir_all(parent).expect("create db parent");
    let conn = Connection::open(path).expect("legacy connection");
    conn.execute_batch(
        "
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        INSERT INTO schema_migrations(version, applied_at) VALUES(1, '2026-06-01T00:00:00Z');
        CREATE TABLE servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          username TEXT NOT NULL,
          ssh_key_path TEXT,
          collector_command TEXT NOT NULL,
          polling_interval_seconds INTEGER NOT NULL,
          enabled INTEGER NOT NULL,
          config_revision INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE server_health (
          server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          last_error_type TEXT,
          last_error_message TEXT,
          last_poll_started_at TEXT,
          last_poll_finished_at TEXT,
          last_success_at TEXT
        );
        CREATE TABLE latest_snapshots (
          server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
          protocol_version INTEGER NOT NULL,
          schema_version INTEGER NOT NULL,
          received_at TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          parsed_summary_json TEXT NOT NULL
        );
        INSERT INTO servers(id, name, host, port, username, ssh_key_path, collector_command,
                            polling_interval_seconds, enabled, config_revision, created_at, updated_at)
        VALUES('server-1', 'Legacy Lab', 'legacy.example.test', 2222, 'legacy-user', NULL,
               'gpuwatcher --json', 45, 1, 7, '2026-06-01T00:00:00Z', '2026-06-01T00:05:00Z');
        INSERT INTO server_health(server_id, status) VALUES('server-1', 'idle');
        ",
    )
    .expect("legacy schema");
}

pub fn insert_history_sample(path: &Path, server_id: &str, received_at: &str) {
    let conn = Connection::open(path).expect("sqlite connection");
    conn.execute(
        "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![server_id, received_at, 0, "GPU-test", "Test GPU"],
    )
    .expect("history sample");
}

pub fn insert_named_history_sample(
    path: &Path,
    server_id: &str,
    received_at: &str,
    name: Option<&str>,
    memory_used_mib: i64,
) {
    let conn = Connection::open(path).expect("sqlite connection");
    conn.execute(
        "INSERT INTO gpu_history_samples(
           server_id, received_at, gpu_index, gpu_uuid, name, memory_used_mib
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            server_id,
            received_at,
            0,
            "GPU-00000000-0000-0000-0000-000000000000",
            name,
            memory_used_mib
        ],
    )
    .expect("history sample");
}

pub fn history_timestamps(path: &Path, server_id: &str) -> Vec<String> {
    let conn = Connection::open(path).expect("sqlite connection");
    let mut statement = conn
        .prepare(
            "SELECT received_at FROM gpu_history_samples WHERE server_id = ?1 ORDER BY received_at",
        )
        .expect("history query");
    statement
        .query_map(params![server_id], |row| row.get::<_, String>(0))
        .expect("history rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("timestamps")
}

pub fn backup_paths(parent: &Path) -> Vec<PathBuf> {
    let mut paths = std::fs::read_dir(parent)
        .expect("read db parent")
        .filter_map(|entry| {
            let path = entry.expect("dir entry").path();
            let is_backup = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("gpuwatcher.sqlite3.backup-"));
            is_backup.then_some(path)
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

pub fn assert_storage_error(error: AppError) {
    assert_eq!(error.layer, "storage_app");
    assert_eq!(error.error_type, "sqlite_error");
}
