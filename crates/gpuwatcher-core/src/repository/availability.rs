use std::collections::HashSet;

use chrono::{DateTime, Duration};
use rusqlite::{params, OptionalExtension, Transaction};

use super::Repository;
use crate::error::AppError;
use crate::models::{GpuAvailabilityDto, SuccessEnvelope};

pub(super) fn max_observation_gap_seconds(interval: i64) -> i64 {
    interval.saturating_mul(2).saturating_add(60)
}

fn identity(uuid: &str, index: i64) -> String {
    if uuid.trim().is_empty() {
        format!("index:{index}")
    } else {
        format!("uuid:{uuid}")
    }
}

fn unknown() -> GpuAvailabilityDto {
    GpuAvailabilityDto {
        state: "unknown".to_string(),
        condition_started_at: None,
    }
}

fn elapsed(start: &str, end: &str) -> Option<Duration> {
    let start = DateTime::parse_from_rfc3339(start).ok()?;
    let end = DateTime::parse_from_rfc3339(end).ok()?;
    Some(end.signed_duration_since(start))
}

fn within_gap(duration: Duration, interval: i64) -> bool {
    duration >= Duration::zero()
        && duration
            <= Duration::try_seconds(max_observation_gap_seconds(interval)).unwrap_or(Duration::MAX)
}

impl Repository {
    pub fn gpu_availability(
        &self,
        server_id: &str,
        gpu_uuid: &str,
        gpu_index: i64,
        at: &str,
    ) -> Result<GpuAvailabilityDto, AppError> {
        let observation = self
            .conn
            .query_row(
                "SELECT s.enabled, s.polling_interval_seconds, h.status,
                    o.state, o.condition_started_at, o.last_observed_at
             FROM servers s JOIN server_health h ON h.server_id = s.id
             JOIN gpu_availability_observations o ON o.server_id = s.id
             WHERE s.id = ?1 AND o.gpu_identity = ?2",
                params![server_id, identity(gpu_uuid, gpu_index)],
                |row| {
                    Ok((
                        row.get::<_, bool>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((enabled, interval, health, state, started, observed)) = observation else {
            return Ok(unknown());
        };
        if !enabled
            || !matches!(health.as_str(), "online" | "polling")
            || !elapsed(&observed, at).is_some_and(|gap| within_gap(gap, interval))
        {
            return Ok(unknown());
        }
        Ok(GpuAvailabilityDto {
            state,
            condition_started_at: started,
        })
    }

    pub fn reset_availability_observations(&self, server_id: Option<&str>) -> Result<(), AppError> {
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM gpu_availability_observations WHERE ?1 IS NULL OR server_id = ?1",
            params![server_id],
        )?;
        transaction.execute(
            "UPDATE watch_runtime_state SET condition_started_at = NULL, last_observed_at = NULL
             WHERE ?1 IS NULL OR rule_id IN (SELECT id FROM watch_rules WHERE server_id = ?1)",
            params![server_id],
        )?;
        transaction.commit()?;
        Ok(())
    }
}

pub(super) fn reset_server(transaction: &Transaction<'_>, server_id: &str) -> Result<(), AppError> {
    transaction.execute(
        "DELETE FROM gpu_availability_observations WHERE server_id = ?1",
        params![server_id],
    )?;
    Ok(())
}

pub(super) fn evaluate_success(
    transaction: &Transaction<'_>,
    server_id: &str,
    success: &SuccessEnvelope,
    at: &str,
) -> Result<(), AppError> {
    let (enabled, interval) = transaction.query_row(
        "SELECT enabled, polling_interval_seconds FROM servers WHERE id = ?1",
        params![server_id],
        |row| Ok((row.get::<_, bool>(0)?, row.get::<_, i64>(1)?)),
    )?;
    if !enabled || DateTime::parse_from_rfc3339(at).is_err() {
        return reset_server(transaction, server_id);
    }
    let previous_snapshot_at = transaction
        .query_row(
            "SELECT received_at FROM latest_snapshots WHERE server_id = ?1",
            params![server_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if previous_snapshot_at
        .as_deref()
        .and_then(|previous| elapsed(previous, at))
        == Some(Duration::zero())
    {
        return Ok(());
    }
    let mut seen = HashSet::new();
    for gpu in &success.gpus {
        let key = identity(&gpu.uuid, gpu.index);
        if !seen.insert(key.clone()) {
            continue;
        }
        let previous = transaction
            .query_row(
                "SELECT condition_started_at, last_observed_at
             FROM gpu_availability_observations WHERE server_id = ?1 AND gpu_identity = ?2",
                params![server_id, &key],
                |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let gap = previous
            .as_ref()
            .and_then(|(_, observed)| elapsed(observed, at));
        if gap == Some(Duration::zero()) {
            continue;
        }
        let reversed = previous.is_some() && gap.is_none_or(|gap| gap < Duration::zero());
        let known = gpu
            .gpu_utilization_percent
            .is_some_and(|value| value.is_finite() && (0.0..=100.0).contains(&value))
            && gpu.memory_used_mib.is_some_and(|value| value >= 0);
        let eligible = known
            && gpu
                .gpu_utilization_percent
                .is_some_and(|value| value <= 5.0)
            && gpu.memory_used_mib.is_some_and(|value| value <= 1024);
        let (state, started) = if reversed || !known {
            ("unknown", None)
        } else if !eligible {
            ("in_use", None)
        } else {
            let started = previous
                .as_ref()
                .filter(|_| gap.is_some_and(|gap| within_gap(gap, interval)))
                .and_then(|(started, _)| started.as_ref())
                .filter(|started| elapsed(started, at).is_some_and(|age| age >= Duration::zero()))
                .cloned()
                .unwrap_or_else(|| at.to_string());
            let state = if elapsed(&started, at).is_some_and(|age| age >= Duration::seconds(300)) {
                "available"
            } else {
                "candidate"
            };
            (state, Some(started))
        };
        transaction.execute(
            "INSERT INTO gpu_availability_observations(server_id, gpu_identity, state, condition_started_at, last_observed_at)
             VALUES(?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(server_id, gpu_identity) DO UPDATE SET state = excluded.state,
               condition_started_at = excluded.condition_started_at, last_observed_at = excluded.last_observed_at",
            params![server_id, key, state, started, at],
        )?;
    }
    let mut statement = transaction
        .prepare("SELECT gpu_identity FROM gpu_availability_observations WHERE server_id = ?1")?;
    let stored = statement
        .query_map(params![server_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    for key in stored {
        if !seen.contains(&key) {
            transaction.execute(
                "DELETE FROM gpu_availability_observations WHERE server_id = ?1 AND gpu_identity = ?2",
                params![server_id, key],
            )?;
        }
    }
    Ok(())
}
