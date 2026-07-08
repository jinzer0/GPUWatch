use crate::models::CollectorProcess;

use super::types::{DmonSample, GpuRow, GpuSupplement, NvidiaSmiParseResult};

pub(super) fn finalize_result(
    rows: Vec<GpuRow>,
    warnings: Vec<String>,
    dmon_samples: Vec<DmonSample>,
) -> NvidiaSmiParseResult {
    let gpu_supplements: Vec<GpuSupplement> = rows
        .iter()
        .map(|row| GpuSupplement {
            index: row.gpu.index,
            uuid: row.gpu.uuid.clone(),
            pci_bus_id: row.pci_bus_id.clone(),
            driver_version: row.driver_version.clone(),
            graphics_clock_mhz: row.graphics_clock_mhz,
            memory_clock_mhz: row.memory_clock_mhz,
            pcie_link_gen_current: row.gpu.pcie_link_gen_current,
            pcie_link_width_current: row.gpu.pcie_link_width_current,
            mig_mode_current: row.gpu.mig_mode_current.clone(),
            mig_mode_pending: row.gpu.mig_mode_pending.clone(),
            mig_instance_count: row.gpu.mig_instance_count,
        })
        .collect();
    let mut gpus: Vec<_> = rows
        .into_iter()
        .map(|mut row| {
            row.gpu.process_count = row.gpu.processes.len() as i64;
            row.gpu
        })
        .collect();
    gpus.sort_by_key(|gpu| gpu.index);

    NvidiaSmiParseResult {
        gpus,
        warnings,
        gpu_supplements,
        dmon_samples,
    }
}

pub(super) fn upsert_process(processes: &mut Vec<CollectorProcess>, incoming: CollectorProcess) {
    if let Some(existing) = processes
        .iter_mut()
        .find(|process| process.pid == incoming.pid)
    {
        existing.gpu_uuid = existing.gpu_uuid.clone().or(incoming.gpu_uuid);
        existing.process_kind = merge_process_kind(&existing.process_kind, &incoming.process_kind);
        existing.command = existing.command.clone().or(incoming.command);
        existing.gpu_memory_used_mib = existing
            .gpu_memory_used_mib
            .or(incoming.gpu_memory_used_mib);
        existing.gpu_utilization_percent = existing
            .gpu_utilization_percent
            .or(incoming.gpu_utilization_percent);
        existing.gpu_sm_utilization_percent = existing
            .gpu_sm_utilization_percent
            .or(incoming.gpu_sm_utilization_percent);
        existing.gpu_memory_utilization_percent = existing
            .gpu_memory_utilization_percent
            .or(incoming.gpu_memory_utilization_percent);
        existing.gpu_encoder_utilization_percent = existing
            .gpu_encoder_utilization_percent
            .or(incoming.gpu_encoder_utilization_percent);
        existing.gpu_decoder_utilization_percent = existing
            .gpu_decoder_utilization_percent
            .or(incoming.gpu_decoder_utilization_percent);
    } else {
        processes.push(incoming);
    }
}

fn merge_process_kind(existing: &str, incoming: &str) -> String {
    if incoming != "unknown" {
        incoming.to_string()
    } else if existing.is_empty() {
        "unknown".to_string()
    } else {
        existing.to_string()
    }
}
