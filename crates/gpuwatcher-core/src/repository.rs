use std::collections::HashMap;
use std::path::Path;

use chrono::{Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::config::DEFAULT_POLLING_INTERVAL_SECONDS;
use crate::error::AppError;
use crate::models::{
    GpuHistoryResponseDto, GpuHistorySampleDto, GpuHistorySeriesDto, LatestSnapshot, Server,
    ServerHealth, ServerInput, SuccessEnvelope,
};

const GPU_HISTORY_RETENTION_HOURS: i64 = 24;

pub struct Repository {
    conn: Connection,
}

impl Repository {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        Self::from_connection(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, AppError> {
        let repository = Self::from_connection(Connection::open_in_memory()?)?;
        repository.migrate()?;
        Ok(repository)
    }

    fn from_connection(conn: Connection) -> Result<Self, AppError> {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self { conn })
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
        Ok(())
    }

    pub fn list_servers(&self) -> Result<Vec<Server>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT id, name, host, port, username, ssh_key_path,
                    polling_interval_seconds, enabled, config_revision, created_at, updated_at
             FROM servers ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], read_server)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn get_server(&self, id: &str) -> Result<Option<Server>, AppError> {
        self.conn
            .query_row(
                "SELECT id, name, host, port, username, ssh_key_path,
                        polling_interval_seconds, enabled, config_revision, created_at, updated_at
                 FROM servers WHERE id = ?1",
                params![id],
                read_server,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn save_server(&self, input: ServerInput) -> Result<Server, AppError> {
        let now = now_string();
        let normalized = normalize_server_input(input)?;
        let NormalizedServerInput {
            id,
            name,
            host,
            port,
            username,
            ssh_key_path,
            polling_interval_seconds,
            enabled,
        } = normalized;

        if let Some(id) = id {
            let current = self.get_server(&id)?.ok_or_else(|| {
                AppError::new("storage_app", "server_not_found", "server not found")
            })?;
            let changed = self.conn.execute(
                "UPDATE servers
                 SET name = ?1, host = ?2, port = ?3, username = ?4, ssh_key_path = ?5,
                     polling_interval_seconds = ?6, enabled = ?7,
                     config_revision = config_revision + 1, updated_at = ?8
                WHERE id = ?9",
                params![
                    &name,
                    &host,
                    port,
                    &username,
                    &ssh_key_path,
                    polling_interval_seconds,
                    bool_to_i64(enabled),
                    &now,
                    &id
                ],
            )?;
            if changed == 0 {
                return Err(AppError::new(
                    "storage_app",
                    "server_not_found",
                    "server not found",
                ));
            }
            self.ensure_health(&id, if enabled { "idle" } else { "disabled" })?;
            return self.get_server(&id)?.ok_or_else(|| {
                AppError::new(
                    "storage_app",
                    "server_not_found",
                    format!("updated server {} disappeared", current.id),
                )
            });
        }

        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO servers(id, name, host, port, username, ssh_key_path,
                  polling_interval_seconds, enabled, config_revision, created_at, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10)",
            params![
                &id,
                &name,
                &host,
                port,
                &username,
                &ssh_key_path,
                polling_interval_seconds,
                bool_to_i64(enabled),
                &now,
                &now
            ],
        )?;
        self.ensure_health(&id, if enabled { "idle" } else { "disabled" })?;
        self.get_server(&id)?.ok_or_else(|| {
            AppError::new(
                "storage_app",
                "server_not_found",
                "created server not found",
            )
        })
    }

    pub fn delete_server(&self, id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM latest_snapshots WHERE server_id = ?1",
            params![id],
        )?;
        self.conn.execute(
            "DELETE FROM server_health WHERE server_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM servers WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_server_enabled(&self, id: &str, enabled: bool) -> Result<Server, AppError> {
        let now = now_string();
        let changed = self.conn.execute(
            "UPDATE servers SET enabled = ?1, config_revision = config_revision + 1, updated_at = ?2 WHERE id = ?3",
            params![bool_to_i64(enabled), now, id],
        )?;
        if changed == 0 {
            return Err(AppError::new(
                "storage_app",
                "server_not_found",
                "server not found",
            ));
        }
        self.ensure_health(id, if enabled { "idle" } else { "disabled" })?;
        self.get_server(id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))
    }

    pub fn all_health(&self) -> Result<HashMap<String, ServerHealth>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT server_id, status, last_error_type, last_error_message,
                    last_poll_started_at, last_poll_finished_at, last_success_at
             FROM server_health",
        )?;
        let rows = statement.query_map([], read_health)?;
        let mut result = HashMap::new();
        for row in rows {
            let health = row?;
            result.insert(health.server_id.clone(), health);
        }
        Ok(result)
    }

    pub fn get_health(&self, id: &str) -> Result<Option<ServerHealth>, AppError> {
        self.conn
            .query_row(
                "SELECT server_id, status, last_error_type, last_error_message,
                        last_poll_started_at, last_poll_finished_at, last_success_at
                 FROM server_health WHERE server_id = ?1",
                params![id],
                read_health,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn all_latest_snapshots(&self) -> Result<HashMap<String, LatestSnapshot>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT server_id, protocol_version, schema_version, received_at, raw_json, parsed_summary_json
             FROM latest_snapshots",
        )?;
        let rows = statement.query_map([], read_snapshot)?;
        let mut result = HashMap::new();
        for row in rows {
            let snapshot = row?;
            result.insert(snapshot.server_id.clone(), snapshot);
        }
        Ok(result)
    }

    pub fn latest_snapshot(&self, id: &str) -> Result<Option<LatestSnapshot>, AppError> {
        self.conn
            .query_row(
                "SELECT server_id, protocol_version, schema_version, received_at, raw_json, parsed_summary_json
                 FROM latest_snapshots WHERE server_id = ?1",
                params![id],
                read_snapshot,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn mark_poll_started(&self, id: &str, started_at: &str) -> Result<(), AppError> {
        let changed = self.conn.execute(
            "UPDATE server_health
             SET status = 'polling', last_poll_started_at = ?1, last_poll_finished_at = NULL
             WHERE server_id = ?2",
            params![started_at, id],
        )?;
        if changed == 0 {
            return Err(AppError::new(
                "storage_app",
                "server_not_found",
                "server not found",
            ));
        }
        Ok(())
    }

    pub fn store_success(
        &self,
        id: &str,
        raw_json: &str,
        success: &SuccessEnvelope,
        finished_at: &str,
    ) -> Result<(), AppError> {
        let summary_json = serde_json::to_string(success).map_err(|err| {
            AppError::new("storage_app", "snapshot_write_failed", err.to_string())
        })?;
        let retention_cutoff = gpu_history_retention_cutoff(finished_at)?;
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO latest_snapshots(server_id, protocol_version, schema_version, received_at, raw_json, parsed_summary_json)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(server_id) DO UPDATE SET
               protocol_version = excluded.protocol_version,
               schema_version = excluded.schema_version,
               received_at = excluded.received_at,
                raw_json = excluded.raw_json,
                parsed_summary_json = excluded.parsed_summary_json",
            params![id, success.protocol_version, success.schema_version, finished_at, raw_json, summary_json],
        )?;
        for gpu in &success.gpus {
            transaction.execute(
                "INSERT INTO gpu_history_samples(
                   server_id, received_at, gpu_index, gpu_uuid, name,
                   memory_total_mib, memory_used_mib, memory_free_mib,
                   gpu_utilization_percent, memory_utilization_percent,
                   encoder_utilization_percent, decoder_utilization_percent,
                   jpeg_utilization_percent, ofa_utilization_percent,
                   temperature_celsius, power_draw_watt, power_limit_watt,
                   pcie_rx_kib_per_sec, pcie_tx_kib_per_sec)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
                 ON CONFLICT(server_id, received_at, gpu_index) DO UPDATE SET
                   gpu_uuid = excluded.gpu_uuid,
                   name = excluded.name,
                   memory_total_mib = excluded.memory_total_mib,
                   memory_used_mib = excluded.memory_used_mib,
                   memory_free_mib = excluded.memory_free_mib,
                   gpu_utilization_percent = excluded.gpu_utilization_percent,
                   memory_utilization_percent = excluded.memory_utilization_percent,
                   encoder_utilization_percent = excluded.encoder_utilization_percent,
                   decoder_utilization_percent = excluded.decoder_utilization_percent,
                   jpeg_utilization_percent = excluded.jpeg_utilization_percent,
                   ofa_utilization_percent = excluded.ofa_utilization_percent,
                   temperature_celsius = excluded.temperature_celsius,
                   power_draw_watt = excluded.power_draw_watt,
                   power_limit_watt = excluded.power_limit_watt,
                   pcie_rx_kib_per_sec = excluded.pcie_rx_kib_per_sec,
                   pcie_tx_kib_per_sec = excluded.pcie_tx_kib_per_sec",
                params![
                    id,
                    finished_at,
                    gpu.index,
                    &gpu.uuid,
                    &gpu.name,
                    gpu.memory_total_mib,
                    gpu.memory_used_mib,
                    gpu.memory_free_mib,
                    gpu.gpu_utilization_percent,
                    gpu.memory_utilization_percent,
                    gpu.encoder_utilization_percent,
                    gpu.decoder_utilization_percent,
                    gpu.jpeg_utilization_percent,
                    gpu.ofa_utilization_percent,
                    gpu.temperature_celsius,
                    gpu.power_draw_watt,
                    gpu.power_limit_watt,
                    gpu.pcie_rx_kib_per_sec,
                    gpu.pcie_tx_kib_per_sec,
                ],
            )?;
        }
        transaction.execute(
            "DELETE FROM gpu_history_samples WHERE server_id = ?1 AND received_at < ?2",
            params![id, retention_cutoff],
        )?;
        transaction.execute(
            "UPDATE server_health
             SET status = 'online', last_error_type = NULL, last_error_message = NULL,
                 last_poll_finished_at = ?1, last_success_at = ?1
             WHERE server_id = ?2",
            params![finished_at, id],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn prune_gpu_history(&self, reference_at: &str) -> Result<(), AppError> {
        let retention_cutoff = gpu_history_retention_cutoff(reference_at)?;
        self.conn.execute(
            "DELETE FROM gpu_history_samples WHERE received_at < ?1",
            params![retention_cutoff],
        )?;
        Ok(())
    }

    pub fn list_gpu_history(
        &self,
        server_id: &str,
        gpu_index: Option<i64>,
        gpu_uuid: Option<String>,
        range: &str,
        finished_at: &str,
    ) -> Result<GpuHistoryResponseDto, AppError> {
        let started_at = gpu_history_started_at(finished_at, range)?;
        let server = self
            .get_server(server_id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))?;
        let gpu_uuid_filter = gpu_uuid.as_deref();
        let mut statement = self.conn.prepare(
            "SELECT received_at, gpu_index, gpu_uuid, name,
                    memory_total_mib, memory_used_mib, memory_free_mib,
                    gpu_utilization_percent, memory_utilization_percent,
                    encoder_utilization_percent, decoder_utilization_percent,
                    jpeg_utilization_percent, ofa_utilization_percent,
                    temperature_celsius, power_draw_watt, power_limit_watt,
                    pcie_rx_kib_per_sec, pcie_tx_kib_per_sec
             FROM gpu_history_samples
             WHERE server_id = ?1
               AND received_at >= ?2
               AND received_at <= ?3
               AND (?4 IS NULL OR gpu_index = ?4)
               AND (?5 IS NULL OR gpu_uuid = ?5)
             ORDER BY gpu_index ASC, gpu_uuid ASC, received_at ASC",
        )?;
        let rows = statement.query_map(
            params![
                server_id,
                &started_at,
                finished_at,
                gpu_index,
                gpu_uuid_filter
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    GpuHistorySampleDto {
                        received_at: row.get(0)?,
                        memory_total_mib: row.get(4)?,
                        memory_used_mib: row.get(5)?,
                        memory_free_mib: row.get(6)?,
                        gpu_utilization_percent: row.get(7)?,
                        memory_utilization_percent: row.get(8)?,
                        encoder_utilization_percent: row.get(9)?,
                        decoder_utilization_percent: row.get(10)?,
                        jpeg_utilization_percent: row.get(11)?,
                        ofa_utilization_percent: row.get(12)?,
                        temperature_celsius: row.get(13)?,
                        power_draw_watt: row.get(14)?,
                        power_limit_watt: row.get(15)?,
                        pcie_rx_kib_per_sec: row.get(16)?,
                        pcie_tx_kib_per_sec: row.get(17)?,
                    },
                ))
            },
        )?;

        let mut series = Vec::<GpuHistorySeriesDto>::new();
        for row in rows {
            let (_received_at, row_gpu_index, row_gpu_uuid, row_name, sample) = row?;
            if let Some(existing) = series.last_mut().filter(|existing| {
                existing.gpu_index == row_gpu_index && existing.gpu_uuid == row_gpu_uuid
            }) {
                existing.samples.push(sample);
            } else {
                series.push(GpuHistorySeriesDto {
                    server_id: server.id.clone(),
                    server_name: server.name.clone(),
                    gpu_index: row_gpu_index,
                    gpu_uuid: row_gpu_uuid,
                    name: row_name,
                    samples: vec![sample],
                });
            }
        }

        Ok(GpuHistoryResponseDto {
            server_id: server.id,
            server_name: server.name,
            polling_interval_seconds: server.polling_interval_seconds,
            range: range.to_string(),
            started_at,
            finished_at: finished_at.to_string(),
            series,
        })
    }

    #[cfg(test)]
    pub fn gpu_history_sample_count(&self, id: &str) -> Result<i64, AppError> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM gpu_history_samples WHERE server_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(AppError::from)
    }

    pub fn store_failure(
        &self,
        id: &str,
        error: &AppError,
        finished_at: &str,
    ) -> Result<(), AppError> {
        let has_snapshot = self.latest_snapshot(id)?.is_some();
        let status = if has_snapshot {
            "stale"
        } else if error.layer == "transport_ssh" {
            "offline"
        } else {
            "error"
        };
        self.conn.execute(
            "UPDATE server_health
             SET status = ?1, last_error_type = ?2, last_error_message = ?3, last_poll_finished_at = ?4
             WHERE server_id = ?5",
            params![status, error.error_type, error.message, finished_at, id],
        )?;
        Ok(())
    }

    pub fn poll_target_current(
        &self,
        id: &str,
        expected_config_revision: i64,
    ) -> Result<bool, AppError> {
        Ok(self.get_server(id)?.is_some_and(|server| {
            server.enabled && server.config_revision == expected_config_revision
        }))
    }

    pub fn due_servers(&self) -> Result<Vec<Server>, AppError> {
        let servers = self.list_servers()?;
        let health = self.all_health()?;
        let now = Utc::now();
        Ok(servers
            .into_iter()
            .filter(|server| {
                if !server.enabled {
                    return false;
                }
                let Some(row) = health.get(&server.id) else {
                    return true;
                };
                if row.status == "polling" {
                    return false;
                }
                let reference = row
                    .last_poll_finished_at
                    .as_ref()
                    .or(row.last_poll_started_at.as_ref())
                    .or(row.last_success_at.as_ref());
                let Some(reference) = reference else {
                    return true;
                };
                let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(reference) else {
                    return true;
                };
                let interval_seconds = if row.status == "offline" {
                    server.polling_interval_seconds.saturating_mul(2)
                } else {
                    server.polling_interval_seconds
                };
                now.signed_duration_since(parsed.with_timezone(&Utc))
                    .num_seconds()
                    >= interval_seconds
            })
            .collect())
    }

    fn ensure_health(&self, id: &str, status: &str) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO server_health(server_id, status) VALUES(?1, ?2)
             ON CONFLICT(server_id) DO UPDATE SET status = excluded.status",
            params![id, status],
        )?;
        Ok(())
    }
}

