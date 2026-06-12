use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

fn run_helper(input: &str) -> (std::process::ExitStatus, String, String) {
    run_helper_with_env(input, None)
}

fn run_helper_with_data_dir(
    input: &str,
    data_dir: &Path,
) -> (std::process::ExitStatus, String, String) {
    run_helper_with_env(input, Some(data_dir))
}

fn run_helper_with_env(
    input: &str,
    data_dir: Option<&Path>,
) -> (std::process::ExitStatus, String, String) {
    run_helper_with_extra_env(input, data_dir, &[])
}

fn run_helper_with_extra_env(
    input: &str,
    data_dir: Option<&Path>,
    extra_env: &[(String, OsString)],
) -> (std::process::ExitStatus, String, String) {
    let mut command = Command::new(env!("CARGO_BIN_EXE_gpuwatcher-helper"));
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(data_dir) = data_dir {
        command.env("GPUWATCHER_TEST_DATA_DIR", data_dir);
    }
    for (key, value) in extra_env {
        command.env(key, value);
    }

    let mut child = command.spawn().expect("spawn helper");

    child
        .stdin
        .as_mut()
        .expect("helper stdin")
        .write_all(input.as_bytes())
        .expect("write helper request");

    let output = child.wait_with_output().expect("helper output");
    (
        output.status,
        String::from_utf8(output.stdout).expect("stdout utf8"),
        String::from_utf8(output.stderr).expect("stderr utf8"),
    )
}

fn parse_success(stdout: &str) -> Value {
    assert_eq!(stdout.lines().count(), 1);
    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], true, "{response:?}");
    response["data"].clone()
}

fn parse_error(stdout: &str) -> Value {
    assert_eq!(stdout.lines().count(), 1);
    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], false, "{response:?}");
    response["error"].clone()
}

fn run_success(data_dir: &Path, action: &str, payload: Value) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) = run_helper_with_data_dir(&request.to_string(), data_dir);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_success(&stdout)
}

fn run_error(data_dir: &Path, action: &str, payload: Value) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) = run_helper_with_data_dir(&request.to_string(), data_dir);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_error(&stdout)
}

fn run_success_with_env(
    data_dir: &Path,
    action: &str,
    payload: Value,
    extra_env: &[(String, OsString)],
) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) =
        run_helper_with_extra_env(&request.to_string(), Some(data_dir), extra_env);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_success(&stdout)
}

fn run_helper_value_with_env(
    data_dir: &Path,
    action: &str,
    payload: Value,
    extra_env: &[(String, OsString)],
) -> (std::process::ExitStatus, String, String, Value) {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) =
        run_helper_with_extra_env(&request.to_string(), Some(data_dir), extra_env);
    let response = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    (status, stdout, stderr, response)
}

fn temp_data_dir(test_name: &str) -> std::path::PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "gpuwatcher-helper-{test_name}-{}-{unique}",
        std::process::id()
    ));
    std::fs::create_dir_all(&path).expect("create temp data dir");
    path
}

fn sample_server_input() -> Value {
    json!({
        "id": null,
        "name": "Helper CLI GPU",
        "host": "helper.example.test",
        "port": 22,
        "username": "gpu",
        "sshKeyPath": null,
        "pollingIntervalSeconds": 30,
        "enabled": true
    })
}

fn fake_ssh_path_env(test_name: &str, stdout: &str) -> (PathBuf, Vec<(String, OsString)>) {
    let dir = temp_data_dir(test_name);
    let ssh_path = dir.join("ssh");
    let script = format!(
        "#!/bin/sh\ncat >/dev/null\ncat <<'GPUWATCHER_FAKE_SSH'\n{stdout}\nGPUWATCHER_FAKE_SSH\n"
    );
    std::fs::write(&ssh_path, script).expect("write fake ssh");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&ssh_path)
            .expect("fake ssh metadata")
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&ssh_path, permissions).expect("chmod fake ssh");
    }

    let mut path = OsString::from(&dir);
    path.push(":");
    path.push(std::env::var_os("PATH").unwrap_or_default());
    (dir, vec![("PATH".to_string(), path)])
}

