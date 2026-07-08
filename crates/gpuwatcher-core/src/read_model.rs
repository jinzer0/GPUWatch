mod detail;
mod mappers;
mod overview;
mod processes;
mod snapshot;

pub use detail::build_server_detail;
pub use mappers::{gpu_is_busy, health_dto};
pub use overview::build_overview;
pub use processes::build_process_rows;

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{LatestSnapshot, Server, ServerHealth};

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
            raw_json: include_str!("../../../fixtures/protocol/v1/success_multi_gpu.json")
                .to_string(),
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
            raw_json: include_str!("../../../fixtures/protocol/v1/success_multi_gpu.json")
                .to_string(),
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
