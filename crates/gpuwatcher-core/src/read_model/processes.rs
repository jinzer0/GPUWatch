use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{LatestSnapshot, ProcessRowDto, Server, ServerHealth};

use super::snapshot::parse_success_snapshot;

pub fn build_process_rows(
    servers: &[Server],
    health: &HashMap<String, ServerHealth>,
    snapshots: &HashMap<String, LatestSnapshot>,
) -> Result<Vec<ProcessRowDto>, AppError> {
    let mut rows = Vec::new();
    for server in servers {
        let Some(snapshot) = snapshots.get(&server.id) else {
            continue;
        };
        let parsed = parse_success_snapshot(snapshot)?;
        let stale = health
            .get(&server.id)
            .is_some_and(|value| value.status == "stale");
        for gpu in parsed.gpus {
            for process in gpu.processes {
                rows.push(ProcessRowDto {
                    server_id: server.id.clone(),
                    server_name: server.name.clone(),
                    stale,
                    gpu_index: gpu.index,
                    gpu_uuid: gpu.uuid.clone(),
                    pid: process.pid,
                    process_kind: process.process_kind,
                    parent_pid: process.parent_pid,
                    runtime_seconds: process.runtime_seconds,
                    username: process.username,
                    command: process.command,
                    gpu_memory_used_mib: process.gpu_memory_used_mib,
                    gpu_utilization_percent: process.gpu_utilization_percent,
                    gpu_sm_utilization_percent: process.gpu_sm_utilization_percent,
                    gpu_memory_utilization_percent: process.gpu_memory_utilization_percent,
                    gpu_encoder_utilization_percent: process.gpu_encoder_utilization_percent,
                    gpu_decoder_utilization_percent: process.gpu_decoder_utilization_percent,
                    cpu_percent: process.cpu_percent,
                    host_memory_used_mib: process.host_memory_used_mib,
                });
            }
        }
    }
    rows.sort_by(|left, right| {
        right
            .gpu_memory_used_mib
            .unwrap_or(-1)
            .cmp(&left.gpu_memory_used_mib.unwrap_or(-1))
    });
    Ok(rows)
}
