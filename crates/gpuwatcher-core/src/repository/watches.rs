use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Transaction};
use uuid::Uuid;

use super::{bool_to_i64, now_string, Repository};
use crate::error::AppError;
use crate::models::{
    CollectorGpu, GpuAvailableWatchInput, GpuAvailableWatchRule, NotificationOutboxEvent,
    SuccessEnvelope,
};

const DEFAULT_UTILIZATION: f64 = 5.0;
const DEFAULT_MEMORY_MIB: i64 = 1024;
const DEFAULT_SUSTAIN_SECONDS: i64 = 300;
const DEFAULT_COOLDOWN_SECONDS: i64 = 900;

struct ImmediateTransactionGuard<'a> {
    conn: &'a rusqlite::Connection,
    active: bool,
}

impl<'a> ImmediateTransactionGuard<'a> {
    fn begin(conn: &'a rusqlite::Connection) -> Result<Self, rusqlite::Error> {
        conn.execute_batch("BEGIN IMMEDIATE")?;
        Ok(Self { conn, active: true })
    }

    fn prepare<'stmt>(
        &'stmt self,
        sql: &str,
    ) -> Result<rusqlite::Statement<'stmt>, rusqlite::Error> {
        self.conn.prepare(sql)
    }

    fn execute<P>(&self, sql: &str, params: P) -> Result<usize, rusqlite::Error>
    where
        P: rusqlite::Params,
    {
        self.conn.execute(sql, params)
    }

    fn commit(mut self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch("COMMIT")?;
        self.active = false;
        Ok(())
    }
}

impl Drop for ImmediateTransactionGuard<'_> {
    fn drop(&mut self) {
        if self.active {
            let _ = self.conn.execute_batch("ROLLBACK");
        }
    }
}

