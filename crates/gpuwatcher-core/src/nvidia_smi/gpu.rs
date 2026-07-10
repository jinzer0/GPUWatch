use std::collections::HashMap;

use crate::error::AppError;
use crate::models::CollectorGpu;

use super::helpers::{
    parse_f64_optional, parse_i64_optional, parse_required_i64, parse_required_string,
    parse_string_optional,
};
use super::types::GpuRow;

const GPU_CSV_FIELD_COUNT: usize = 16;
const GPU_EXTRA_CSV_FIELD_COUNT: usize = 6;

pub(super) fn parse_gpu_csv(
    raw: &str,
    warnings: &mut Vec<String>,
) -> Result<Vec<GpuRow>, AppError> {
    let mut rows = Vec::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if fields.len() != GPU_CSV_FIELD_COUNT {
            return Err(AppError::new(
                "collector",
                "nvidia_smi_gpu_csv_malformed",
                format!(
                    "GPU CSV line {} has {} fields; expected {}",
                    line_number + 1,
                    fields.len(),
                    GPU_CSV_FIELD_COUNT
                ),
            ));
        }

        let index = parse_required_i64(fields[0], "index", line_number + 1)?;
        let uuid = parse_required_string(fields[1], "uuid", line_number + 1)?;
        let pci_bus_id = parse_string_optional(fields[2]);
        let name = parse_required_string(fields[3], "name", line_number + 1)?;
        let driver_version = parse_string_optional(fields[4]);
        let graphics_clock_mhz =
            parse_i64_optional(fields[14], "clocks.current.graphics", warnings).flatten();
        let memory_clock_mhz =
            parse_i64_optional(fields[15], "clocks.current.memory", warnings).flatten();

        rows.push(GpuRow {
            gpu: CollectorGpu {
                index,
                uuid: uuid.clone(),
                pci_bus_id: pci_bus_id.clone(),
                name,
                driver_version: driver_version.clone(),
                memory_total_mib: parse_i64_optional(fields[5], "memory.total", warnings).flatten(),
                memory_used_mib: parse_i64_optional(fields[6], "memory.used", warnings).flatten(),
                memory_free_mib: parse_i64_optional(fields[7], "memory.free", warnings).flatten(),
                gpu_utilization_percent: parse_f64_optional(fields[8], "utilization.gpu", warnings)
                    .flatten(),
                memory_utilization_percent: parse_f64_optional(
                    fields[9],
                    "utilization.memory",
                    warnings,
                )
                .flatten(),
                encoder_utilization_percent: None,
                decoder_utilization_percent: None,
                jpeg_utilization_percent: None,
                ofa_utilization_percent: None,
                pcie_rx_kib_per_sec: None,
                pcie_tx_kib_per_sec: None,
                pcie_link_gen_current: None,
                pcie_link_width_current: None,
                mig_mode_current: None,
                mig_mode_pending: None,
                mig_instance_count: None,
                temperature_celsius: parse_f64_optional(fields[10], "temperature.gpu", warnings)
                    .flatten(),
                power_draw_watt: parse_f64_optional(fields[11], "power.draw", warnings).flatten(),
                power_limit_watt: parse_f64_optional(fields[12], "power.limit", warnings).flatten(),
                fan_speed_percent: parse_f64_optional(fields[13], "fan.speed", warnings).flatten(),
                graphics_clock_mhz,
                memory_clock_mhz,
                process_count: 0,
                processes: Vec::new(),
            },
            driver_version,
            pci_bus_id,
            graphics_clock_mhz,
            memory_clock_mhz,
        });
    }

    if rows.is_empty() {
        return Err(AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            "GPU CSV did not contain any GPU rows",
        ));
    }

    Ok(rows)
}

pub(super) fn apply_gpu_extra_csv(rows: &mut [GpuRow], raw: &str, warnings: &mut Vec<String>) {
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if fields.len() != GPU_EXTRA_CSV_FIELD_COUNT {
            warnings.push(format!(
                "gpu-extra CSV line {} ignored: expected {} fields",
                line_number + 1,
                GPU_EXTRA_CSV_FIELD_COUNT
            ));
            continue;
        }
        let Some(index) = parse_i64_optional(fields[0], "gpu_extra.index", warnings).flatten()
        else {
            warnings.push(format!(
                "gpu-extra CSV line {} ignored: missing index",
                line_number + 1
            ));
            continue;
        };
        let uuid = parse_string_optional(fields[1]);
        if let Some(row) = rows.iter_mut().find(|row| {
            row.gpu.index == index && uuid.as_ref().is_none_or(|uuid| row.gpu.uuid == *uuid)
        }) {
            row.gpu.mig_mode_current = row
                .gpu
                .mig_mode_current
                .clone()
                .or_else(|| parse_string_optional(fields[2]));
            row.gpu.mig_mode_pending = row
                .gpu
                .mig_mode_pending
                .clone()
                .or_else(|| parse_string_optional(fields[3]));
            row.gpu.pcie_link_gen_current = row.gpu.pcie_link_gen_current.or_else(|| {
                parse_i64_optional(fields[4], "gpu_extra.pcie_link_gen_current", warnings).flatten()
            });
            row.gpu.pcie_link_width_current = row.gpu.pcie_link_width_current.or_else(|| {
                parse_i64_optional(fields[5], "gpu_extra.pcie_link_width_current", warnings)
                    .flatten()
            });
        }
    }
}

pub(super) fn apply_mig_list(rows: &mut [GpuRow], raw: &str) {
    let mut current_index = None;
    let mut counts: HashMap<i64, i64> = HashMap::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("GPU ") {
            current_index = rest
                .split_once(':')
                .and_then(|(index, _)| index.trim().parse::<i64>().ok());
            if let Some(index) = current_index {
                counts.entry(index).or_insert(0);
            }
            continue;
        }
        if trimmed.contains("MIG") && trimmed.contains("Device") {
            if let Some(index) = current_index {
                *counts.entry(index).or_insert(0) += 1;
            }
        }
    }
    for row in rows {
        if let Some(count) = counts.get(&row.gpu.index) {
            row.gpu.mig_instance_count = Some(*count);
        }
    }
}
