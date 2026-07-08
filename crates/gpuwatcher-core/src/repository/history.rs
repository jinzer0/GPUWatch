use chrono::{Duration, SecondsFormat, Utc};
use rusqlite::params;

use super::Repository;
use crate::error::AppError;
use crate::models::{GpuHistoryResponseDto, GpuHistorySampleDto, GpuHistorySeriesDto};

const GPU_HISTORY_RETENTION_HOURS: i64 = 24;

impl Repository {
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

    #[cfg(test)]
    pub fn gpu_history_sample_timestamps(&self, id: &str) -> Result<Vec<String>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT received_at FROM gpu_history_samples WHERE server_id = ?1 ORDER BY received_at",
        )?;
        let rows = statement.query_map(params![id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    #[cfg(test)]
    pub fn insert_gpu_history_sample_for_test(
        &self,
        id: &str,
        received_at: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO gpu_history_samples(server_id, received_at, gpu_index, gpu_uuid, name)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![id, received_at, 0, "GPU-test", "Test GPU"],
        )?;
        Ok(())
    }
}

pub(super) fn gpu_history_retention_cutoff(reference_at: &str) -> Result<String, AppError> {
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
