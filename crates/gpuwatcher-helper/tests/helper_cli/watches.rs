use serde_json::{json, Value};

use gpuwatcher_helper::contract::{
    action_name, parse_action, ActionVisibility, DbMutation, HelperContractEntry,
    PollingOverlapKey, TimeoutClass, HELPER_CONTRACT,
};

use super::support::{
    parse_success, run_error, run_helper_with_data_dir, run_success, sample_server_input,
    temp_data_dir,
};

fn contract_entry(action_name_text: &str) -> &HelperContractEntry {
    HELPER_CONTRACT
        .iter()
        .find(|entry| action_name(entry.helper_action) == action_name_text)
        .expect("watch action contract entry")
}

#[test]
fn watch_actions_have_allowlisted_visibility_and_db_mutation_metadata() {
    // Given: the helper's action contract.
    let list_entry = contract_entry("list_watch_rules");
    let save_entry = contract_entry("save_gpu_available_watch");
    let delete_entry = contract_entry("delete_watch_rule");
    let consume_entry = contract_entry("consume_notification_events");

    // When: watch action metadata is inspected.
    let action_names = [
        "list_watch_rules",
        "save_gpu_available_watch",
        "delete_watch_rule",
        "consume_notification_events",
    ];

    // Then: renderer and main-only boundaries remain explicit and mutations serialize later.
    for action_name_text in action_names {
        assert!(parse_action(action_name_text).is_some());
    }
    assert_eq!(list_entry.frontend_api, Some("listWatchRules"));
    assert_eq!(list_entry.visibility, ActionVisibility::Renderer);
    assert_eq!(list_entry.electron_preload_method, Some("listWatchRules"));
    assert_eq!(list_entry.timeout_class, TimeoutClass::Local10s);
    assert_eq!(list_entry.db_mutation, DbMutation::None);
    assert_eq!(list_entry.polling_overlap_key, PollingOverlapKey::None);
    assert_eq!(save_entry.frontend_api, Some("saveGpuAvailableWatch"));
    assert_eq!(save_entry.visibility, ActionVisibility::Renderer);
    assert_eq!(
        save_entry.electron_preload_method,
        Some("saveGpuAvailableWatch")
    );
    assert_eq!(save_entry.timeout_class, TimeoutClass::Local10s);
    assert_eq!(save_entry.db_mutation, DbMutation::WatchRulesWrite);
    assert_eq!(save_entry.polling_overlap_key, PollingOverlapKey::ServerId);
    assert_eq!(delete_entry.frontend_api, Some("deleteWatchRule"));
    assert_eq!(delete_entry.visibility, ActionVisibility::Renderer);
    assert_eq!(
        delete_entry.electron_preload_method,
        Some("deleteWatchRule")
    );
    assert_eq!(delete_entry.timeout_class, TimeoutClass::Local10s);
    assert_eq!(delete_entry.db_mutation, DbMutation::WatchRulesDelete);
    assert_eq!(delete_entry.polling_overlap_key, PollingOverlapKey::None);
    assert_eq!(consume_entry.frontend_api, None);
    assert_eq!(consume_entry.visibility, ActionVisibility::MainOnly);
    assert_eq!(consume_entry.electron_preload_method, None);
    assert_eq!(consume_entry.timeout_class, TimeoutClass::Local10s);
    assert_eq!(
        consume_entry.db_mutation,
        DbMutation::NotificationOutboxConsume
    );
    assert_eq!(consume_entry.polling_overlap_key, PollingOverlapKey::None);
}

