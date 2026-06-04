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
        pci_bus_id: gpu.pci_bus_id.clone(),
        name: gpu.name.clone(),
        driver_version: gpu.driver_version.clone(),
        busy: gpu_is_busy(gpu),
        memory_total_mib: gpu.memory_total_mib,
        memory_used_mib: gpu.memory_used_mib,
        memory_free_mib: gpu.memory_free_mib,
        gpu_utilization_percent: gpu.gpu_utilization_percent,
        memory_utilization_percent: gpu.memory_utilization_percent,
        encoder_utilization_percent: gpu.encoder_utilization_percent,
        decoder_utilization_percent: gpu.decoder_utilization_percent,
        jpeg_utilization_percent: gpu.jpeg_utilization_percent,
        ofa_utilization_percent: gpu.ofa_utilization_percent,
        pcie_rx_kib_per_sec: gpu.pcie_rx_kib_per_sec,
        pcie_tx_kib_per_sec: gpu.pcie_tx_kib_per_sec,
        pcie_link_gen_current: gpu.pcie_link_gen_current,
        pcie_link_width_current: gpu.pcie_link_width_current,
        mig_mode_current: gpu.mig_mode_current.clone(),
        mig_mode_pending: gpu.mig_mode_pending.clone(),
        mig_instance_count: gpu.mig_instance_count,
        temperature_celsius: gpu.temperature_celsius,
        power_draw_watt: gpu.power_draw_watt,
        power_limit_watt: gpu.power_limit_watt,
        fan_speed_percent: gpu.fan_speed_percent,
        graphics_clock_mhz: gpu.graphics_clock_mhz,
        memory_clock_mhz: gpu.memory_clock_mhz,
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

    fn latest_snapshot(server_id: &str, raw_json: String) -> LatestSnapshot {
        LatestSnapshot {
            server_id: server_id.to_string(),
            protocol_version: 1,
            schema_version: 1,
            received_at: "2026-06-02T00:00:00Z".to_string(),
            raw_json,
            parsed_summary_json: "{}".to_string(),
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

    #[test]
    fn detail_gpu_cards_expose_identity_and_clock_fields() {
        let server = server();
        let raw_json = serde_json::json!({
            "protocolVersion": 1,
            "schemaVersion": 1,
            "ok": true,
            "timestamp": "2026-06-02T00:00:00Z",
            "server": { "hostname": "gpu-host", "driverVersion": "535.129.03", "cudaVersion": null },
            "gpus": [{
                "index": 0,
                "uuid": "GPU-aaaa",
                "pciBusId": "00000000:65:00.0",
                "name": "NVIDIA A100",
                "driverVersion": "535.129.03",
                "memoryTotalMiB": 40960,
                "memoryUsedMiB": 1024,
                "memoryFreeMiB": 39936,
                "gpuUtilizationPercent": 12.0,
                "memoryUtilizationPercent": 4.0,
                "temperatureCelsius": 41.0,
                "powerDrawWatt": 88.5,
                "powerLimitWatt": 400.0,
                "fanSpeedPercent": 30.0,
                "graphicsClockMhz": 1410,
                "memoryClockMhz": 1215,
                "processCount": 0,
                "processes": []
            }],
            "warnings": []
        })
        .to_string();
        let snapshot = latest_snapshot(&server.id, raw_json);

        let detail = build_server_detail(server, None, Some(snapshot)).expect("detail builds");

        let gpu = &detail.gpus[0];
        assert_eq!(gpu.pci_bus_id.as_deref(), Some("00000000:65:00.0"));
        assert_eq!(gpu.driver_version.as_deref(), Some("535.129.03"));
        assert_eq!(gpu.graphics_clock_mhz, Some(1410));
        assert_eq!(gpu.memory_clock_mhz, Some(1215));
    }

    #[test]
    fn detail_gpu_cards_expose_optional_enrichment_fields() {
        let server = server();
        let raw_json = r#"{
            "protocolVersion": 1,
            "schemaVersion": 1,
            "ok": true,
            "timestamp": "2026-06-02T00:00:00Z",
            "server": { "hostname": "gpu-host", "driverVersion": "535.129.03", "cudaVersion": "12.2" },
            "gpus": [{
                "index": 0,
                "uuid": "GPU-rich",
                "pciBusId": "00000000:65:00.0",
                "name": "NVIDIA A100",
                "driverVersion": "535.129.03",
                "memoryTotalMiB": 40960,
                "memoryUsedMiB": 2048,
                "memoryFreeMiB": 38912,
                "gpuUtilizationPercent": 42.0,
                "memoryUtilizationPercent": 8.0,
                "encoderUtilizationPercent": 3.0,
                "decoderUtilizationPercent": 4.0,
                "jpegUtilizationPercent": 5.0,
                "ofaUtilizationPercent": 6.0,
                "pcieRxKibPerSec": 700,
                "pcieTxKibPerSec": 800,
                "pcieLinkGenCurrent": 4,
                "pcieLinkWidthCurrent": 16,
                "migModeCurrent": "Enabled",
                "migModePending": "Disabled",
                "migInstanceCount": 2,
                "temperatureCelsius": 41.0,
                "powerDrawWatt": 88.5,
                "powerLimitWatt": 400.0,
                "fanSpeedPercent": 30.0,
                "graphicsClockMhz": 1410,
                "memoryClockMhz": 1215,
                "processCount": 1,
                "processes": [{
                    "pid": 2345,
                    "gpuUuid": "GPU-rich",
                    "processKind": "compute",
                    "parentPid": 1234,
                    "runtimeSeconds": 3661,
                    "username": "alice",
                    "command": "python train.py",
                    "gpuMemoryUsedMiB": 1536,
                    "gpuUtilizationPercent": 27.0,
                    "gpuSmUtilizationPercent": 21.0,
                    "gpuMemoryUtilizationPercent": 22.0,
                    "gpuEncoderUtilizationPercent": 23.0,
                    "gpuDecoderUtilizationPercent": 24.0,
                    "cpuPercent": 10.5,
                    "hostMemoryUsedMiB": 4096
                }]
            }],
            "warnings": []
        }"#
        .to_string();
        let snapshot = latest_snapshot(&server.id, raw_json);

        let detail = build_server_detail(server, None, Some(snapshot)).expect("detail builds");

        let gpu = &detail.gpus[0];
        assert_eq!(gpu.encoder_utilization_percent, Some(3.0));
        assert_eq!(gpu.decoder_utilization_percent, Some(4.0));
        assert_eq!(gpu.jpeg_utilization_percent, Some(5.0));
        assert_eq!(gpu.ofa_utilization_percent, Some(6.0));
        assert_eq!(gpu.pcie_rx_kib_per_sec, Some(700));
        assert_eq!(gpu.pcie_tx_kib_per_sec, Some(800));
        assert_eq!(gpu.pcie_link_gen_current, Some(4));
        assert_eq!(gpu.pcie_link_width_current, Some(16));
        assert_eq!(gpu.mig_mode_current.as_deref(), Some("Enabled"));
        assert_eq!(gpu.mig_mode_pending.as_deref(), Some("Disabled"));
        assert_eq!(gpu.mig_instance_count, Some(2));
        assert_eq!(gpu.processes[0].parent_pid, Some(1234));
        assert_eq!(gpu.processes[0].runtime_seconds, Some(3661));
        assert_eq!(gpu.processes[0].gpu_sm_utilization_percent, Some(21.0));
        assert_eq!(gpu.processes[0].gpu_memory_utilization_percent, Some(22.0));
        assert_eq!(gpu.processes[0].gpu_encoder_utilization_percent, Some(23.0));
        assert_eq!(gpu.processes[0].gpu_decoder_utilization_percent, Some(24.0));
    }

    #[test]
    fn process_rows_copy_optional_enrichment_fields_and_stale_status() {
        let server = server();
        let raw_json = r#"{
            "protocolVersion": 1,
            "schemaVersion": 1,
            "ok": true,
            "timestamp": "2026-06-02T00:00:00Z",
            "server": { "hostname": "gpu-host", "driverVersion": null, "cudaVersion": null },
            "gpus": [{
                "index": 0,
                "uuid": "GPU-rich",
                "name": "NVIDIA A100",
                "memoryTotalMiB": 40960,
                "memoryUsedMiB": 2048,
                "memoryFreeMiB": 38912,
                "gpuUtilizationPercent": null,
                "memoryUtilizationPercent": null,
                "temperatureCelsius": null,
                "powerDrawWatt": null,
                "powerLimitWatt": null,
                "fanSpeedPercent": null,
                "processCount": 1,
                "processes": [{
                    "pid": 2345,
                    "gpuUuid": "GPU-rich",
                    "processKind": "compute",
                    "parentPid": 1234,
                    "runtimeSeconds": 3661,
                    "username": "alice",
                    "command": "python train.py",
                    "gpuMemoryUsedMiB": 1536,
                    "gpuUtilizationPercent": 27.0,
                    "gpuSmUtilizationPercent": 21.0,
                    "gpuMemoryUtilizationPercent": 22.0,
                    "gpuEncoderUtilizationPercent": 23.0,
                    "gpuDecoderUtilizationPercent": 24.0,
                    "cpuPercent": 10.5,
                    "hostMemoryUsedMiB": 4096
                }]
            }],
            "warnings": []
        }"#
        .to_string();
        let mut snapshots = HashMap::new();
        snapshots.insert(server.id.clone(), latest_snapshot(&server.id, raw_json));
        let mut health = HashMap::new();
        health.insert(
            server.id.clone(),
            ServerHealth {
                server_id: server.id.clone(),
                status: "stale".to_string(),
                last_error_type: Some("ssh".to_string()),
                last_error_message: Some("timeout".to_string()),
                last_poll_started_at: Some("2026-06-02T00:05:00Z".to_string()),
                last_poll_finished_at: Some("2026-06-02T00:06:00Z".to_string()),
                last_success_at: Some("2026-06-02T00:00:00Z".to_string()),
            },
        );

        let rows = build_process_rows(&[server], &health, &snapshots).expect("process rows");

        let row = &rows[0];
        assert!(row.stale);
        assert_eq!(row.parent_pid, Some(1234));
        assert_eq!(row.runtime_seconds, Some(3661));
        assert_eq!(row.gpu_sm_utilization_percent, Some(21.0));
        assert_eq!(row.gpu_memory_utilization_percent, Some(22.0));
        assert_eq!(row.gpu_encoder_utilization_percent, Some(23.0));
        assert_eq!(row.gpu_decoder_utilization_percent, Some(24.0));
    }

    #[test]
    fn process_rows_copy_gpu_uuid_and_process_kind() {
        let server = server();
        let raw_json = serde_json::json!({
            "protocolVersion": 1,
            "schemaVersion": 1,
            "ok": true,
            "timestamp": "2026-06-02T00:00:00Z",
            "server": { "hostname": "gpu-host", "driverVersion": null, "cudaVersion": null },
            "gpus": [{
                "index": 0,
                "uuid": "GPU-aaaa",
                "name": "NVIDIA A100",
                "memoryTotalMiB": 40960,
                "memoryUsedMiB": 1024,
                "memoryFreeMiB": 39936,
                "gpuUtilizationPercent": null,
                "memoryUtilizationPercent": null,
                "temperatureCelsius": null,
                "powerDrawWatt": null,
                "powerLimitWatt": null,
                "fanSpeedPercent": null,
                "processCount": 1,
                "processes": [{
                    "pid": 1234,
                    "username": "alice",
                    "command": "python train.py",
                    "gpuMemoryUsedMiB": 512,
                    "gpuUtilizationPercent": 25.0,
                    "cpuPercent": 10.5,
                    "hostMemoryUsedMiB": null,
                    "processKind": "graphics"
                }]
            }],
            "warnings": []
        })
        .to_string();
        let mut snapshots = HashMap::new();
        snapshots.insert(server.id.clone(), latest_snapshot(&server.id, raw_json));

        let rows =
            build_process_rows(&[server], &HashMap::new(), &snapshots).expect("process rows");

        assert_eq!(rows[0].gpu_uuid, "GPU-aaaa");
        assert_eq!(rows[0].process_kind, "graphics");
    }
}