fn no_install_stdout_with_optional_warnings() -> String {
    [
        "__GPUWATCH_SECTION__:hostname:0\ngpu-host\n__GPUWATCH_END__:hostname\n",
        "__GPUWATCH_SECTION__:gpu_csv:0\n0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100-SXM4-40GB, 535.129.03, 40960, N/A, 39936, N/A, 4, 41, N/A, 400.00, 30, 1410, 1215\n__GPUWATCH_END__:gpu_csv\n",
        "__GPUWATCH_SECTION__:compute_apps_csv:9\ncompute-apps unavailable\n__GPUWATCH_END__:compute_apps_csv\n",
        "__GPUWATCH_SECTION__:gpu_extra_csv:9\ngpu extra unavailable\n__GPUWATCH_END__:gpu_extra_csv\n",
        "__GPUWATCH_SECTION__:mig_list:9\nmig unavailable\n__GPUWATCH_END__:mig_list\n",
        "__GPUWATCH_SECTION__:pmon:9\npmon unavailable\n__GPUWATCH_END__:pmon\n",
        "__GPUWATCH_SECTION__:dmon:9\ndmon unavailable\n__GPUWATCH_END__:dmon\n",
        "__GPUWATCH_SECTION__:dmon_pcie:9\ndmon pcie unavailable\n__GPUWATCH_END__:dmon_pcie\n",
        "__GPUWATCH_SECTION__:ps:9\nps unavailable\n__GPUWATCH_END__:ps\n",
    ]
    .concat()
}

#[test]
fn cli_health_writes_one_json_response_to_stdout() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);

    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], true);
    assert_eq!(response["data"]["status"], "ok");
}

#[test]
fn cli_unknown_action_writes_structured_error_without_stderr() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"uname -a","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);

    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["layer"], "helper_contract");
    assert_eq!(response["error"]["type"], "unknown_action");
}

#[test]
fn cli_dispatches_local_action_matrix_with_camel_case_dtos() {
    let data_dir = temp_data_dir("matrix");

    let initialized = run_success(&data_dir, "initialize_app", json!({}));
    assert_eq!(initialized.as_array().expect("initial overview").len(), 0);

    let servers = run_success(&data_dir, "list_servers", json!({}));
    assert_eq!(servers.as_array().expect("initial servers").len(), 0);

    let saved = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    assert_eq!(saved["name"], "Helper CLI GPU");
    assert_eq!(saved["sshKeyPath"], Value::Null);
    assert!(saved.get("pollingIntervalSeconds").is_some());
    assert!(saved.get("configRevision").is_some());
    let server_id = saved["id"].as_str().expect("saved id").to_string();

    let overview = run_success(&data_dir, "list_overview", json!({}));
    assert_eq!(overview.as_array().expect("overview rows").len(), 1);
    assert!(overview[0].get("gpuTotal").is_some());
    assert!(overview[0].get("lastSuccessAt").is_some());

    let disabled = run_success(
        &data_dir,
        "set_server_enabled",
        json!({ "id": server_id, "enabled": false }),
    );
    assert_eq!(disabled["enabled"], false);
    assert!(disabled.get("updatedAt").is_some());
    let server_id = disabled["id"].as_str().expect("disabled id").to_string();

    let seeded_overview = run_success(&data_dir, "seed_demo_data", json!({}));
    assert_eq!(
        seeded_overview.as_array().expect("seeded overview").len(),
        1
    );
    assert_eq!(seeded_overview[0]["gpuTotal"], 2);

    let detail = run_success(&data_dir, "get_server_detail", json!({ "id": server_id }));
    assert_eq!(detail["server"]["id"], server_id);
    assert!(detail.get("collectorHostname").is_some());
    assert!(detail.get("driverVersion").is_some());
    assert!(detail["gpus"].as_array().expect("detail gpus").len() >= 2);

    let history = run_success(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "24h" }),
    );
    assert_eq!(history["serverId"], server_id);
    assert_eq!(history["range"], "24h");
    assert!(history.get("pollingIntervalSeconds").is_some());
    assert!(history["series"].as_array().expect("history series").len() >= 2);
    let history_sample = &history["series"][0]["samples"][0];
    assert!(history_sample.get("memoryTotalMiB").is_some());

    let processes = run_success(&data_dir, "list_processes", json!({}));
    assert!(!processes.as_array().expect("process rows").is_empty());
    assert!(processes[0].get("serverId").is_some());
    assert!(processes[0].get("gpuMemoryUsedMiB").is_some());
    assert!(processes[0].get("hostMemoryUsedMiB").is_some());

    let deleted = run_success(&data_dir, "delete_server", json!({ "id": server_id }));
    assert_eq!(deleted, Value::Null);

    let servers_after_delete = run_success(&data_dir, "list_servers", json!({}));
    assert_eq!(
        servers_after_delete
            .as_array()
            .expect("servers after delete")
            .len(),
        0
    );
}