#[test]
fn cli_dispatches_watch_crud_and_consumes_notification_events() {
    // Given: an isolated helper database with a saved server.
    let data_dir = temp_data_dir("watch-crud");
    let server = run_success(
        &data_dir,
        "save_server",
        json!({ "input": sample_server_input() }),
    );
    let server_id = server["id"].as_str().expect("saved server id").to_string();

    // When: a renderer-visible watch is saved, listed, deleted, and main consumes events.
    let initial_rules = run_success(
        &data_dir,
        "list_watch_rules",
        json!({ "serverId": server_id }),
    );
    let saved_rule = run_success(
        &data_dir,
        "save_gpu_available_watch",
        json!({
            "input": {
                "id": null,
                "serverId": server_id,
                "gpuUuid": "GPU-helper-watch",
                "gpuIndex": 0,
                "enabled": true,
                "utilizationThresholdPercent": null,
                "memoryThresholdMiB": null,
                "sustainSeconds": null,
                "cooldownSeconds": null
            }
        }),
    );
    let rule_id = saved_rule["id"]
        .as_str()
        .expect("saved watch id")
        .to_string();
    let listed_rules = run_success(
        &data_dir,
        "list_watch_rules",
        json!({ "serverId": server_id }),
    );
    let deleted = run_success(&data_dir, "delete_watch_rule", json!({ "id": rule_id }));
    let remaining_rules = run_success(
        &data_dir,
        "list_watch_rules",
        json!({ "serverId": server_id }),
    );
    let events = run_success(&data_dir, "consume_notification_events", json!({}));

    // Then: core DTOs round-trip through the helper and consume uses the real database operation.
    assert_eq!(initial_rules, json!([]));
    assert_eq!(saved_rule["serverId"], server_id);
    assert_eq!(saved_rule["gpuUuid"], "GPU-helper-watch");
    assert_eq!(saved_rule["enabled"], true);
    assert_eq!(saved_rule["gpuIndex"], 0);
    assert_eq!(listed_rules.as_array().expect("listed rules").len(), 1);
    assert_eq!(deleted, Value::Null);
    assert_eq!(remaining_rules, json!([]));
    assert_eq!(events, json!([]));
}

#[test]
fn cli_watch_actions_return_structured_errors_for_malformed_payloads() {
    // Given: an isolated helper database.
    let data_dir = temp_data_dir("watch-payload-errors");

    // When: each typed watch boundary receives an invalid payload.
    let empty_server_id = run_error(&data_dir, "list_watch_rules", json!({ "serverId": "  " }));
    let malformed_watch_input = run_error(
        &data_dir,
        "save_gpu_available_watch",
        json!({ "input": { "serverId": "server-1", "gpuIndex": "zero" } }),
    );
    let blank_watch_server_id = run_error(
        &data_dir,
        "save_gpu_available_watch",
        json!({
            "input": {
                "id": null,
                "serverId": "  ",
                "gpuUuid": null,
                "gpuIndex": 0,
                "enabled": true,
                "utilizationThresholdPercent": null,
                "memoryThresholdMiB": null,
                "sustainSeconds": null,
                "cooldownSeconds": null
            }
        }),
    );
    let blank_present_watch_id = run_error(
        &data_dir,
        "save_gpu_available_watch",
        json!({
            "input": {
                "id": "  ",
                "serverId": "server-1",
                "gpuUuid": null,
                "gpuIndex": 0,
                "enabled": true,
                "utilizationThresholdPercent": null,
                "memoryThresholdMiB": null,
                "sustainSeconds": null,
                "cooldownSeconds": null
            }
        }),
    );
    let empty_rule_id = run_error(&data_dir, "delete_watch_rule", json!({ "id": "" }));
    let nonempty_consume = run_error(
        &data_dir,
        "consume_notification_events",
        json!({ "unexpected": true }),
    );

    // Then: malformed payloads retain the structured helper contract envelope.
    for error in [
        empty_server_id,
        malformed_watch_input,
        blank_watch_server_id,
        blank_present_watch_id,
        empty_rule_id,
        nonempty_consume,
    ] {
        assert_eq!(error["layer"], "helper_contract");
        assert_eq!(error["type"], "invalid_payload");
    }
}

#[test]
fn cli_consume_notification_events_writes_one_response_envelope() {
    // Given: an isolated helper database and an allowed empty consume payload.
    let data_dir = temp_data_dir("watch-consume-envelope");
    let request = json!({ "action": "consume_notification_events", "payload": {} });

    // When: Electron main's helper action is invoked through the CLI surface.
    let (status, stdout, stderr) = run_helper_with_data_dir(&request.to_string(), &data_dir);

    // Then: stdout is exactly one response envelope and diagnostics remain on stderr.
    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);
    assert!(stdout.ends_with('\n'));
    assert_eq!(parse_success(&stdout), json!([]));
}
