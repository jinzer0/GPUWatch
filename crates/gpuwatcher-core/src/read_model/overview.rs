use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{LatestSnapshot, Server, ServerHealth, ServerOverviewDto, SuccessEnvelope};

use super::mappers::gpu_is_busy;
use super::snapshot::parse_success_snapshot;

pub fn build_overview(
    servers: &[Server],
    health: &HashMap<String, ServerHealth>,
    snapshots: &HashMap<String, LatestSnapshot>,
) -> Result<Vec<ServerOverviewDto>, AppError> {
    let mut rows = Vec::new();
    for server in servers {
        let parsed = match snapshots.get(&server.id) {
            Some(snapshot) => Some(parse_success_snapshot(snapshot)?),
            None => None,
        };
        let summary = parsed.as_ref().map(snapshot_summary);
        let health_row = health.get(&server.id);
        rows.push(ServerOverviewDto {
            id: server.id.clone(),
            name: server.name.clone(),
            host: server.host.clone(),
            status: health_row
                .map(|value| value.status.clone())
                .unwrap_or_else(|| if server.enabled { "idle" } else { "disabled" }.to_string()),
            gpu_total: summary.as_ref().map_or(0, |value| value.gpu_total),
            busy_gpu_count: summary.as_ref().map_or(0, |value| value.busy_gpu_count),
            free_gpu_count: summary.as_ref().map_or(0, |value| value.free_gpu_count),
            average_gpu_utilization_percent: summary
                .as_ref()
                .and_then(|value| value.average_gpu_utilization_percent),
            average_memory_usage_percent: summary
                .as_ref()
                .and_then(|value| value.average_memory_usage_percent),
            max_temperature_celsius: summary
                .as_ref()
                .and_then(|value| value.max_temperature_celsius),
            last_success_at: health_row.and_then(|value| value.last_success_at.clone()),
            last_error_type: health_row.and_then(|value| value.last_error_type.clone()),
            last_error_message: health_row.and_then(|value| value.last_error_message.clone()),
        });
    }
    Ok(rows)
}

struct SnapshotSummary {
    gpu_total: i64,
    busy_gpu_count: i64,
    free_gpu_count: i64,
    average_gpu_utilization_percent: Option<f64>,
    average_memory_usage_percent: Option<f64>,
    max_temperature_celsius: Option<f64>,
}

fn snapshot_summary(payload: &SuccessEnvelope) -> SnapshotSummary {
    let gpu_total = payload.gpus.len() as i64;
    let busy_gpu_count = payload.gpus.iter().filter(|gpu| gpu_is_busy(gpu)).count() as i64;
    SnapshotSummary {
        gpu_total,
        busy_gpu_count,
        free_gpu_count: gpu_total - busy_gpu_count,
        average_gpu_utilization_percent: average(
            payload
                .gpus
                .iter()
                .filter_map(|gpu| gpu.gpu_utilization_percent),
        ),
        average_memory_usage_percent: average(payload.gpus.iter().filter_map(|gpu| {
            match (gpu.memory_used_mib, gpu.memory_total_mib) {
                (Some(used), Some(total)) if total > 0 => {
                    Some((used as f64 / total as f64) * 100.0)
                }
                _ => None,
            }
        })),
        max_temperature_celsius: payload
            .gpus
            .iter()
            .filter_map(|gpu| gpu.temperature_celsius)
            .reduce(f64::max),
    }
}

fn average(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut count = 0.0;
    let mut sum = 0.0;
    for value in values {
        count += 1.0;
        sum += value;
    }
    if count > 0.0 {
        Some((sum / count * 10.0).round() / 10.0)
    } else {
        None
    }
}
