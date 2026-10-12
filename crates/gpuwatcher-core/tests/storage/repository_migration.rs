use gpuwatcher_core::repository::Repository;
use rusqlite::{params, Connection};

use super::fixtures::{
    backup_paths, open_repository, table_columns, table_indexes, SINGLE_SUCCESS_JSON,
};

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
    assert_eq!(migrations, "1,2,3,4");
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
    assert_eq!(migrations, "1,2,3,4");
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
            "updated_at",
            "last_observed_at"
        ]
    );
    assert_eq!(
        table_columns(&conn, "gpu_availability_observations"),
        vec![
            "server_id",
            "gpu_identity",
            "state",
            "condition_started_at",
            "last_observed_at"
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

fn preserved_rows(conn: &Connection, query: &str) -> Vec<Vec<rusqlite::types::Value>> {
    let mut statement = conn.prepare(query).expect("preservation query");
    let columns = statement.column_count();
    statement
        .query_map([], |row| {
            (0..columns)
                .map(|index| row.get(index))
                .collect::<Result<Vec<_>, _>>()
        })
        .expect("preservation rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("preserved values")
}

#[test]
fn additive_v4_preserves_real_v3_rows_without_backup_or_table_rebuild_and_is_idempotent() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let db_path = temp_dir.path().join("gpuwatcher.sqlite3");
    let conn = Connection::open(&db_path).expect("v3 connection");
    // Create the actual pre-v4 shape, not a current database with its marker removed.
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations VALUES
          (1, '2026-06-01T00:00:00Z'), (2, '2026-06-01T00:01:00Z'), (3, '2026-06-01T00:02:00Z');
        CREATE TABLE servers (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL,
          port INTEGER NOT NULL, username TEXT NOT NULL, ssh_key_path TEXT,
          polling_interval_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL,
          config_revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE server_health (
          server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
          status TEXT NOT NULL, last_error_type TEXT, last_error_message TEXT,
          last_poll_started_at TEXT, last_poll_finished_at TEXT, last_success_at TEXT
        );
        CREATE TABLE latest_snapshots (
          server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
          protocol_version INTEGER NOT NULL, schema_version INTEGER NOT NULL,
          received_at TEXT NOT NULL, raw_json TEXT NOT NULL, parsed_summary_json TEXT NOT NULL
        );
        CREATE TABLE gpu_history_samples (
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          received_at TEXT NOT NULL, gpu_index INTEGER NOT NULL, gpu_uuid TEXT, name TEXT,
          memory_total_mib INTEGER, memory_used_mib INTEGER, memory_free_mib INTEGER,
          gpu_utilization_percent REAL, memory_utilization_percent REAL,
          encoder_utilization_percent REAL, decoder_utilization_percent REAL,
          jpeg_utilization_percent REAL, ofa_utilization_percent REAL,
          temperature_celsius REAL, power_draw_watt REAL, power_limit_watt REAL,
          pcie_rx_kib_per_sec INTEGER, pcie_tx_kib_per_sec INTEGER,
          PRIMARY KEY (server_id, received_at, gpu_index)
        );
        CREATE INDEX idx_gpu_history_server_received ON gpu_history_samples(server_id, received_at);
        CREATE INDEX idx_gpu_history_server_gpu_index_received ON gpu_history_samples(server_id, gpu_index, received_at);
        CREATE INDEX idx_gpu_history_server_gpu_uuid_received ON gpu_history_samples(server_id, gpu_uuid, received_at);
        CREATE TABLE watch_rules (
          id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind = 'gpu_available'), gpu_uuid TEXT,
          gpu_index INTEGER NOT NULL CHECK(gpu_index >= 0), enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
          utilization_threshold_percent REAL NOT NULL CHECK(utilization_threshold_percent >= 0 AND utilization_threshold_percent <= 100),
          memory_threshold_mib INTEGER NOT NULL CHECK(memory_threshold_mib >= 0),
          sustain_seconds INTEGER NOT NULL CHECK(sustain_seconds >= 0),
          cooldown_seconds INTEGER NOT NULL CHECK(cooldown_seconds >= 0),
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_watch_rules_server ON watch_rules(server_id);
        CREATE UNIQUE INDEX idx_watch_rules_uuid_identity ON watch_rules(server_id, kind, gpu_uuid) WHERE gpu_uuid IS NOT NULL;
        CREATE UNIQUE INDEX idx_watch_rules_index_identity ON watch_rules(server_id, kind, gpu_index) WHERE gpu_uuid IS NULL;
        CREATE TABLE watch_runtime_state (
          rule_id TEXT PRIMARY KEY REFERENCES watch_rules(id) ON DELETE CASCADE,
          condition_started_at TEXT, last_triggered_at TEXT,
          armed INTEGER NOT NULL CHECK(armed IN (0, 1)), updated_at TEXT NOT NULL
        );
        CREATE TABLE notification_outbox (
          id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES watch_rules(id) ON DELETE CASCADE,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
          created_at TEXT NOT NULL, consumed_at TEXT
        );
        CREATE INDEX idx_notification_outbox_pending ON notification_outbox(consumed_at, created_at);
        INSERT INTO servers VALUES ('server-v3', 'V3 lab', 'v3.example.test', 2222, 'alice', '/test/key', 45, 1, 7,
          '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z');
        INSERT INTO server_health VALUES ('server-v3', 'stale', 'down', 'preserved error',
          '2026-06-02T00:05:00Z', '2026-06-02T00:05:01Z', '2026-06-02T00:04:00Z');
        INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name,
          memory_total_mib, memory_used_mib, gpu_utilization_percent, temperature_celsius)
          VALUES ('server-v3', '2026-06-02T00:04:00Z', 0, 'GPU-v3', 'V3 GPU', 24576, NULL, 0, 40.5);
        INSERT INTO watch_rules VALUES ('watch-v3', 'server-v3', 'gpu_available', 'GPU-v3', 0, 1,
          3.5, 512, 600, 1800, '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z');
        INSERT INTO watch_runtime_state VALUES ('watch-v3', '2026-06-02T00:00:00Z',
          '2026-06-02T00:04:00Z', 0, '2026-06-02T00:04:00Z');
        INSERT INTO notification_outbox VALUES
          ('pending-v3', 'watch-v3', 'server-v3', 'gpu_available', 'Configured condition met',
           'Pending preserved body', '2026-06-02T00:04:00Z', NULL),
          ('consumed-v3', 'watch-v3', 'server-v3', 'gpu_available', 'Configured condition met',
           'Consumed preserved body', '2026-06-01T00:04:00Z', '2026-06-01T00:05:00Z');
        ",
    ).expect("actual v3 schema and rows");
    let summary = serde_json::to_string(&super::fixtures::success_fixture(SINGLE_SUCCESS_JSON))
        .expect("fixture summary");
    conn.execute(
        "INSERT INTO latest_snapshots VALUES ('server-v3', 1, 1, '2026-06-02T00:04:00Z', ?1, ?2)",
        params![SINGLE_SUCCESS_JSON, summary],
    )
    .expect("v3 snapshot");
    let queries = [
        "SELECT * FROM servers ORDER BY id",
        "SELECT * FROM server_health ORDER BY server_id",
        "SELECT * FROM latest_snapshots ORDER BY server_id",
        "SELECT * FROM gpu_history_samples ORDER BY server_id, received_at, gpu_index",
        "SELECT * FROM watch_rules ORDER BY id",
        "SELECT rule_id, condition_started_at, last_triggered_at, armed, updated_at FROM watch_runtime_state ORDER BY rule_id",
        "SELECT * FROM notification_outbox ORDER BY id",
        "SELECT * FROM schema_migrations WHERE version <= 3 ORDER BY version",
        "SELECT name, rootpage FROM sqlite_master WHERE type = 'table' AND name != 'gpu_availability_observations' ORDER BY name",
    ];
    let before: Vec<_> = queries
        .iter()
        .map(|query| preserved_rows(&conn, query))
        .collect();
    assert!(!table_columns(&conn, "watch_runtime_state").contains(&"last_observed_at".to_string()));
    assert!(table_columns(&conn, "gpu_availability_observations").is_empty());
    drop(conn);

    // Exercise the production backup decision separately from startup history retention.
    assert!(
        gpuwatcher_core::state::backup_database_if_destructive_migration_needed(&db_path)
            .expect("v3 backup decision")
            .is_none()
    );
    let repository = Repository::open(&db_path).expect("v3 repository");
    repository.migrate().expect("upgrade v3");
    let mut first_v4_marker = None;
    for pass in 0..2 {
        if pass == 1 {
            repository.migrate().expect("second migration");
        }
        let conn = Connection::open(&db_path).expect("upgraded inspection");
        for (query, expected) in queries.iter().zip(&before) {
            assert_eq!(
                &preserved_rows(&conn, query),
                expected,
                "pass {pass}: {query}"
            );
        }
        assert_eq!(
            preserved_rows(
                &conn,
                "SELECT version FROM schema_migrations ORDER BY version"
            ),
            (1..=4)
                .map(|version| vec![rusqlite::types::Value::Integer(version)])
                .collect::<Vec<_>>()
        );
        let marker: String = conn
            .query_row(
                "SELECT applied_at FROM schema_migrations WHERE version = 4",
                [],
                |row| row.get(0),
            )
            .expect("v4 marker");
        if let Some(first) = &first_v4_marker {
            assert_eq!(&marker, first);
        } else {
            first_v4_marker = Some(marker);
        }
        let observed: Option<String> = conn
            .query_row(
                "SELECT last_observed_at FROM watch_runtime_state WHERE rule_id = 'watch-v3'",
                [],
                |row| row.get(0),
            )
            .expect("new nullable column");
        assert_eq!(observed, None);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM gpu_availability_observations",
                [],
                |row| row.get::<_, i64>(0)
            )
            .expect("empty observations"),
            0
        );
        assert!(backup_paths(temp_dir.path()).is_empty());
        assert!(preserved_rows(&conn, "PRAGMA foreign_key_check").is_empty());
    }
    let snapshot = repository
        .latest_snapshot("server-v3")
        .expect("snapshot")
        .expect("snapshot row");
    assert_eq!(snapshot.raw_json, SINGLE_SUCCESS_JSON);
    assert_eq!(snapshot.parsed_summary_json, summary);
    let rules = repository.list_watch_rules("server-v3").expect("rules");
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].utilization_threshold_percent, 3.5);
    assert_eq!(rules[0].memory_threshold_mib, 512);
    assert_eq!(rules[0].sustain_seconds, 600);
    assert_eq!(rules[0].cooldown_seconds, 1800);
    let events = repository
        .consume_notification_outbox()
        .expect("preserved pending event");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "pending-v3");
    assert_eq!(events[0].body, "Pending preserved body");
    assert!(repository
        .consume_notification_outbox()
        .expect("consume once")
        .is_empty());
}