struct NormalizedServerInput {
    id: Option<String>,
    name: String,
    host: String,
    port: i64,
    username: String,
    ssh_key_path: Option<String>,
    polling_interval_seconds: i64,
    enabled: bool,
}

fn normalize_server_input(input: ServerInput) -> Result<NormalizedServerInput, AppError> {
    let name = trim_required(input.name, "name")?;
    let host = validate_ssh_token(input.host, "host")?;
    let username = validate_ssh_token(input.username, "username")?;
    let port = if input.port > 0 { input.port } else { 22 };
    if !(1..=65_535).contains(&port) {
        return Err(config_error("port must be between 1 and 65535"));
    }
    let polling_interval_seconds = match input.polling_interval_seconds {
        Some(value) if (1..=86_400).contains(&value) => value,
        Some(_) => {
            return Err(config_error(
                "polling interval must be between 1 and 86400 seconds",
            ))
        }
        None => DEFAULT_POLLING_INTERVAL_SECONDS,
    };
    let ssh_key_path = validate_ssh_key_path(input.ssh_key_path)?;
    Ok(NormalizedServerInput {
        id: input.id,
        name,
        host,
        port,
        username,
        ssh_key_path,
        polling_interval_seconds,
        enabled: input.enabled,
    })
}

fn trim_required(value: String, label: &str) -> Result<String, AppError> {
    let trimmed = validate_single_line(value, label)?;
    if trimmed.is_empty() {
        return Err(config_error(format!("{label} is required")));
    }
    Ok(trimmed)
}