#[test]
fn cli_local_actions_return_structured_errors_for_invalid_payloads_and_service_errors() {
    let data_dir = temp_data_dir("errors");

    let malformed_save = run_error(
        &data_dir,
        "save_server",
        json!({ "input": { "name": "missing fields" } }),
    );
    assert_eq!(malformed_save["layer"], "helper_contract");
    assert_eq!(malformed_save["type"], "invalid_payload");

    let invalid_delete = run_error(&data_dir, "delete_server", json!({ "id": 42 }));
    assert_eq!(invalid_delete["layer"], "helper_contract");
    assert_eq!(invalid_delete["type"], "invalid_payload");

    let invalid_enabled = run_error(
        &data_dir,
        "set_server_enabled",
        json!({ "id": "server-1", "enabled": "yes" }),
    );
    assert_eq!(invalid_enabled["layer"], "helper_contract");
    assert_eq!(invalid_enabled["type"], "invalid_payload");

    let invalid_detail = run_error(&data_dir, "get_server_detail", json!({ "id": null }));
    assert_eq!(invalid_detail["layer"], "helper_contract");
    assert_eq!(invalid_detail["type"], "invalid_payload");

    let saved = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    let server_id = saved["id"].as_str().expect("saved id");
    let invalid_range = run_error(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "7d" }),
    );
    assert_eq!(invalid_range["type"], "invalid_history_range");

    let missing_server = run_error(
        &data_dir,
        "set_server_enabled",
        json!({ "id": "missing", "enabled": true }),
    );
    assert_eq!(missing_server["type"], "server_not_found");
}

#[test]
fn cli_dispatches_ssh_actions_through_service_with_fake_ssh() {
    let data_dir = temp_data_dir("ssh-actions");
    let saved = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    let server_id = saved["id"].as_str().expect("saved id").to_string();
    let (_fake_dir, fake_ssh_env) = fake_ssh_path_env(
        "fake-ssh-success",
        &no_install_stdout_with_optional_warnings(),
    );

    let test_result = run_success_with_env(
        &data_dir,
        "test_connection",
        json!({ "id": server_id }),
        &fake_ssh_env,
    );
    assert_eq!(test_result["ok"], true);
    assert_eq!(test_result["status"], "online");
    assert_eq!(
        test_result["message"],
        "no-install snapshot collection succeeded"
    );

    let refresh_result = run_success_with_env(
        &data_dir,
        "refresh_server",
        json!({ "id": server_id }),
        &fake_ssh_env,
    );
    assert_eq!(refresh_result["ok"], true);
    assert_eq!(refresh_result["status"], "online");
    assert_eq!(refresh_result["message"], "snapshot stored");

    let detail = run_success(&data_dir, "get_server_detail", json!({ "id": server_id }));
    assert_eq!(detail["health"]["status"], "online");
    assert_eq!(detail["gpus"][0]["memoryUsedMiB"], Value::Null);
    assert!(detail["warnings"]
        .as_array()
        .expect("warnings")
        .iter()
        .any(|warning| warning
            .as_str()
            .expect("warning string")
            .contains("pmon collection failed")));

    let history = run_success(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "24h" }),
    );
    assert_eq!(
        history["series"][0]["samples"]
            .as_array()
            .expect("samples")
            .len(),
        1
    );
}

#[test]
fn cli_ssh_actions_use_helper_contract_payload_errors_and_service_errors() {
    let data_dir = temp_data_dir("ssh-errors");

    for action in ["test_connection", "refresh_server"] {
        let invalid_payload = run_error(&data_dir, action, json!({ "id": 42 }));
        assert_eq!(invalid_payload["layer"], "helper_contract");
        assert_eq!(invalid_payload["type"], "invalid_payload");

        let missing_server = run_error(&data_dir, action, json!({ "id": "missing" }));
        assert_eq!(missing_server["layer"], "storage_app");
        assert_eq!(missing_server["type"], "server_not_found");
    }
}

