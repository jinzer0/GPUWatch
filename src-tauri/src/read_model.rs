use std::collections::HashMap;

use crate::config::BUSY_MEMORY_THRESHOLD_MIB;
use crate::error::AppError;
use crate::models::{
    CollectorGpu, GpuCardDto, LatestSnapshot, ParsedCollectorPayload, ProcessRowDto, Server,
    ServerDetailDto, ServerHealth, ServerHealthDto, ServerOverviewDto, SuccessEnvelope,
};
use crate::protocol::parse_collector_json;

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

pub fn build_server_detail(
    server: Server,
    health: Option<ServerHealth>,
    snapshot: Option<LatestSnapshot>,
) -> Result<ServerDetailDto, AppError> {
    let parsed = match snapshot.as_ref() {
        Some(value) => Some(parse_success_snapshot(value)?),
        None => None,
    };
    let gpus = parsed
        .as_ref()
        .map(|payload| payload.gpus.iter().map(gpu_card).collect())
        .unwrap_or_default();
    Ok(ServerDetailDto {
        server,
        health: health_dto(health.as_ref()),
        collector_hostname: parsed
            .as_ref()
            .and_then(|payload| payload.server.hostname.clone()),
        driver_version: parsed
            .as_ref()
            .and_then(|payload| payload.server.driver_version.clone()),
        cuda_version: parsed
            .as_ref()
            .and_then(|payload| payload.server.cuda_version.clone()),
        received_at: snapshot.map(|value| value.received_at),
        warnings: parsed.map(|payload| payload.warnings).unwrap_or_default(),
        gpus,
    })
}

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
                    pid: process.pid,
                    username: process.username,
                    command: process.command,
                    gpu_memory_used_mib: process.gpu_memory_used_mib,
                    gpu_utilization_percent: process.gpu_utilization_percent,
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

pub fn health_dto(health: Option<&ServerHealth>) -> ServerHealthDto {
    ServerHealthDto {
        status: health
            .map(|value| value.status.clone())
            .unwrap_or_else(|| "idle".to_string()),
        last_error_type: health.and_then(|value| value.last_error_type.clone()),
        last_error_message: health.and_then(|value| value.last_error_message.clone()),
        last_poll_started_at: health.and_then(|value| value.last_poll_started_at.clone()),
        last_poll_finished_at: health.and_then(|value| value.last_poll_finished_at.clone()),
        last_success_at: health.and_then(|value| value.last_success_at.clone()),
    }
}

pub fn gpu_is_busy(gpu: &CollectorGpu) -> bool {
    gpu.process_count > 0
        || gpu
            .memory_used_mib
            .is_some_and(|value| value > BUSY_MEMORY_THRESHOLD_MIB)
}

fn parse_success_snapshot(snapshot: &LatestSnapshot) -> Result<SuccessEnvelope, AppError> {
    match parse_collector_json(&snapshot.raw_json)? {
        ParsedCollectorPayload::Success(success) => Ok(success),
        ParsedCollectorPayload::CollectorError(error) => Err(AppError::new(
            "collector",
            error.error.error_type,
            error.error.message,
        )),
    }
}

