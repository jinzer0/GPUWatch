mod pmon;

use std::collections::HashMap;

use crate::models::CollectorProcess;

use super::helpers::{
    parse_elapsed_seconds, parse_f64_optional, parse_i64_optional, parse_string_optional,
};
use super::merge::upsert_process;
use super::types::{GpuRow, ProcessRow, PsProcessInfo};

const COMPUTE_APPS_FIELD_COUNT: usize = 4;

pub fn parse_ps_enrichment(raw: &str, warnings: &mut Vec<String>) -> HashMap<i64, PsProcessInfo> {
    let mut processes = HashMap::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("PID") || trimmed.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = trimmed.splitn(9, '|').map(str::trim).collect();
        if parts.len() != 8 && parts.len() != 9 {
            warnings.push(format!(
                "ps line {} ignored: expected 8 or 9 fields",
                line_number + 1
            ));
            continue;
        }
        let Some(pid) = parse_i64_optional(parts[0], "ps.pid", warnings).flatten() else {
            warnings.push(format!("ps line {} ignored: missing pid", line_number + 1));
            continue;
        };
        let (etimes, elapsed) = if parts.len() == 9 {
            (parts[7], parts[8])
        } else {
            ("", parts[7])
        };
        let runtime_seconds = parse_i64_optional(etimes, "ps.etimes", warnings)
            .flatten()
            .or_else(|| parse_elapsed_seconds(elapsed, warnings));
        processes.insert(
            pid,
            PsProcessInfo {
                pid,
                ppid: parse_i64_optional(parts[1], "ps.ppid", warnings).flatten(),
                user: parse_string_optional(parts[2]),
                comm: parse_string_optional(parts[3]),
                args: parse_string_optional(parts[4]),
                cpu_percent: parse_f64_optional(parts[5], "ps.cpu_percent", warnings).flatten(),
                memory_percent: parse_f64_optional(parts[6], "ps.memory_percent", warnings)
                    .flatten(),
                runtime_seconds,
                elapsed: parse_string_optional(elapsed),
            },
        );
    }
    processes
}

pub(super) fn parse_compute_apps_csv(raw: &str, warnings: &mut Vec<String>) -> Vec<ProcessRow> {
    let mut rows = Vec::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if fields.len() != COMPUTE_APPS_FIELD_COUNT {
            warnings.push(format!(
                "compute-apps CSV line {} ignored: expected {} fields",
                line_number + 1,
                COMPUTE_APPS_FIELD_COUNT
            ));
            continue;
        }
        let Some(pid) = parse_i64_optional(fields[1], "compute_apps.pid", warnings).flatten()
        else {
            warnings.push(format!(
                "compute-apps CSV line {} ignored: missing pid",
                line_number + 1
            ));
            continue;
        };
        let gpu_uuid = parse_string_optional(fields[0]);
        rows.push(ProcessRow {
            gpu_uuid: gpu_uuid.clone(),
            gpu_index: None,
            process: CollectorProcess {
                pid,
                gpu_uuid,
                process_kind: "compute".to_string(),
                parent_pid: None,
                runtime_seconds: None,
                username: None,
                command: parse_string_optional(fields[2]),
                gpu_memory_used_mib: parse_i64_optional(
                    fields[3],
                    "compute_apps.used_gpu_memory",
                    warnings,
                )
                .flatten(),
                gpu_utilization_percent: None,
                gpu_sm_utilization_percent: None,
                gpu_memory_utilization_percent: None,
                gpu_encoder_utilization_percent: None,
                gpu_decoder_utilization_percent: None,
                cpu_percent: None,
                host_memory_used_mib: None,
            },
        });
    }
    rows
}

pub(super) fn parse_pmon(raw: &str, warnings: &mut Vec<String>) -> Vec<ProcessRow> {
    pmon::parse_pmon(raw, warnings)
}

pub(super) fn attach_compute_processes(rows: &mut [GpuRow], processes: Vec<ProcessRow>) {
    for process in processes {
        if let Some(gpu_uuid) = process.gpu_uuid {
            if let Some(row) = rows.iter_mut().find(|row| row.gpu.uuid == gpu_uuid) {
                upsert_process(&mut row.gpu.processes, process.process);
            }
        }
    }
}

pub(super) fn attach_pmon_processes(rows: &mut [GpuRow], processes: Vec<ProcessRow>) {
    for process in processes {
        if let Some(gpu_index) = process.gpu_index {
            if let Some(row) = rows.iter_mut().find(|row| row.gpu.index == gpu_index) {
                let mut collector_process = process.process;
                collector_process.gpu_uuid = Some(row.gpu.uuid.clone());
                upsert_process(&mut row.gpu.processes, collector_process);
            }
        }
    }
}

pub(super) fn enrich_processes(rows: &mut [GpuRow], ps_info: &HashMap<i64, PsProcessInfo>) {
    for row in rows {
        for process in &mut row.gpu.processes {
            if let Some(info) = ps_info.get(&process.pid) {
                process.username = info.user.clone();
                process.command = info
                    .args
                    .clone()
                    .or_else(|| info.comm.clone())
                    .or(process.command.clone());
                process.parent_pid = process.parent_pid.or(info.ppid);
                process.runtime_seconds = process.runtime_seconds.or(info.runtime_seconds);
                process.cpu_percent = info.cpu_percent;
                process.host_memory_used_mib = process.host_memory_used_mib.or(None);
            }
        }
    }
}