#[test]
fn cli_refresh_failure_preserves_stale_success_and_history_gap() {
    let data_dir = temp_data_dir("refresh-stale");
    let saved = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    let server_id = saved["id"].as_str().expect("saved id").to_string();
    let (_success_dir, success_env) = fake_ssh_path_env(
        "fake-ssh-stale-success",
        &no_install_stdout_with_optional_warnings(),
    );
    run_success_with_env(
        &data_dir,
        "refresh_server",
        json!({ "id": server_id }),
        &success_env,
    );
    let history_before = run_success(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "24h" }),
    );
    let sample_count_before = history_before["series"][0]["samples"]
        .as_array()
        .expect("samples before")
        .len();

    let (_failure_dir, failure_env) = fake_ssh_path_env(
        "fake-ssh-stale-failure",
        "__GPUWATCH_SECTION__:gpu_csv:127\nnvidia-smi not found\n__GPUWATCH_END__:gpu_csv\n",
    );
    let failure = run_success_with_env(
        &data_dir,
        "refresh_server",
        json!({ "id": server_id }),
        &failure_env,
    );
    assert_eq!(failure["ok"], false);
    assert_eq!(failure["status"], "error");
    assert_eq!(failure["errorType"], "nvidia_smi_missing");

    let detail = run_success(&data_dir, "get_server_detail", json!({ "id": server_id }));
    assert_eq!(detail["health"]["status"], "stale");
    assert_eq!(detail["gpus"].as_array().expect("stale gpus").len(), 1);
    assert_eq!(detail["gpus"][0]["memoryUsedMiB"], Value::Null);

    let history_after = run_success(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "24h" }),
    );
    assert_eq!(
        history_after["series"][0]["samples"]
            .as_array()
            .expect("samples after")
            .len(),
        sample_count_before
    );
}

#[test]
fn cli_parallel_db_mutations_use_isolated_database_without_lock_or_partial_poll_state() {
    let data_dir = temp_data_dir("concurrency");
    let saved = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    let server_id = saved["id"].as_str().expect("saved id").to_string();
    let mut toggle_input = sample_server_input();
    toggle_input["name"] = json!("Concurrent Toggle Target");
    toggle_input["host"] = json!("toggle.example.test");
    let toggle_target = run_success(&data_dir, "save_server", json!({ "input": toggle_input }));
    let toggle_server_id = toggle_target["id"].as_str().expect("toggle id").to_string();
    let (_fake_dir, fake_ssh_env) = fake_ssh_path_env(
        "fake-ssh-concurrency",
        &no_install_stdout_with_optional_warnings(),
    );

    let mut actions = Vec::new();
    for index in 0..4 {
        let mut input = sample_server_input();
        input["name"] = json!(format!("Concurrency Save {index}"));
        input["host"] = json!(format!("concurrency-{index}.example.test"));
        actions.push(("save_server".to_string(), json!({ "input": input })));
    }
    actions.push((
        "set_server_enabled".to_string(),
        json!({ "id": toggle_server_id, "enabled": false }),
    ));
    actions.push(("seed_demo_data".to_string(), json!({})));
    actions.push(("refresh_server".to_string(), json!({ "id": server_id })));

    let handles: Vec<_> = actions
        .into_iter()
        .map(|(action, payload)| {
            let data_dir = data_dir.clone();
            let fake_ssh_env = fake_ssh_env.clone();
            thread::spawn(move || {
                run_helper_value_with_env(&data_dir, &action, payload, &fake_ssh_env)
            })
        })
        .collect();

    for handle in handles {
        let (status, stdout, stderr, response) = handle.join().expect("helper thread");
        assert!(status.success());
        assert_eq!(stderr, "");
        assert!(
            !stdout.to_lowercase().contains("database is locked"),
            "unexpected lock error: {stdout}"
        );
        assert_eq!(response["ok"], true, "{response:?}");
    }

    let servers = run_success(&data_dir, "list_servers", json!({}));
    let server_names: Vec<_> = servers
        .as_array()
        .expect("servers")
        .iter()
        .filter_map(|server| server["name"].as_str())
        .collect();
    for index in 0..4 {
        assert!(
            server_names.contains(&format!("Concurrency Save {index}").as_str()),
            "missing concurrent save {index}: {server_names:?}"
        );
    }

    let detail = run_success(&data_dir, "get_server_detail", json!({ "id": server_id }));
    assert!(matches!(
        detail["health"]["status"].as_str(),
        Some("online" | "disabled")
    ));
    assert!(!detail["gpus"].as_array().expect("gpus").is_empty());
    assert_eq!(detail["gpus"][0]["memoryUsedMiB"], Value::Null);

    let history = run_success(
        &data_dir,
        "list_gpu_history",
        json!({ "serverId": server_id, "gpuIndex": null, "gpuUuid": null, "range": "24h" }),
    );
    assert!(!history["series"][0]["samples"]
        .as_array()
        .expect("history samples")
        .is_empty());
}

#[test]
fn cli_returns_main_scheduler_owned_error_for_poll_due_servers() {
    let data_dir = temp_data_dir("main-scheduler-owned");

    let error = run_error(&data_dir, "poll_due_servers", json!({ "id": "server-1" }));
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "main_scheduler_owned");
    assert!(error["message"]
        .as_str()
        .expect("error message")
        .contains("Electron main owns due polling"));
}