fn gpu_card(gpu: &CollectorGpu) -> GpuCardDto {
    GpuCardDto {
        index: gpu.index,
        uuid: gpu.uuid.clone(),
        name: gpu.name.clone(),
        busy: gpu_is_busy(gpu),
        memory_total_mib: gpu.memory_total_mib,
        memory_used_mib: gpu.memory_used_mib,
        memory_free_mib: gpu.memory_free_mib,
        gpu_utilization_percent: gpu.gpu_utilization_percent,
        memory_utilization_percent: gpu.memory_utilization_percent,
        temperature_celsius: gpu.temperature_celsius,
        power_draw_watt: gpu.power_draw_watt,
        power_limit_watt: gpu.power_limit_watt,
        fan_speed_percent: gpu.fan_speed_percent,
        process_count: gpu.process_count,
        processes: gpu.processes.clone(),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> Server {
        Server {
            id: "server-1".to_string(),
            name: "Lab".to_string(),
            host: "gpu.local".to_string(),
            port: 22,
            username: "alice".to_string(),
            ssh_key_path: None,
            polling_interval_seconds: 30,
            enabled: true,
            config_revision: 1,
            created_at: "2026-06-01T00:00:00Z".to_string(),
            updated_at: "2026-06-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn overview_counts_busy_and_free_gpus() {
        let server = server();
        let snapshot = LatestSnapshot {
            server_id: server.id.clone(),
            protocol_version: 1,
            schema_version: 1,
            received_at: "2026-06-01T00:00:00Z".to_string(),
            raw_json: include_str!("../../fixtures/protocol/v1/success_multi_gpu.json").to_string(),
            parsed_summary_json: "{}".to_string(),
        };
        let mut snapshots = HashMap::new();
        snapshots.insert(server.id.clone(), snapshot);
        let rows = build_overview(&[server], &HashMap::new(), &snapshots).expect("overview");
        assert_eq!(rows[0].gpu_total, 2);
        assert_eq!(rows[0].busy_gpu_count, 2);
        assert_eq!(rows[0].free_gpu_count, 0);
    }

    #[test]
    fn process_rows_sort_by_gpu_memory_descending() {
        let server = server();
        let snapshot = LatestSnapshot {
            server_id: server.id.clone(),
            protocol_version: 1,
            schema_version: 1,
            received_at: "2026-06-01T00:00:00Z".to_string(),
            raw_json: include_str!("../../fixtures/protocol/v1/success_multi_gpu.json").to_string(),
            parsed_summary_json: "{}".to_string(),
        };
        let mut snapshots = HashMap::new();
        snapshots.insert(server.id.clone(), snapshot);
        let rows =
            build_process_rows(&[server], &HashMap::new(), &snapshots).expect("process rows");
        assert_eq!(rows.len(), 2);
        assert!(rows[0].gpu_memory_used_mib >= rows[1].gpu_memory_used_mib);
    }

    #[test]
    fn detail_preserves_nullable_metrics_and_warnings() {
        let server = server();
        let snapshot = LatestSnapshot {
            server_id: server.id.clone(),
            protocol_version: 1,
            schema_version: 1,
            received_at: "2026-06-01T00:00:00Z".to_string(),
            raw_json: r#"{
                "protocolVersion": 1,
                "schemaVersion": 1,
                "ok": true,
                "timestamp": "2026-06-01T00:00:00Z",
                "server": { "hostname": null, "driverVersion": null, "cudaVersion": null },
                "gpus": [{
                    "index": 0,
                    "uuid": "GPU-nullable",
                    "name": "NVIDIA Test GPU",
                    "memoryTotalMiB": null,
                    "memoryUsedMiB": null,
                    "memoryFreeMiB": null,
                    "gpuUtilizationPercent": null,
                    "memoryUtilizationPercent": null,
                    "temperatureCelsius": null,
                    "powerDrawWatt": null,
                    "powerLimitWatt": null,
                    "fanSpeedPercent": null,
                    "processCount": 1,
                    "processes": [{
                        "pid": 1234,
                        "username": null,
                        "command": null,
                        "gpuMemoryUsedMiB": null,
                        "gpuUtilizationPercent": null,
                        "cpuPercent": null,
                        "hostMemoryUsedMiB": null
                    }]
                }],
                "warnings": ["pmon unavailable; per-process utilization unknown"]
            }"#
            .to_string(),
            parsed_summary_json: "{}".to_string(),
        };

        let detail = build_server_detail(server, None, Some(snapshot)).expect("detail");

        assert_eq!(
            detail.warnings,
            vec!["pmon unavailable; per-process utilization unknown"]
        );
        assert_eq!(detail.collector_hostname, None);
        assert_eq!(detail.driver_version, None);
        assert_eq!(detail.cuda_version, None);
        let gpu = &detail.gpus[0];
        assert_eq!(gpu.memory_total_mib, None);
        assert_eq!(gpu.memory_used_mib, None);
        assert_eq!(gpu.gpu_utilization_percent, None);
        assert_eq!(gpu.temperature_celsius, None);
        assert_eq!(gpu.process_count, 1);
        assert_eq!(gpu.processes[0].gpu_memory_used_mib, None);
        assert_eq!(gpu.processes[0].gpu_utilization_percent, None);
    }
}
