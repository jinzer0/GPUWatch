use std::collections::HashMap;

use rusqlite::{params, OptionalExtension};

use super::history::gpu_history_retention_cutoff;
use super::mappers::read_snapshot;
use super::Repository;
use crate::error::AppError;
use crate::models::{LatestSnapshot, SuccessEnvelope};

impl Repository {
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

    pub fn store_failure(
        &self,
        id: &str,
        error: &AppError,
        finished_at: &str,
    ) -> Result<(), AppError> {
        let has_snapshot = self.latest_snapshot(id)?.is_some();
        let retention_cutoff = gpu_history_retention_cutoff(finished_at)?;
        let status = if has_snapshot {
            "stale"
        } else if error.layer == "transport_ssh" {
            "offline"
        } else {
            "error"
        };
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM gpu_history_samples WHERE server_id = ?1 AND received_at < ?2",
            params![id, retention_cutoff],
        )?;
        transaction.execute(
            "UPDATE server_health
             SET status = ?1, last_error_type = ?2, last_error_message = ?3, last_poll_finished_at = ?4
             WHERE server_id = ?5",
            params![status, error.error_type, error.message, finished_at, id],
        )?;
        transaction.commit()?;
        Ok(())
    }
}