fn validate_ssh_token(value: String, label: &str) -> Result<String, AppError> {
    let trimmed = trim_required(value, label)?;
    if trimmed.starts_with('-') || trimmed.contains('@') || trimmed.chars().any(char::is_whitespace)
    {
        return Err(config_error(format!("{label} is not a valid SSH {label}")));
    }
    Ok(trimmed)
}

fn validate_ssh_key_path(value: Option<String>) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = validate_single_line(value, "SSH key path")?;
    if trimmed.is_empty() {
        return Ok(None);
    }
    let upper = trimmed.to_ascii_uppercase();
    if upper.contains("-----BEGIN") || upper.contains("PRIVATE KEY") || upper.contains("-----END") {
        return Err(config_error(
            "SSH key path must be a filesystem path, not private key material",
        ));
    }
    Ok(Some(trimmed))
}

fn validate_single_line(value: String, label: &str) -> Result<String, AppError> {
    if value
        .chars()
        .any(|ch| ch == '\0' || ch == '\n' || ch == '\r')
    {
        return Err(config_error(format!("{label} must be a single line")));
    }
    Ok(value.trim().to_string())
}

fn config_error(message: impl Into<String>) -> AppError {
    AppError::new("storage_app", "server_config_invalid", message.into())
}

pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn gpu_history_retention_cutoff(reference_at: &str) -> Result<String, AppError> {
    let parsed = chrono::DateTime::parse_from_rfc3339(reference_at).map_err(|err| {
        AppError::new(
            "storage_app",
            "history_retention_cutoff_invalid",
            err.to_string(),
        )
    })?;
    let cutoff = parsed - Duration::hours(GPU_HISTORY_RETENTION_HOURS);
    if reference_at.ends_with('Z') {
        Ok(cutoff
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Secs, true))
    } else {
        Ok(cutoff.to_rfc3339_opts(SecondsFormat::Secs, false))
    }
}

