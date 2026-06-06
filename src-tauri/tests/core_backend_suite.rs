use gpuwatcher_core::command_runner::CommandOutput;
use gpuwatcher_core::models::{ParsedCollectorPayload, Server, ServerInput};
use gpuwatcher_core::no_install_collector::build_no_install_snapshot_from_output;
use gpuwatcher_core::protocol::parse_collector_json;
use gpuwatcher_core::repository::{now_string, Repository};
use gpuwatcher_core::service;
use gpuwatcher_core::state::AppState;

fn open_repository(path: &std::path::Path) -> Repository {
    let repository = Repository::open(path).expect("open repository");
    repository.migrate().expect("migrate repository");
    repository
}

fn server_input(name: &str) -> ServerInput {
    ServerInput {
        id: None,
        name: name.to_string(),
        host: "gpu.example.test".to_string(),
        port: 22,
        username: "gpuwatch".to_string(),
        ssh_key_path: None,
        polling_interval_seconds: Some(30),
        enabled: true,
    }
}

fn server() -> Server {
    Server {
        id: "server-1".to_string(),
        name: "GPU Server".to_string(),
        host: "gpu.example.test".to_string(),
        port: 22,
        username: "gpuwatch".to_string(),
        ssh_key_path: None,
        polling_interval_seconds: 30,
        enabled: true,
        config_revision: 1,
        created_at: "2026-06-02T00:00:00Z".to_string(),
        updated_at: "2026-06-02T00:00:00Z".to_string(),
    }
}

fn section(name: &str, status: i32, body: &str) -> String {
    format!("__GPUWATCH_SECTION__:{name}:{status}\n{body}\n__GPUWATCH_END__:{name}\n")
}

#[test]
fn src_tauri_verification_exercises_core_no_install_collector() {
    let gpu_csv = "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100-SXM4-40GB, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, 1410, 1215";
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 0, gpu_csv),
        section("compute_apps_csv", 1, "nvidia-smi compute-apps unavailable"),
        section("pmon", 1, "pmon unavailable"),
    ]
    .join("");
    let output = CommandOutput {
        stdout,
        stderr: "remote stderr note".to_string(),
    };

    let (_raw_json, success) =
        build_no_install_snapshot_from_output(&server(), &output).expect("snapshot");

    assert_eq!(success.server.hostname.as_deref(), Some("gpu-host"));
    assert_eq!(success.gpus.len(), 1);
    assert_eq!(success.gpus[0].memory_total_mib, Some(40960));
    assert!(success
        .warnings
        .iter()
        .any(|warning| warning.contains("compute_apps_csv collection failed")));
    assert!(success
        .warnings
        .iter()
        .any(|warning| warning.contains("remote script stderr")));
}

#[test]
fn src_tauri_verification_rejects_installed_collector_json_as_remote_output() {
    let output = CommandOutput {
        stdout: r#"{"ok":true,"gpus":[]}"#.to_string(),
        stderr: String::new(),
    };

    let error = build_no_install_snapshot_from_output(&server(), &output)
        .expect_err("sectioned output required");

    assert_eq!(error.error_type, "remote_output_malformed");
    assert!(error.message.contains("GPU CSV section"));
}

#[test]
fn src_tauri_verification_keeps_optional_collection_failures_as_warnings() {
    let gpu_csv = "0, GPU-bbbb, 00000000:66:00.0, NVIDIA RTX 6000 Ada, 550.54.14, 49140, 2048, 47092, 0, 0, 39, N/A, N/A, N/A, N/A, N/A";
    let stdout = [
        section("hostname", 0, "gpu-host"),
        section("gpu_csv", 0, gpu_csv),
        section("compute_apps_csv", 1, "No running compute processes found"),
        section("pmon", 1, "pmon unavailable"),
        section("dmon", 1, "dmon unavailable"),
        section("ps", 1, "ps unavailable"),
    ]
    .join("");
    let output = CommandOutput {
        stdout,
        stderr: String::new(),
    };

    let (_raw_json, success) = build_no_install_snapshot_from_output(&server(), &output)
        .expect("base GPU CSV success should tolerate optional failures");

    assert_eq!(success.gpus.len(), 1);
    assert!(success
        .warnings
        .iter()
        .any(|warning| warning.contains("compute_apps_csv collection failed")));
    assert!(success
        .warnings
        .iter()
        .any(|warning| warning.contains("ps collection failed")));
}

#[test]
fn src_tauri_verification_exercises_core_protocol_null_semantics() {
    let raw = include_str!("../../fixtures/protocol/v1/success_optional_metrics_missing_null.json");
    let ParsedCollectorPayload::Success(success) =
        parse_collector_json(raw).expect("parse fixture")
    else {
        panic!("expected success fixture");
    };

    let gpu = &success.gpus[0];
    assert_eq!(gpu.encoder_utilization_percent, None);
    assert_eq!(gpu.pcie_rx_kib_per_sec, None);
    assert_eq!(gpu.mig_mode_current, None);
    assert_eq!(gpu.processes[0].gpu_sm_utilization_percent, None);
}

#[test]
fn src_tauri_verification_exercises_core_repository_snapshot_storage() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let repository = open_repository(&temp_dir.path().join("repository-storage.sqlite3"));
    let saved = repository
        .save_server(server_input("Repository GPU"))
        .expect("save server");
    let raw = include_str!("../../fixtures/protocol/v1/success_multi_gpu.json");
    let ParsedCollectorPayload::Success(success) =
        parse_collector_json(raw).expect("parse fixture")
    else {
        panic!("expected success fixture");
    };

    repository
        .store_success(&saved.id, raw, &success, &now_string())
        .expect("store success");

    let latest = repository
        .latest_snapshot(&saved.id)
        .expect("latest lookup")
        .expect("latest snapshot");
    assert_eq!(latest.raw_json, raw);
    let history = repository
        .list_gpu_history(&saved.id, None, None, "24h", &now_string())
        .expect("history lookup");
    assert_eq!(history.series.len(), 2);
    assert!(history
        .series
        .iter()
        .all(|series| series.samples.len() == 1));
    assert_eq!(
        repository
            .get_health(&saved.id)
            .expect("health lookup")
            .expect("health row")
            .status,
        "online"
    );
}

#[test]
fn src_tauri_verification_exercises_core_service_boundary() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::new(open_repository(
        &temp_dir.path().join("service-boundary.sqlite3"),
    ));

    let overview = service::seed_demo_data(&state).expect("seed demo data");
    let servers = service::list_servers(&state).expect("list servers");
    let processes = service::list_processes(&state).expect("list processes");

    assert_eq!(overview.len(), 1);
    assert_eq!(servers.len(), 1);
    assert!(!processes.is_empty());
}

#[test]
fn src_tauri_verification_confirms_live_ssh_tests_remain_ignored_and_env_gated() {
    let collector_source = include_str!("../../crates/gpuwatcher-core/src/no_install_collector.rs");

    assert_eq!(collector_source.matches("#[ignore]").count(), 2);
    assert!(collector_source.contains("GPUWATCHER_LIVE_SSH_TARGET"));
    assert!(collector_source.contains("target != \"tml-server\""));
    assert!(collector_source.contains("async fn live_tml_server()"));
    assert!(collector_source.contains("async fn live_tml_server_processes()"));
}
