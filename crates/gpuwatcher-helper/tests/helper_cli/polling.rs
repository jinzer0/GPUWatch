use std::thread;

use serde_json::{json, Value};

use super::support::{
    fake_ssh_path_env, no_install_stdout_with_optional_warnings, run_error,
    run_helper_value_with_env, run_success, run_success_with_env, sample_server_input,
    temp_data_dir,
};

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
fn poll_due_servers_returns_main_scheduler_owned_error() {
    let data_dir = temp_data_dir("main-scheduler-owned");

    let error = run_error(&data_dir, "poll_due_servers", json!({ "id": "server-1" }));
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "main_scheduler_owned");
    assert!(error["message"]
        .as_str()
        .expect("error message")
        .contains("Electron main owns due polling"));
}