fn gpu_history_started_at(finished_at: &str, range: &str) -> Result<String, AppError> {
    let hours = match range {
        "1h" => 1,
        "6h" => 6,
        "24h" => 24,
        _ => {
            return Err(AppError::new(
                "storage_app",
                "invalid_history_range",
                "history range must be one of 1h, 6h, or 24h",
            ));
        }
    };
    let parsed = chrono::DateTime::parse_from_rfc3339(finished_at).map_err(|err| {
        AppError::new(
            "storage_app",
            "history_finished_at_invalid",
            err.to_string(),
        )
    })?;
    let started_at = parsed - Duration::hours(hours);
    if finished_at.ends_with('Z') {
        Ok(started_at
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Secs, true))
    } else {
        Ok(started_at.to_rfc3339_opts(SecondsFormat::Secs, false))
    }
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn read_server(row: &rusqlite::Row<'_>) -> rusqlite::Result<Server> {
    Ok(Server {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        ssh_key_path: row.get(5)?,
        polling_interval_seconds: row.get(6)?,
        enabled: row.get::<_, i64>(7)? != 0,
        config_revision: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn read_health(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServerHealth> {
    Ok(ServerHealth {
        server_id: row.get(0)?,
        status: row.get(1)?,
        last_error_type: row.get(2)?,
        last_error_message: row.get(3)?,
        last_poll_started_at: row.get(4)?,
        last_poll_finished_at: row.get(5)?,
        last_success_at: row.get(6)?,
    })
}

fn read_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<LatestSnapshot> {
    Ok(LatestSnapshot {
        server_id: row.get(0)?,
        protocol_version: row.get(1)?,
        schema_version: row.get(2)?,
        received_at: row.get(3)?,
        raw_json: row.get(4)?,
        parsed_summary_json: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ParsedCollectorPayload;
    use crate::protocol::parse_collector_json;

    fn sample_server_input() -> ServerInput {
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

    fn table_columns(repository: &Repository, table: &str) -> Vec<String> {
        let mut statement = repository
            .conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .expect("table info");
        statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("column names")
    }

    fn table_indexes(repository: &Repository, table: &str) -> Vec<String> {
        let mut statement = repository
            .conn
            .prepare(&format!("PRAGMA index_list({table})"))
            .expect("index list");
        statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("indexes")
            .collect::<Result<Vec<_>, _>>()
            .expect("index names")
    }

    fn success_fixture(path: &str) -> (String, SuccessEnvelope) {
        let raw = match path {
            "single" => include_str!("../../../fixtures/protocol/v1/success_single_gpu.json"),
            "multi" => include_str!("../../../fixtures/protocol/v1/success_multi_gpu.json"),
            _ => panic!("unknown fixture"),
        };
        let ParsedCollectorPayload::Success(success) = parse_collector_json(raw).expect("parse")
        else {
            panic!("expected success")
        };
        (raw.to_string(), success)
    }

    fn history_count(repository: &Repository, server_id: &str) -> i64 {
        repository
            .conn
            .query_row(
                "SELECT COUNT(*) FROM gpu_history_samples WHERE server_id = ?1",
                params![server_id],
                |row| row.get(0),
            )
            .expect("history count")
    }

    #[test]
    fn migrate_v1_drops_legacy_collector_command_and_preserves_settings() {
        let conn = Connection::open_in_memory().expect("connection");
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

        let repository = Repository::from_connection(conn).expect("repo");
        repository.migrate().expect("migration");

        assert!(!column_exists(&repository.conn, "servers", "collector_command").expect("columns"));
        let migrations = repository
            .conn
            .query_row(
                "SELECT group_concat(version, ',') FROM schema_migrations ORDER BY version",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("migrations");
        assert_eq!(migrations, "1,2");
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
        assert_eq!(server.created_at, "2026-06-01T00:00:00Z");
        assert_eq!(server.updated_at, "2026-06-01T00:05:00Z");
    }

    #[test]
    fn migrate_creates_gpu_history_schema_indexes_and_version_marker_idempotently() {
        let repository = Repository::in_memory().expect("repo");
        repository.migrate().expect("second migration");

        let migrations = repository
            .conn
            .query_row(
                "SELECT group_concat(version, ',') FROM schema_migrations ORDER BY version",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("migrations");
        assert_eq!(migrations, "1,2");

        assert_eq!(
            table_columns(&repository, "gpu_history_samples"),
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

        let indexes = table_indexes(&repository, "gpu_history_samples");
        assert!(indexes.contains(&"idx_gpu_history_server_received".to_string()));
        assert!(indexes.contains(&"idx_gpu_history_server_gpu_index_received".to_string()));
        assert!(indexes.contains(&"idx_gpu_history_server_gpu_uuid_received".to_string()));
    }

    #[test]
    fn deleting_server_cascades_gpu_history_samples() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        repository
            .conn
            .execute(
                "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
                 VALUES(?1, ?2, ?3, ?4, ?5)",
                params![
                    &server.id,
                    "2026-06-01T00:00:00Z",
                    0,
                    "GPU-123",
                    "NVIDIA Test GPU"
                ],
            )
            .expect("history sample");

        repository.delete_server(&server.id).expect("deleted");

        let remaining = repository
            .conn
            .query_row(
                "SELECT COUNT(*) FROM gpu_history_samples WHERE server_id = ?1",
                params![&server.id],
                |row| row.get::<_, i64>(0),
            )
            .expect("history count");
        assert_eq!(remaining, 0);
    }

    #[test]
    fn store_success_inserts_one_gpu_history_sample_per_gpu() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let (raw, success) = success_fixture("multi");

        repository
            .store_success(&server.id, &raw, &success, "2026-06-02T00:00:00Z")
            .expect("success stored");

        let (count, received_at) = repository
            .conn
            .query_row(
                "SELECT COUNT(*), MIN(received_at) FROM gpu_history_samples WHERE server_id = ?1",
                params![&server.id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .expect("history summary");
        assert_eq!(count, success.gpus.len() as i64);
        assert_eq!(received_at, "2026-06-02T00:00:00Z");
    }

    #[test]
    fn list_gpu_history_groups_all_gpus_with_ascending_samples() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let (raw, mut first_success) = success_fixture("multi");
        first_success.gpus[0].memory_used_mib = Some(1024);
        first_success.gpus[1].memory_used_mib = Some(64000);
        repository
            .store_success(&server.id, &raw, &first_success, "2026-06-02T00:00:00Z")
            .expect("first success stored");
        let (_raw, mut second_success) = success_fixture("multi");
        second_success.gpus[0].memory_used_mib = Some(2048);
        second_success.gpus[1].memory_used_mib = Some(65000);
        repository
            .store_success(&server.id, &raw, &second_success, "2026-06-02T00:30:00Z")
            .expect("second success stored");

        let history = repository
            .list_gpu_history(&server.id, None, None, "1h", "2026-06-02T01:00:00Z")
            .expect("history");

        assert_eq!(history.server_id, server.id);
        assert_eq!(history.server_name, server.name);
        assert_eq!(
            history.polling_interval_seconds,
            server.polling_interval_seconds
        );
        assert_eq!(history.range, "1h");
        assert_eq!(history.started_at, "2026-06-02T00:00:00Z");
        assert_eq!(history.finished_at, "2026-06-02T01:00:00Z");
        assert_eq!(history.series.len(), 2);
        assert_eq!(history.series[0].gpu_index, 0);
        assert_eq!(history.series[1].gpu_index, 1);
        assert_eq!(history.series[0].samples.len(), 2);
        assert_eq!(history.series[1].samples.len(), 2);
        assert_eq!(
            history.series[0].samples[0].received_at,
            "2026-06-02T00:00:00Z"
        );
        assert_eq!(
            history.series[0].samples[1].received_at,
            "2026-06-02T00:30:00Z"
        );
        assert_eq!(history.series[0].samples[0].memory_used_mib, Some(1024));
        assert_eq!(history.series[0].samples[1].memory_used_mib, Some(2048));
        assert_eq!(history.series[1].samples[0].memory_used_mib, Some(64000));
        assert_eq!(history.series[1].samples[1].memory_used_mib, Some(65000));
    }

    #[test]
    fn list_gpu_history_groups_by_gpu_index_and_uuid_when_names_drift() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        for (received_at, name, memory_used_mib) in [
            ("2026-06-02T00:00:00Z", Some("NVIDIA A100"), 1024),
            ("2026-06-02T00:15:00Z", None, 2048),
            ("2026-06-02T00:30:00Z", Some("NVIDIA A100-SXM4"), 3072),
        ] {
            repository
                .conn
                .execute(
                    "INSERT INTO gpu_history_samples(
                       server_id, received_at, gpu_index, gpu_uuid, name, memory_used_mib
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        &server.id,
                        received_at,
                        0,
                        "GPU-00000000-0000-0000-0000-000000000000",
                        name,
                        memory_used_mib
                    ],
                )
                .expect("history sample");
        }

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
        assert_eq!(
            history.series[0]
                .samples
                .iter()
                .map(|sample| sample.received_at.as_str())
                .collect::<Vec<_>>(),
            vec![
                "2026-06-02T00:00:00Z",
                "2026-06-02T00:15:00Z",
                "2026-06-02T00:30:00Z"
            ]
        );
        assert_eq!(history.series[0].samples[0].memory_used_mib, Some(1024));
        assert_eq!(history.series[0].samples[1].memory_used_mib, Some(2048));
        assert_eq!(history.series[0].samples[2].memory_used_mib, Some(3072));
    }

    #[test]
    fn list_gpu_history_filters_by_gpu_index() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let (raw, success) = success_fixture("multi");
        repository
            .store_success(&server.id, &raw, &success, "2026-06-02T00:00:00Z")
            .expect("success stored");

        let history = repository
            .list_gpu_history(&server.id, Some(1), None, "6h", "2026-06-02T01:00:00Z")
            .expect("history");

        assert_eq!(history.series.len(), 1);
        assert_eq!(history.series[0].gpu_index, 1);
        assert_eq!(
            history.series[0].gpu_uuid.as_deref(),
            Some("GPU-22222222-2222-2222-2222-222222222222")
        );
    }

    #[test]
    fn list_gpu_history_filters_by_gpu_uuid() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let (raw, success) = success_fixture("multi");
        repository
            .store_success(&server.id, &raw, &success, "2026-06-02T00:00:00Z")
            .expect("success stored");

        let history = repository
            .list_gpu_history(
                &server.id,
                None,
                Some("GPU-00000000-0000-0000-0000-000000000000".to_string()),
                "24h",
                "2026-06-02T01:00:00Z",
            )
            .expect("history");

        assert_eq!(history.series.len(), 1);
        assert_eq!(history.series[0].gpu_index, 0);
        assert_eq!(
            history.series[0].gpu_uuid.as_deref(),
            Some("GPU-00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn list_gpu_history_rejects_invalid_range() {
        let repository = Repository::in_memory().expect("repo");

        let error = repository
            .list_gpu_history("missing", None, None, "2h", "2026-06-02T01:00:00Z")
            .expect_err("invalid range");

        assert_eq!(error.layer, "storage_app");
        assert_eq!(error.error_type, "invalid_history_range");
        assert_eq!(error.message, "history range must be one of 1h, 6h, or 24h");
    }

    #[test]
    fn list_gpu_history_rejects_missing_server() {
        let repository = Repository::in_memory().expect("repo");

        let error = repository
            .list_gpu_history("missing", None, None, "1h", "2026-06-02T01:00:00Z")
            .expect_err("missing server");

        assert_eq!(error.layer, "storage_app");
        assert_eq!(error.error_type, "server_not_found");
        assert_eq!(error.message, "server not found");
    }

    #[test]
    fn store_success_keeps_unknown_gpu_fields_null() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let (raw, mut success) = success_fixture("single");
        let gpu = success.gpus.first_mut().expect("gpu");
        gpu.memory_used_mib = None;
        gpu.gpu_utilization_percent = None;
        gpu.encoder_utilization_percent = None;
        gpu.temperature_celsius = None;
        gpu.pcie_rx_kib_per_sec = None;

        repository
            .store_success(&server.id, &raw, &success, "2026-06-02T00:00:00Z")
            .expect("success stored");

        let null_columns = repository
            .conn
            .query_row(
                "SELECT
                   memory_used_mib IS NULL,
                   gpu_utilization_percent IS NULL,
                   encoder_utilization_percent IS NULL,
                   temperature_celsius IS NULL,
                   pcie_rx_kib_per_sec IS NULL
                 FROM gpu_history_samples
                 WHERE server_id = ?1 AND gpu_index = 0",
                params![&server.id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .expect("null flags");
        assert_eq!(null_columns, (1, 1, 1, 1, 1));
    }

    #[test]
    fn store_failure_does_not_insert_or_prune_gpu_history() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        repository
            .conn
            .execute(
                "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
                 VALUES(?1, ?2, ?3, ?4, ?5)",
                params![&server.id, "2026-05-01T00:00:00Z", 0, "GPU-old", "Old GPU"],
            )
            .expect("old history sample");

        repository
            .store_failure(
                &server.id,
                &AppError::new("transport_ssh", "ssh_unreachable", "host unreachable"),
                "2026-06-02T00:00:00Z",
            )
            .expect("failure stored");

        assert_eq!(history_count(&repository, &server.id), 1);
    }

    #[test]
    fn store_success_prunes_older_than_24_hours_and_keeps_boundary() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        for received_at in [
            "2026-05-31T23:59:59Z",
            "2026-06-01T00:00:00Z",
            "2026-06-01T12:00:00Z",
        ] {
            repository
                .conn
                .execute(
                    "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
                     VALUES(?1, ?2, ?3, ?4, ?5)",
                    params![&server.id, received_at, 0, "GPU-old", "Old GPU"],
                )
                .expect("history sample");
        }
        let (raw, success) = success_fixture("single");

        repository
            .store_success(&server.id, &raw, &success, "2026-06-02T00:00:00Z")
            .expect("success stored");

        let timestamps = repository
            .conn
            .prepare(
                "SELECT received_at FROM gpu_history_samples WHERE server_id = ?1 ORDER BY received_at",
            )
            .expect("history query")
            .query_map(params![&server.id], |row| row.get::<_, String>(0))
            .expect("history rows")
            .collect::<Result<Vec<_>, _>>()
            .expect("timestamps");
        assert_eq!(
            timestamps,
            vec![
                "2026-06-01T00:00:00Z".to_string(),
                "2026-06-01T12:00:00Z".to_string(),
                "2026-06-02T00:00:00Z".to_string(),
            ]
        );
    }

    #[test]
    fn prune_gpu_history_uses_fixed_utc_24_hour_cutoff() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        for received_at in [
            "2026-06-01T09:59:59Z",
            "2026-06-01T10:00:00Z",
            "2026-06-01T10:00:01Z",
        ] {
            repository
                .conn
                .execute(
                    "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
                     VALUES(?1, ?2, ?3, ?4, ?5)",
                    params![&server.id, received_at, 0, "GPU-old", "Old GPU"],
                )
                .expect("history sample");
        }

        repository
            .prune_gpu_history("2026-06-02T10:00:00Z")
            .expect("history pruned");

        let timestamps = repository
            .conn
            .prepare(
                "SELECT received_at FROM gpu_history_samples WHERE server_id = ?1 ORDER BY received_at",
            )
            .expect("history query")
            .query_map(params![&server.id], |row| row.get::<_, String>(0))
            .expect("history rows")
            .collect::<Result<Vec<_>, _>>()
            .expect("timestamps");
        assert_eq!(
            timestamps,
            vec![
                "2026-06-01T10:00:00Z".to_string(),
                "2026-06-01T10:00:01Z".to_string(),
            ]
        );
    }

    #[test]
    fn server_input_validation_rejects_security_sensitive_values() {
        let repository = Repository::in_memory().expect("repo");
        let mut invalid_host = sample_server_input();
        invalid_host.host = "-oProxyCommand=touch".to_string();
        let error = repository
            .save_server(invalid_host)
            .expect_err("host rejected");
        assert_eq!(error.error_type, "server_config_invalid");

        let mut private_key_material = sample_server_input();
        private_key_material.ssh_key_path =
            Some("-----BEGIN OPENSSH PRIVATE KEY-----\nsecret".to_string());
        let error = repository
            .save_server(private_key_material)
            .expect_err("private key material rejected");
        assert_eq!(error.error_type, "server_config_invalid");
    }

    #[test]
    fn missing_server_enable_update_does_not_create_health_row() {
        let repository = Repository::in_memory().expect("repo");
        let error = repository
            .set_server_enabled("missing-server", false)
            .expect_err("missing server rejected");
        assert_eq!(error.error_type, "server_not_found");
        assert!(repository
            .get_health("missing-server")
            .expect("health lookup")
            .is_none());
    }

    #[test]
    fn poll_target_current_tracks_revision_enabled_and_delete() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        assert!(repository
            .poll_target_current(&server.id, server.config_revision)
            .expect("current"));

        let mut edited = sample_server_input();
        edited.id = Some(server.id.clone());
        edited.name = "Renamed Lab".to_string();
        let updated = repository.save_server(edited).expect("server updated");
        assert!(!repository
            .poll_target_current(&server.id, server.config_revision)
            .expect("old revision stale"));
        assert!(repository
            .poll_target_current(&updated.id, updated.config_revision)
            .expect("new revision current"));

        repository
            .set_server_enabled(&updated.id, false)
            .expect("disabled");
        assert!(!repository
            .poll_target_current(&updated.id, updated.config_revision + 1)
            .expect("disabled stale"));
        repository.delete_server(&updated.id).expect("deleted");
        assert!(!repository
            .poll_target_current(&updated.id, updated.config_revision + 1)
            .expect("deleted stale"));
    }

    #[test]
    fn due_servers_skip_polling_servers_and_apply_offline_backoff() {
        let repository = Repository::in_memory().expect("repo");
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
            .store_failure(&server.id, &error, &now_string())
            .expect("offline failure");
        assert!(repository.due_servers().expect("backoff").is_empty());
    }

    #[test]
    fn server_crud_persists_in_sqlite() {
        let repository = Repository::in_memory().expect("repo");
        let created = repository
            .save_server(sample_server_input())
            .expect("server saved");
        assert_eq!(repository.list_servers().expect("servers").len(), 1);
        repository.delete_server(&created.id).expect("deleted");
        assert!(repository.list_servers().expect("servers").is_empty());
    }

    #[test]
    fn failed_poll_preserves_latest_snapshot_and_marks_stale() {
        let repository = Repository::in_memory().expect("repo");
        let server = repository
            .save_server(sample_server_input())
            .expect("server saved");
        let raw = include_str!("../../../fixtures/protocol/v1/success_single_gpu.json");
        let ParsedCollectorPayload::Success(success) = parse_collector_json(raw).expect("parse")
        else {
            panic!("expected success")
        };
        repository
            .store_success(&server.id, raw, &success, "2026-06-01T00:00:00Z")
            .expect("success stored");
        repository
            .store_failure(
                &server.id,
                &AppError::new("transport_ssh", "ssh_unreachable", "host unreachable"),
                "2026-06-01T00:01:00Z",
            )
            .expect("failure stored");
        assert!(repository
            .latest_snapshot(&server.id)
            .expect("snapshot")
            .is_some());
        let health = repository
            .get_health(&server.id)
            .expect("health")
            .expect("health exists");
        assert_eq!(health.status, "stale");
        assert_eq!(health.last_error_type.as_deref(), Some("ssh_unreachable"));
    }
}
