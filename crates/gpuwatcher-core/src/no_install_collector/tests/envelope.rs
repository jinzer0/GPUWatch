use crate::command_runner::CommandOutput;
use crate::no_install_collector::build_no_install_snapshot_from_output;

use super::fixtures::{base_gpu_csv, command_output, section, server};

#[test]
fn builds_success_envelope_from_sections() {
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 0, base_gpu_csv()),
        section("compute_apps_csv", 0, "GPU-aaaa, 1234, python, 512"),
        section("gpu_extra_csv", 0, "0, GPU-aaaa, Enabled, Enabled, 4, 16"),
        section("mig_list", 0, "GPU 0: NVIDIA A100-SXM4-40GB (UUID: GPU-aaaa)\n  MIG 1g.5gb Device 0: (UUID: MIG-GPU-aaaa/1/0)"),
        section("pmon", 0, "# gpu        pid  type    sm   mem   enc   dec   jpg   ofa   fb  ccpm command\n    0       1234     C    25     8     -     -     -     -  512     - python"),
        section("dmon", 0, "0, 90, 42, 0, 30, 12, 0, 0, 0, 0, 1215, 1410, 0, 0, 0"),
        section("dmon_pcie", 0, "0, 2048, 4096"),
        section("ps", 0, "1234|1|alice|python|python train.py|10.5|2.0|3723|01:02:03"),
    ]
    .concat();

    let (raw, envelope) = build_no_install_snapshot_from_output(&server(), &command_output(stdout))
        .expect("snapshot should build");

    assert!(raw.contains("\"ok\":true"));
    assert_eq!(envelope.protocol_version, 1);
    assert_eq!(envelope.schema_version, 1);
    assert_eq!(envelope.server.hostname.as_deref(), Some("gpu-host"));
    assert_eq!(
        envelope.server.driver_version.as_deref(),
        Some("535.129.03")
    );
    assert_eq!(envelope.gpus.len(), 1);
    assert_eq!(
        envelope.gpus[0].pci_bus_id.as_deref(),
        Some("00000000:65:00.0")
    );
    assert_eq!(
        envelope.gpus[0].driver_version.as_deref(),
        Some("535.129.03")
    );
    assert_eq!(envelope.gpus[0].graphics_clock_mhz, Some(1410));
    assert_eq!(envelope.gpus[0].memory_clock_mhz, Some(1215));
    assert_eq!(
        envelope.gpus[0].mig_mode_current.as_deref(),
        Some("Enabled")
    );
    assert_eq!(envelope.gpus[0].mig_instance_count, Some(1));
    assert_eq!(envelope.gpus[0].pcie_rx_kib_per_sec, Some(2048));
    assert_eq!(envelope.gpus[0].pcie_tx_kib_per_sec, Some(4096));
    assert_eq!(envelope.gpus[0].process_count, 1);
    assert_eq!(envelope.gpus[0].processes[0].pid, 1234);
    assert_eq!(
        envelope.gpus[0].processes[0].gpu_uuid.as_deref(),
        Some("GPU-aaaa")
    );
    assert_eq!(envelope.gpus[0].processes[0].process_kind, "compute");
    assert_eq!(envelope.gpus[0].processes[0].parent_pid, Some(1));
    assert_eq!(envelope.gpus[0].processes[0].runtime_seconds, Some(3723));
    assert_eq!(
        envelope.gpus[0].processes[0].username.as_deref(),
        Some("alice")
    );
    assert!(envelope.warnings.is_empty());
}

#[test]
fn optional_collection_failures_become_warnings() {
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 0, base_gpu_csv()),
        section("compute_apps_csv", 9, "compute-apps not supported"),
        section("gpu_extra_csv", 9, "gpu extra not supported"),
        section("mig_list", 9, "mig listing not supported"),
        section("pmon", 9, "pmon not supported"),
        section("dmon", 9, "dmon not supported"),
        section("dmon_pcie", 9, "pcie dmon not supported"),
        section("ps", 0, ""),
    ]
    .concat();

    let (_, envelope) = build_no_install_snapshot_from_output(&server(), &command_output(stdout))
        .expect("base GPU success should be enough");

    assert_eq!(envelope.gpus.len(), 1);
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("compute_apps_csv collection failed")));
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("gpu_extra_csv collection failed")));
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("mig_list collection failed")));
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("pmon collection failed")));
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("dmon collection failed")));
    assert!(envelope
        .warnings
        .iter()
        .any(|warning| warning.contains("dmon_pcie collection failed")));
}

#[test]
fn success_stderr_becomes_sanitized_warning_without_failing_snapshot() {
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 0, base_gpu_csv()),
        section("compute_apps_csv", 0, ""),
        section("gpu_extra_csv", 0, ""),
        section("mig_list", 0, ""),
        section("pmon", 0, ""),
        section("dmon", 0, ""),
        section("dmon_pcie", 0, ""),
        section("ps", 0, ""),
    ]
    .concat();
    let output = CommandOutput {
        stdout,
        stderr: "warning line\npassword hunter2\n/Users/alice/.ssh/id_ed25519".to_string(),
    };

    let (_, envelope) = build_no_install_snapshot_from_output(&server(), &output)
        .expect("stderr warning should not fail a successful base GPU snapshot");

    let warning = envelope
        .warnings
        .iter()
        .find(|warning| warning.starts_with("remote script stderr:"))
        .expect("remote stderr warning should be present");
    assert!(warning.contains("warning line"));
    assert!(warning.contains("password=[redacted]"));
    assert!(warning.contains("[path redacted]"));
    assert!(!warning.contains("hunter2"));
    assert!(!warning.contains("/Users/alice/.ssh/id_ed25519"));
}

#[test]
fn missing_nvidia_smi_returns_app_error() {
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 127, "nvidia-smi not found"),
        section("compute_apps_csv", 127, "nvidia-smi not found"),
        section("gpu_extra_csv", 127, "nvidia-smi not found"),
        section("mig_list", 127, "nvidia-smi not found"),
        section("pmon", 127, "nvidia-smi not found"),
        section("dmon", 127, "nvidia-smi not found"),
        section("dmon_pcie", 127, "nvidia-smi not found"),
        section("ps", 0, ""),
    ]
    .concat();

    let err = build_no_install_snapshot_from_output(&server(), &command_output(stdout))
        .expect_err("missing nvidia-smi should fail base collection");

    assert_eq!(err.layer, "collector");
    assert_eq!(err.error_type, "nvidia_smi_missing");
}