impl Repository {
    pub fn list_watch_rules(
        &self,
        server_id: &str,
    ) -> Result<Vec<GpuAvailableWatchRule>, AppError> {
        let mut statement = self.conn.prepare("SELECT id, server_id, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at FROM watch_rules WHERE server_id = ?1 AND kind = 'gpu_available' ORDER BY created_at")?;
        let rules = statement
            .query_map(params![server_id], read_rule)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from);
        rules
    }

    pub fn save_gpu_available_watch(
        &self,
        input: GpuAvailableWatchInput,
    ) -> Result<GpuAvailableWatchRule, AppError> {
        let now = now_string();
        let utilization = input
            .utilization_threshold_percent
            .unwrap_or(DEFAULT_UTILIZATION);
        let memory = input.memory_threshold_mib.unwrap_or(DEFAULT_MEMORY_MIB);
        let sustain = input.sustain_seconds.unwrap_or(DEFAULT_SUSTAIN_SECONDS);
        let cooldown = input.cooldown_seconds.unwrap_or(DEFAULT_COOLDOWN_SECONDS);
        if !(0.0..=100.0).contains(&utilization)
            || input.gpu_index < 0
            || memory < 0
            || sustain < 0
            || cooldown < 0
        {
            return Err(AppError::new(
                "storage_app",
                "watch_config_invalid",
                "watch thresholds and durations must be non-negative",
            ));
        }
        let transaction = self.conn.unchecked_transaction()?;
        let id = match input.id.as_deref() {
            Some(id) => {
                let owner = transaction.query_row("SELECT server_id FROM watch_rules WHERE id = ?1", params![id], |row| row.get::<_, String>(0)).optional()?;
                match owner {
                    Some(owner) if owner == input.server_id => id.to_string(),
                    Some(_) => return Err(AppError::new("storage_app", "watch_server_mismatch", "watch rule belongs to another server")),
                    None => return Err(AppError::new("storage_app", "watch_not_found", "watch rule not found")),
                }
            }
            None => transaction.query_row(
                "SELECT id FROM watch_rules WHERE server_id = ?1 AND kind = 'gpu_available' AND ((gpu_uuid IS NOT NULL AND gpu_uuid = ?2) OR (gpu_uuid IS NULL AND ?2 IS NULL AND gpu_index = ?3))",
                params![input.server_id, input.gpu_uuid, input.gpu_index],
                |row| row.get::<_, String>(0),
            ).optional()?.unwrap_or_else(|| Uuid::new_v4().to_string()),
        };
        let existing = transaction.query_row("SELECT server_id, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at FROM watch_rules WHERE id = ?1", params![id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?, row.get::<_, f64>(4)?, row.get::<_, i64>(5)?, row.get::<_, i64>(6)?, row.get::<_, i64>(7)?, row.get::<_, String>(8)?))).optional()?;
        let changed = existing.as_ref().is_none_or(|current| {
            current.0 != input.server_id
                || current.1 != input.gpu_uuid
                || current.2 != input.gpu_index
                || current.3 != bool_to_i64(input.enabled)
                || current.4 != utilization
                || current.5 != memory
                || current.6 != sustain
                || current.7 != cooldown
        });
        let created_at = existing
            .as_ref()
            .map(|current| current.8.clone())
            .unwrap_or_else(|| now.clone());
        transaction.execute("INSERT INTO watch_rules(id, server_id, kind, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at) VALUES(?1, ?2, 'gpu_available', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ON CONFLICT(id) DO UPDATE SET server_id=excluded.server_id, gpu_uuid=excluded.gpu_uuid, gpu_index=excluded.gpu_index, enabled=excluded.enabled, utilization_threshold_percent=excluded.utilization_threshold_percent, memory_threshold_mib=excluded.memory_threshold_mib, sustain_seconds=excluded.sustain_seconds, cooldown_seconds=excluded.cooldown_seconds, updated_at=excluded.updated_at", params![id, input.server_id, input.gpu_uuid, input.gpu_index, bool_to_i64(input.enabled), utilization, memory, sustain, cooldown, created_at, now])?;
        if changed {
            transaction.execute("INSERT INTO watch_runtime_state(rule_id, condition_started_at, last_triggered_at, armed, updated_at) VALUES(?1, NULL, NULL, 1, ?2) ON CONFLICT(rule_id) DO UPDATE SET condition_started_at=NULL, last_triggered_at=NULL, armed=1, updated_at=excluded.updated_at", params![id, now])?;
        }
        transaction.commit()?;
        self.get_watch_rule(&id)?.ok_or_else(|| {
            AppError::new("storage_app", "watch_not_found", "saved watch disappeared")
        })
    }

    pub fn delete_watch_rule(&self, id: &str) -> Result<(), AppError> {
        self.conn
            .execute("DELETE FROM watch_rules WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn consume_notification_outbox(&self) -> Result<Vec<NotificationOutboxEvent>, AppError> {
        let transaction = ImmediateTransactionGuard::begin(&self.conn)?;
        let mut statement = transaction.prepare("SELECT id, rule_id, server_id, event_type, title, body, created_at FROM notification_outbox WHERE consumed_at IS NULL ORDER BY created_at, id")?;
        let events = statement
            .query_map([], read_event)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        for event in &events {
            transaction.execute(
                "DELETE FROM notification_outbox WHERE id = ?1",
                params![&event.id],
            )?;
        }
        transaction.commit()?;
        Ok(events)
    }

    fn get_watch_rule(&self, id: &str) -> Result<Option<GpuAvailableWatchRule>, AppError> {
        self.conn.query_row("SELECT id, server_id, gpu_uuid, gpu_index, enabled, utilization_threshold_percent, memory_threshold_mib, sustain_seconds, cooldown_seconds, created_at, updated_at FROM watch_rules WHERE id = ?1", params![id], read_rule).optional().map_err(AppError::from)
    }
}

