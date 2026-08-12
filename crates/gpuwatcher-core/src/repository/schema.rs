use std::path::Path;

use rusqlite::{params, Connection};

use super::{now_string, Repository};
use crate::error::AppError;

impl Repository {
    pub fn path_requires_legacy_collector_command_drop(path: &Path) -> Result<bool, AppError> {
        if !path.exists() {
            return Ok(false);
        }

        let conn = Connection::open(path)?;
        column_exists(&conn, "servers", "collector_command")
    }

    pub fn migrate(&self) -> Result<(), AppError> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS servers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              host TEXT NOT NULL,
              port INTEGER NOT NULL,
              username TEXT NOT NULL,
              ssh_key_path TEXT,
              polling_interval_seconds INTEGER NOT NULL,
              enabled INTEGER NOT NULL,
              config_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS server_health (
              server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
              status TEXT NOT NULL,
              last_error_type TEXT,
              last_error_message TEXT,
              last_poll_started_at TEXT,
              last_poll_finished_at TEXT,
              last_success_at TEXT
            );
            CREATE TABLE IF NOT EXISTS latest_snapshots (
              server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
              protocol_version INTEGER NOT NULL,
              schema_version INTEGER NOT NULL,
              received_at TEXT NOT NULL,
              raw_json TEXT NOT NULL,
              parsed_summary_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gpu_history_samples (
              server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
              received_at TEXT NOT NULL,
              gpu_index INTEGER NOT NULL,
              gpu_uuid TEXT,
              name TEXT,
              memory_total_mib INTEGER,
              memory_used_mib INTEGER,
              memory_free_mib INTEGER,
              gpu_utilization_percent REAL,
              memory_utilization_percent REAL,
              encoder_utilization_percent REAL,
              decoder_utilization_percent REAL,
              jpeg_utilization_percent REAL,
              ofa_utilization_percent REAL,
              temperature_celsius REAL,
              power_draw_watt REAL,
              power_limit_watt REAL,
              pcie_rx_kib_per_sec INTEGER,
              pcie_tx_kib_per_sec INTEGER,
              PRIMARY KEY (server_id, received_at, gpu_index)
            );
            CREATE INDEX IF NOT EXISTS idx_gpu_history_server_received
              ON gpu_history_samples(server_id, received_at);
            CREATE INDEX IF NOT EXISTS idx_gpu_history_server_gpu_index_received
              ON gpu_history_samples(server_id, gpu_index, received_at);
            CREATE INDEX IF NOT EXISTS idx_gpu_history_server_gpu_uuid_received
              ON gpu_history_samples(server_id, gpu_uuid, received_at);
            ",
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?1)",
            params![now_string()],
        )?;
        if column_exists(&self.conn, "servers", "collector_command")? {
            self.conn
                .execute_batch("ALTER TABLE servers DROP COLUMN collector_command;")?;
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?1)",
            params![now_string()],
        )?;
        let version_three_applied = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            params![3],
            |row| row.get::<_, bool>(0),
        )?;
        if version_three_applied {
            return Ok(());
        }

        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS watch_rules (
              id TEXT PRIMARY KEY,
              server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK(kind = 'gpu_available'),
              gpu_uuid TEXT,
              gpu_index INTEGER NOT NULL CHECK(gpu_index >= 0),
              enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
              utilization_threshold_percent REAL NOT NULL CHECK(utilization_threshold_percent >= 0 AND utilization_threshold_percent <= 100),
              memory_threshold_mib INTEGER NOT NULL CHECK(memory_threshold_mib >= 0),
              sustain_seconds INTEGER NOT NULL CHECK(sustain_seconds >= 0),
              cooldown_seconds INTEGER NOT NULL CHECK(cooldown_seconds >= 0),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_watch_rules_server ON watch_rules(server_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_rules_uuid_identity
              ON watch_rules(server_id, kind, gpu_uuid) WHERE gpu_uuid IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_rules_index_identity
              ON watch_rules(server_id, kind, gpu_index) WHERE gpu_uuid IS NULL;
            CREATE TABLE IF NOT EXISTS watch_runtime_state (
              rule_id TEXT PRIMARY KEY REFERENCES watch_rules(id) ON DELETE CASCADE,
              condition_started_at TEXT,
              last_triggered_at TEXT,
              armed INTEGER NOT NULL CHECK(armed IN (0, 1)),
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_outbox (
              id TEXT PRIMARY KEY,
              rule_id TEXT NOT NULL REFERENCES watch_rules(id) ON DELETE CASCADE,
              server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
              event_type TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              created_at TEXT NOT NULL,
              consumed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
              ON notification_outbox(consumed_at, created_at);
            ",
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?1)",
            params![now_string()],
        )?;
        transaction.commit()?;
        Ok(())
    }
}

pub(super) fn column_exists(
    conn: &Connection,
    table: &str,
    column: &str,
) -> Result<bool, AppError> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
