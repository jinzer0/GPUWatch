use serde_json::{json, Value};

use super::support::{run_error, run_success, sample_server_input, temp_data_dir};

#[test]
fn cli_dispatches_server_crud_and_read_actions_with_camel_case_dtos() {
    let data_dir = temp_data_dir("server-crud");

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
    assert!(history["series"][0]["samples"][0]
        .get("memoryTotalMiB")
        .is_some());

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
fn cli_server_actions_return_structured_errors_for_invalid_payloads_and_service_errors() {
    let data_dir = temp_data_dir("server-errors");

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
