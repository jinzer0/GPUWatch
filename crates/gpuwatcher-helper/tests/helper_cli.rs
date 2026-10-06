#[path = "helper_cli/mod.rs"]
mod helper_cli_cases;

mod availability_reset {
    use gpuwatcher_core::models::ParsedCollectorPayload;
    use gpuwatcher_core::protocol::parse_collector_json;
    use gpuwatcher_core::state::AppState;
    use gpuwatcher_helper::contract::{
        action_name, parse_action, ActionVisibility, DbMutation, HelperAction, PollingOverlapKey,
        TimeoutClass, HELPER_CONTRACT,
    };
    use serde_json::{json, Value};

    use super::helper_cli_cases::support::{
        run_error, run_success, sample_server_input, temp_data_dir,
    };

    const ACTION: &str = "reset_availability_observations";
    const AT: &str = "2026-06-02T00:00:00Z";
    const RAW: &str = include_str!("../../../fixtures/protocol/v1/success_single_gpu.json");

    fn seed_observations(data_dir: &std::path::Path, server_ids: &[String]) {
        let ParsedCollectorPayload::Success(mut success) =
            parse_collector_json(RAW).expect("parse fixture")
        else {
            panic!("expected success fixture")
        };
        success.gpus[0].gpu_utilization_percent = Some(5.0);
        success.gpus[0].memory_used_mib = Some(1024);
        let state = AppState::open_in_data_dir(data_dir).expect("open isolated state");
        let repository = state.repository.lock().expect("repository mutex");
        for server_id in server_ids {
            repository
                .store_success(server_id, RAW, &success, AT)
                .expect("seed observation");
        }
    }

    fn assert_observation(data_dir: &std::path::Path, server_id: &str, started: Option<&str>) {
        let state = AppState::open_in_data_dir(data_dir).expect("open isolated state");
        let repository = state.repository.lock().expect("repository mutex");
        let availability = repository
            .gpu_availability(server_id, "GPU-11111111-1111-1111-1111-111111111111", 0, AT)
            .expect("read observation");
        assert_eq!(availability.condition_started_at.as_deref(), started);
        assert_eq!(
            availability.state,
            if started.is_some() {
                "candidate"
            } else {
                "unknown"
            }
        );
        assert!(repository
            .latest_snapshot(server_id)
            .expect("latest snapshot")
            .is_some());
    }

    #[test]
    fn reset_contract_is_canonical_main_only_and_scheduler_serialized() {
        assert_eq!(
            parse_action(ACTION),
            Some(HelperAction::ResetAvailabilityObservations)
        );
        assert_eq!(
            action_name(HelperAction::ResetAvailabilityObservations),
            ACTION
        );
        assert_eq!(
            serde_json::to_value(HelperAction::ResetAvailabilityObservations).unwrap(),
            ACTION
        );
        assert_eq!(
            serde_json::to_value(DbMutation::AvailabilityReset).unwrap(),
            "availability-reset"
        );
        let entries: Vec<_> = HELPER_CONTRACT
            .iter()
            .filter(|entry| entry.helper_action == HelperAction::ResetAvailabilityObservations)
            .collect();
        assert_eq!(entries.len(), 1);
        let entry = entries[0];
        assert_eq!(entry.frontend_api, None);
        assert_eq!(entry.electron_preload_method, None);
        assert_eq!(entry.visibility, ActionVisibility::MainOnly);
        assert_eq!(entry.timeout_class, TimeoutClass::Local10s);
        assert_eq!(entry.db_mutation, DbMutation::AvailabilityReset);
        assert_eq!(
            entry.polling_overlap_key,
            PollingOverlapKey::ElectronMainScheduler
        );
    }

    #[test]
    fn reset_rejects_invalid_payload_before_opening_state() {
        let data_dir = temp_data_dir("reset-payload-before-state");
        // A state open would fail here; payload errors must win without touching storage.
        std::fs::write(data_dir.join("GPUWatcher"), b"blocked database parent")
            .expect("block state directory");
        for payload in [
            json!({}),
            json!({ "serverId": null, "extra": true }),
            json!({ "serverId": "server-1", "extra": true }),
            json!({ "serverId": "" }),
            json!({ "serverId": " \t\n" }),
            json!({ "serverId": false }),
            json!({ "serverId": 1 }),
            json!({ "serverId": [] }),
            json!({ "serverId": {} }),
            Value::Null,
            json!([]),
            json!("server-1"),
            json!(false),
            json!(1),
        ] {
            let error = run_error(&data_dir, ACTION, payload);
            assert_eq!(error["layer"], "helper_contract");
            assert_eq!(error["type"], "invalid_payload");
        }
        std::fs::remove_dir_all(data_dir).expect("remove isolated data");
    }

    #[test]
    fn reset_one_and_all_return_null_and_preserve_snapshots() {
        let data_dir = temp_data_dir("reset-one-and-all");
        let ids: Vec<String> = (0..2)
            .map(|_| {
                let server = run_success(
                    &data_dir,
                    "save_server",
                    json!({ "input": sample_server_input() }),
                );
                server["id"].as_str().expect("server id").to_string()
            })
            .collect();
        seed_observations(&data_dir, &ids);
        assert_observation(&data_dir, &ids[0], Some(AT));
        assert_observation(&data_dir, &ids[1], Some(AT));

        let error = run_error(
            &data_dir,
            ACTION,
            json!({ "serverId": null, "extra": true }),
        );
        assert_eq!(error["type"], "invalid_payload");
        assert_observation(&data_dir, &ids[0], Some(AT));
        assert_observation(&data_dir, &ids[1], Some(AT));

        assert_eq!(
            run_success(&data_dir, ACTION, json!({ "serverId": ids[0] })),
            Value::Null
        );
        assert_observation(&data_dir, &ids[0], None);
        assert_observation(&data_dir, &ids[1], Some(AT));
        seed_observations(&data_dir, &ids);
        assert_eq!(
            run_success(&data_dir, ACTION, json!({ "serverId": null })),
            Value::Null
        );
        assert_observation(&data_dir, &ids[0], None);
        assert_observation(&data_dir, &ids[1], None);
        assert_eq!(
            run_success(&data_dir, ACTION, json!({ "serverId": null })),
            Value::Null
        );
        std::fs::remove_dir_all(data_dir).expect("remove isolated data");
    }
}
