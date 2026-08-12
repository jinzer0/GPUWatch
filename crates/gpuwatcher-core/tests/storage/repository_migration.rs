use gpuwatcher_core::repository::Repository;
use rusqlite::{params, Connection};

use super::fixtures::{open_repository, table_columns, table_indexes};

#[test]
fn repository_legacy_collector_command_migration_drops_column_and_preserves_settings() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("legacy.sqlite3");
    let conn = Connection::open(&db_path).expect("connection");
    conn.execute_batch(
        "
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
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
        ",
    )
    .expect("v1 schema");
    conn.execute(
        "INSERT INTO servers(id, name, host, port, username, ssh_key_path, collector_command,
          polling_interval_seconds, enabled, config_revision, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "server-1",
            "Legacy Lab",
            "legacy.example.test",
            2222,
            "legacy-user",
            "/Users/legacy/.ssh/id_ed25519",
            "rm -rf /; gpuwatcher --json --token='secret'",
            45,
            1,
            7,
            "2026-06-01T00:00:00Z",
            "2026-06-01T00:05:00Z",
        ],
    )
    .expect("legacy server");

    drop(conn);
    let repository = Repository::open(&db_path).expect("repository");
    repository.migrate().expect("migration");

    let migrated = Connection::open(&db_path).expect("migrated connection");
    assert!(!table_columns(&migrated, "servers").contains(&"collector_command".to_string()));
    let migrations = migrated
        .query_row(
            "SELECT group_concat(version, ',') FROM schema_migrations ORDER BY version",
            [],
            |row| row.get::<_, String>(0),
        )
        .expect("migrations");
    assert_eq!(migrations, "1,2,3");
    let servers = repository.list_servers().expect("servers");
    assert_eq!(servers.len(), 1);
    let server = &servers[0];
    assert_eq!(server.id, "server-1");
    assert_eq!(server.name, "Legacy Lab");
    assert_eq!(server.host, "legacy.example.test");
    assert_eq!(server.port, 2222);
    assert_eq!(server.username, "legacy-user");
    assert_eq!(
        server.ssh_key_path.as_deref(),
        Some("/Users/legacy/.ssh/id_ed25519")
    );
    assert_eq!(server.polling_interval_seconds, 45);
    assert!(server.enabled);
    assert_eq!(server.config_revision, 7);
}

#[test]
fn repository_migration_creates_gpu_history_schema_indexes_and_version_markers_idempotently() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("repository.sqlite3");
    let repository = open_repository(&db_path);
    repository.migrate().expect("second migration");
    drop(repository);

    let conn = Connection::open(&db_path).expect("sqlite connection");
    let migrations = conn
        .query_row(
            "SELECT group_concat(version, ',') FROM schema_migrations ORDER BY version",
            [],
            |row| row.get::<_, String>(0),
        )
        .expect("migrations");
    assert_eq!(migrations, "1,2,3");
    assert_eq!(
        table_columns(&conn, "gpu_history_samples"),
        vec![
            "server_id",
            "received_at",
            "gpu_index",
            "gpu_uuid",
            "name",
            "memory_total_mib",
            "memory_used_mib",
            "memory_free_mib",
            "gpu_utilization_percent",
            "memory_utilization_percent",
            "encoder_utilization_percent",
            "decoder_utilization_percent",
            "jpeg_utilization_percent",
            "ofa_utilization_percent",
            "temperature_celsius",
            "power_draw_watt",
            "power_limit_watt",
            "pcie_rx_kib_per_sec",
            "pcie_tx_kib_per_sec",
        ]
    );
    let indexes = table_indexes(&conn, "gpu_history_samples");
    assert!(indexes.contains(&"idx_gpu_history_server_received".to_string()));
    assert!(indexes.contains(&"idx_gpu_history_server_gpu_index_received".to_string()));
    assert!(indexes.contains(&"idx_gpu_history_server_gpu_uuid_received".to_string()));
    assert!(table_indexes(&conn, "watch_rules").contains(&"idx_watch_rules_server".to_string()));
    assert!(table_indexes(&conn, "notification_outbox")
        .contains(&"idx_notification_outbox_pending".to_string()));
    assert!(
        table_indexes(&conn, "watch_rules").contains(&"idx_watch_rules_uuid_identity".to_string())
    );
    assert!(
        table_indexes(&conn, "watch_rules").contains(&"idx_watch_rules_index_identity".to_string())
    );
    assert_eq!(
        table_columns(&conn, "watch_runtime_state"),
        vec![
            "rule_id",
            "condition_started_at",
            "last_triggered_at",
            "armed",
            "updated_at"
        ]
    );
    let watch_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'watch_rules'",
            [],
            |row| row.get(0),
        )
        .expect("watch schema");
    assert!(watch_sql.contains("CHECK(kind = 'gpu_available')"));
    assert!(watch_sql.contains("CHECK(enabled IN (0, 1))"));
    assert!(watch_sql.contains("CHECK(gpu_index >= 0)"));
    conn.execute(
        "INSERT INTO servers(id, name, host, port, username, polling_interval_seconds, enabled, config_revision, created_at, updated_at) VALUES('watch-server', 'Watch', 'watch.test', 22, 'watch', 30, 1, 1, 'now', 'now')",
        [],
    )
    .expect("server");
    assert!(conn.execute(
        "INSERT INTO watch_rules(id, server_id, kind, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at) VALUES('invalid', 'watch-server', 'other', NULL, -1, 2, 101, -1, -1, -1, 'now', 'now')",
        [],
    ).is_err());
    conn.execute(
        "INSERT INTO watch_rules(id, server_id, kind, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at) VALUES('uuid-rule', 'watch-server', 'gpu_available', 'GPU-1', 0, 1, 5, 1024, 300, 900, 'now', 'now')",
        [],
    )
    .expect("uuid rule");
    assert!(conn.execute(
        "INSERT INTO watch_rules(id, server_id, kind, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at) VALUES('duplicate-uuid', 'watch-server', 'gpu_available', 'GPU-1', 1, 1, 5, 1024, 300, 900, 'now', 'now')",
        [],
    ).is_err());
}
