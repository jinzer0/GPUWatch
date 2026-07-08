use gpuwatcher_core::nvidia_smi::{parse_nvidia_smi_outputs, NvidiaSmiOutputs};

mod nvidia_smi {
    use super::*;

    #[test]
    fn normal_rtx_5090_outputs_parse() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_rtx_5090.csv"
            )),
            pmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/pmon_rtx_5090.txt"
            )),
            dmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/dmon_rtx_5090.txt"
            )),
            ps: Some(include_str!("../../../fixtures/nvidia-smi/ps_rtx_5090.txt")),
            ..NvidiaSmiOutputs::default()
        })
        .expect("normal fixtures parse");

        assert_eq!(result.gpus.len(), 2);
        assert!(result.warnings.is_empty());
        assert_eq!(result.gpus[0].name, "NVIDIA GeForce RTX 5090");
        assert_eq!(result.gpus[0].memory_total_mib, Some(32607));
        assert_eq!(result.gpus[0].process_count, 2);
        assert_eq!(
            result.gpus[0].processes[0].username.as_deref(),
            Some("alice")
        );
        assert_eq!(result.gpus[0].processes[0].cpu_percent, Some(97.5));
        assert_eq!(
            result.gpus[0].processes[1].command.as_deref(),
            Some("gnome-shell")
        );
        assert_eq!(
            result.gpu_supplements[0].driver_version.as_deref(),
            Some("575.64.03")
        );
        assert_eq!(result.gpu_supplements[0].graphics_clock_mhz, Some(2850));
        assert_eq!(result.dmon_samples.len(), 2);
    }

    #[test]
    fn unknown_values_parse_as_none() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_unknown_values.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_unknown_values.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("unknown values should not fail");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.memory_used_mib, None);
        assert_eq!(gpu.power_draw_watt, None);
        assert_eq!(gpu.fan_speed_percent, None);
        assert_eq!(gpu.processes[0].gpu_memory_used_mib, None);
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("utilization.gpu")));
    }

    #[test]
    fn empty_compute_apps_output_is_empty_process_list() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_empty.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("empty compute output should parse");

        assert!(result.gpus.iter().all(|gpu| gpu.process_count == 0));
    }

    #[test]
    fn pmon_graphics_only_process_is_included() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            pmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/pmon_graphics_only.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("pmon graphics process should parse");

        assert_eq!(result.gpus[0].process_count, 1);
        let process = &result.gpus[0].processes[0];
        assert_eq!(process.command.as_deref(), Some("gnome-shell"));
        assert_eq!(process.gpu_memory_used_mib, Some(312));
    }

    #[test]
    fn pmon_live_um_graphics_only_process_uses_header_for_fb_memory() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            pmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/pmon_live_um_graphics_only.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("live-like pmon output should parse");

        assert_eq!(result.gpus[0].process_count, 1);
        let process = &result.gpus[0].processes[0];
        assert_eq!(process.command.as_deref(), Some("gnome-shell"));
        assert_eq!(process.gpu_memory_used_mib, Some(6));
        assert_eq!(process.gpu_utilization_percent, None);
    }

    #[test]
    fn malformed_base_gpu_csv_returns_typed_error() {
        let error = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_malformed.csv"),
            ..NvidiaSmiOutputs::default()
        })
        .expect_err("malformed base GPU CSV should fail");

        assert_eq!(error.layer, "collector");
        assert_eq!(error.error_type, "nvidia_smi_gpu_csv_malformed");
    }

    #[test]
    fn optional_malformed_dmon_collects_warning_without_blocking() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            dmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/dmon_malformed.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("base GPU CSV should still parse");

        assert_eq!(result.gpus.len(), 2);
        assert!(result.dmon_samples.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("dmon line")));
    }

    #[test]
    fn dmon_live_pucm_noheader_uses_long_csv_clock_indices() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            dmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/dmon_live_pucm_noheader.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("live-like dmon output should parse");

        assert_eq!(result.dmon_samples.len(), 1);
        let sample = &result.dmon_samples[0];
        assert_eq!(sample.gpu_index, 0);
        assert_eq!(sample.power_draw_watt, Some(15.0));
        assert_eq!(sample.temperature_celsius, Some(34.0));
        assert_eq!(sample.gpu_utilization_percent, Some(0.0));
        assert_eq!(sample.memory_utilization_percent, Some(0.0));
        assert_eq!(sample.memory_clock_mhz, Some(405));
        assert_eq!(sample.graphics_clock_mhz, Some(28));
    }

    #[test]
    fn disappeared_pid_does_not_panic_or_drop_process() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_disappeared_pid.csv"
            )),
            ps: Some(include_str!(
                "../../../fixtures/nvidia-smi/ps_disappeared_pid.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("missing ps enrichment should not fail");

        assert_eq!(result.gpus[0].process_count, 1);
        assert_eq!(result.gpus[0].processes[0].pid, 424242);
        assert_eq!(result.gpus[0].processes[0].username, None);
        assert_eq!(
            result.gpus[0].processes[0].command.as_deref(),
            Some("python vanished.py")
        );
    }

    #[test]
    fn gpu_csv_identity_and_clocks_are_persisted_on_gpus() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            ..NvidiaSmiOutputs::default()
        })
        .expect("GPU CSV should parse");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.pci_bus_id.as_deref(), Some("00000000:01:00.0"));
        assert_eq!(gpu.driver_version.as_deref(), Some("575.64.03"));
        assert_eq!(gpu.graphics_clock_mhz, Some(2850));
        assert_eq!(gpu.memory_clock_mhz, Some(14001));
    }

    #[test]
    fn dmon_clocks_fill_only_missing_gpu_csv_clock_values() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv: "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, N/A, -",
        dmon: Some("0, 90, 42, 0, 30, 12, 0, 0, 0, 0, 1215, 1410, 0, 0, 0"),
        ..NvidiaSmiOutputs::default()
    })
    .expect("dmon fallback should parse");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.graphics_clock_mhz, Some(1410));
        assert_eq!(gpu.memory_clock_mhz, Some(1215));
    }

    #[test]
    fn gpu_csv_clocks_win_over_dmon_clock_samples() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv: "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, 1410, 1215",
        dmon: Some("0, 90, 42, 0, 30, 12, 0, 0, 0, 0, 405, 28, 0, 0, 0"),
        ..NvidiaSmiOutputs::default()
    })
    .expect("dmon fallback should parse");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.graphics_clock_mhz, Some(1410));
        assert_eq!(gpu.memory_clock_mhz, Some(1215));
    }

    #[test]
    fn pmon_type_maps_process_kind_and_updates_compute_rows() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
        compute_apps_csv: Some(
            "GPU-50900000-0000-0000-0000-000000000000, 1234, python train.py, 512",
        ),
        pmon: Some("# gpu        pid  type    sm   mem   enc   dec   jpg   ofa   fb  ccpm command\n    0       1234     G    25     8     -     -     -     -  512     - gnome-shell\n    1       9999     -     -     -     -     -     -     -    -     - mystery"),
        ..NvidiaSmiOutputs::default()
    })
    .expect("pmon process kinds should parse");

        let graphics_process = &result.gpus[0].processes[0];
        assert_eq!(
            graphics_process.gpu_uuid.as_deref(),
            Some("GPU-50900000-0000-0000-0000-000000000000")
        );
        assert_eq!(graphics_process.process_kind, "graphics");
        assert_eq!(graphics_process.gpu_memory_used_mib, Some(512));

        let unknown_process = &result.gpus[1].processes[0];
        assert_eq!(
            unknown_process.gpu_uuid.as_deref(),
            Some("GPU-50901111-1111-1111-1111-111111111111")
        );
        assert_eq!(unknown_process.process_kind, "unknown");
    }

    #[test]
    fn compute_apps_only_rows_default_to_compute_process_kind() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(
                "GPU-50900000-0000-0000-0000-000000000000, 1234, python train.py, 512",
            ),
            ..NvidiaSmiOutputs::default()
        })
        .expect("compute-apps process kind should parse");

        let process = &result.gpus[0].processes[0];
        assert_eq!(
            process.gpu_uuid.as_deref(),
            Some("GPU-50900000-0000-0000-0000-000000000000")
        );
        assert_eq!(process.process_kind, "compute");
    }

    #[test]
    fn optional_gpu_extra_mig_and_pcie_sections_enrich_gpus() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            gpu_extra_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/gpu_extra_rtx_5090.csv"
            )),
            mig_list: Some(include_str!(
                "../../../fixtures/nvidia-smi/mig_list_disabled.txt"
            )),
            dmon_pcie: Some(include_str!(
                "../../../fixtures/nvidia-smi/dmon_pcie_rtx_5090.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("optional GPU sections should parse");

        let gpu0 = &result.gpus[0];
        assert_eq!(gpu0.mig_mode_current.as_deref(), Some("Enabled"));
        assert_eq!(gpu0.mig_mode_pending.as_deref(), Some("Enabled"));
        assert_eq!(gpu0.mig_instance_count, Some(0));
        assert_eq!(gpu0.pcie_link_gen_current, Some(5));
        assert_eq!(gpu0.pcie_link_width_current, Some(16));
        assert_eq!(gpu0.pcie_rx_kib_per_sec, Some(2048));
        assert_eq!(gpu0.pcie_tx_kib_per_sec, Some(4096));

        let gpu1 = &result.gpus[1];
        assert_eq!(gpu1.mig_mode_current.as_deref(), Some("Disabled"));
        assert_eq!(gpu1.pcie_rx_kib_per_sec, None);
        assert_eq!(gpu1.pcie_tx_kib_per_sec, None);
    }

    #[test]
    fn mig_list_counts_basic_instances_by_physical_gpu() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv: "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, 1410, 1215\n1, GPU-bbbb, 00000000:66:00.0, NVIDIA A100, 535.129.03, 40960, 0, 40960, 0, 0, 35, 50.00, 400.00, 30, 1410, 1215",
        mig_list: Some(include_str!("../../../fixtures/nvidia-smi/mig_list_enabled.txt")),
        ..NvidiaSmiOutputs::default()
    })
    .expect("MIG list should parse");

        assert_eq!(result.gpus[0].mig_instance_count, Some(2));
        assert_eq!(result.gpus[1].mig_instance_count, Some(0));
    }

    #[test]
    fn optional_gpu_extra_unknown_values_stay_none_with_warning_for_bad_numbers() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_unknown_values.csv"),
            gpu_extra_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/gpu_extra_unknown_values.csv"
            )),
            dmon_pcie: Some("0, -, abc"),
            ..NvidiaSmiOutputs::default()
        })
        .expect("unknown optional values should parse");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.mig_mode_current, None);
        assert_eq!(gpu.mig_mode_pending, None);
        assert_eq!(gpu.pcie_link_gen_current, None);
        assert_eq!(gpu.pcie_link_width_current, None);
        assert_eq!(gpu.pcie_rx_kib_per_sec, None);
        assert_eq!(gpu.pcie_tx_kib_per_sec, None);
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("gpu_extra.pcie_link_width_current")));
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("dmon_pcie.txpci")));
    }

    #[test]
    fn dmon_extra_utilization_columns_are_captured_when_present() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            dmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/dmon_extra_utilization.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("extended dmon should parse");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.encoder_utilization_percent, Some(11.0));
        assert_eq!(gpu.decoder_utilization_percent, Some(22.0));
        assert_eq!(gpu.jpeg_utilization_percent, Some(33.0));
        assert_eq!(gpu.ofa_utilization_percent, Some(44.0));
    }

    #[test]
    fn pmon_utilization_columns_enrich_processes_null_preserving() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_rtx_5090.csv"
            )),
            pmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/pmon_utilization_placeholders.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("extended pmon should parse");

        let process = &result.gpus[0].processes[0];
        assert_eq!(process.gpu_sm_utilization_percent, Some(91.0));
        assert_eq!(process.gpu_memory_utilization_percent, Some(62.0));
        assert_eq!(process.gpu_encoder_utilization_percent, None);
        assert_eq!(process.gpu_decoder_utilization_percent, None);
    }

    #[test]
    fn ps_etimes_sets_runtime_seconds_and_parent_pid_with_etime_fallback() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../../../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../../../fixtures/nvidia-smi/compute_apps_rtx_5090.csv"
            )),
            pmon: Some(include_str!(
                "../../../fixtures/nvidia-smi/pmon_graphics_only.txt"
            )),
            ps: Some(include_str!(
                "../../../fixtures/nvidia-smi/ps_etimes_rtx_5090.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("ps etimes should parse");

        let compute = &result.gpus[0].processes[0];
        assert_eq!(compute.parent_pid, Some(11999));
        assert_eq!(compute.runtime_seconds, Some(7811));

        let graphics = result.gpus[0]
            .processes
            .iter()
            .find(|process| process.pid == 2200)
            .expect("graphics process should be present");
        assert_eq!(graphics.parent_pid, Some(1));
        assert_eq!(graphics.runtime_seconds, Some(28800));
    }
}