pub(super) fn evaluate_success(
    transaction: &Transaction<'_>,
    server_id: &str,
    success: &SuccessEnvelope,
    at: &str,
) -> Result<(), AppError> {
    let server_name = transaction.query_row(
        "SELECT name FROM servers WHERE id = ?1",
        params![server_id],
        |row| row.get::<_, String>(0),
    )?;
    let mut statement = transaction.prepare("SELECT r.id, r.gpu_uuid, r.gpu_index, r.utilization_threshold_percent, r.memory_threshold_mib, r.sustain_seconds, r.cooldown_seconds, s.condition_started_at, s.last_triggered_at, s.armed FROM watch_rules r JOIN watch_runtime_state s ON s.rule_id = r.id WHERE r.server_id = ?1 AND r.kind = 'gpu_available' AND r.enabled = 1")?;
    let rows = statement.query_map(params![server_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, i64>(9)?,
        ))
    })?;
    for row in rows {
        let (id, uuid, index, utilization, memory, sustain, cooldown, started, last, armed) = row?;
        let gpu = matching_gpu(&success.gpus, uuid.as_deref(), index);
        let eligible = gpu.is_some_and(|gpu| {
            gpu.gpu_utilization_percent
                .is_some_and(|value| value <= utilization)
                && gpu.memory_used_mib.is_some_and(|value| value <= memory)
        });
        if !eligible {
            reset(transaction, &id, at)?;
            continue;
        }
        let started = match started {
            Some(started) if elapsed(&started, at)? >= 0 => started,
            Some(_) | None => at.to_string(),
        };
        let sustained = elapsed(&started, at)? >= sustain;
        let cooled = last
            .as_deref()
            .map(|value| elapsed(value, at).map(|seconds| seconds >= cooldown))
            .transpose()?
            .unwrap_or(true);
        if armed != 0 && sustained && cooled {
            let gpu_label = gpu.map(|value| value.index).unwrap_or(index);
            transaction.execute("INSERT INTO notification_outbox(id, rule_id, server_id, event_type, title, body, created_at) VALUES(?1, ?2, ?3, 'gpu_available', 'GPU available', ?4, ?5)", params![Uuid::new_v4().to_string(), id, server_id, format!("{server_name} · GPU {gpu_label} is available"), at])?;
            transaction.execute("UPDATE watch_runtime_state SET condition_started_at=?1, last_triggered_at=?1, armed=0, updated_at=?1 WHERE rule_id=?2", params![at, id])?;
        } else {
            transaction.execute("UPDATE watch_runtime_state SET condition_started_at=?1, updated_at=?1 WHERE rule_id=?2", params![started, id])?;
        }
    }
    Ok(())
}

pub(super) fn reset_server(
    transaction: &Transaction<'_>,
    server_id: &str,
    at: &str,
) -> Result<(), AppError> {
    transaction.execute("UPDATE watch_runtime_state SET condition_started_at=NULL, updated_at=?1 WHERE rule_id IN (SELECT id FROM watch_rules WHERE server_id=?2)", params![at, server_id])?;
    Ok(())
}

fn reset(transaction: &Transaction<'_>, id: &str, at: &str) -> Result<(), AppError> {
    transaction.execute("UPDATE watch_runtime_state SET condition_started_at=NULL, armed=1, updated_at=?1 WHERE rule_id=?2", params![at, id])?;
    Ok(())
}

fn matching_gpu<'a>(
    gpus: &'a [CollectorGpu],
    uuid: Option<&str>,
    index: i64,
) -> Option<&'a CollectorGpu> {
    match uuid {
        Some(uuid) => gpus.iter().find(|gpu| gpu.uuid == uuid),
        None => gpus.iter().find(|gpu| gpu.index == index),
    }
}

fn elapsed(start: &str, end: &str) -> Result<i64, AppError> {
    let start = DateTime::parse_from_rfc3339(start)
        .map_err(|err| AppError::new("storage_app", "watch_timestamp_invalid", err.to_string()))?
        .with_timezone(&Utc);
    let end = DateTime::parse_from_rfc3339(end)
        .map_err(|err| AppError::new("storage_app", "watch_timestamp_invalid", err.to_string()))?
        .with_timezone(&Utc);
    Ok((end - start).num_seconds())
}

fn read_rule(row: &rusqlite::Row<'_>) -> rusqlite::Result<GpuAvailableWatchRule> {
    Ok(GpuAvailableWatchRule {
        id: row.get(0)?,
        server_id: row.get(1)?,
        gpu_uuid: row.get(2)?,
        gpu_index: row.get(3)?,
        enabled: row.get::<_, i64>(4)? != 0,
        utilization_threshold_percent: row.get(5)?,
        memory_threshold_mib: row.get(6)?,
        sustain_seconds: row.get(7)?,
        cooldown_seconds: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}
fn read_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<NotificationOutboxEvent> {
    Ok(NotificationOutboxEvent {
        id: row.get(0)?,
        rule_id: row.get(1)?,
        server_id: row.get(2)?,
        event_type: row.get(3)?,
        title: row.get(4)?,
        body: row.get(5)?,
        created_at: row.get(6)?,
    })
}
