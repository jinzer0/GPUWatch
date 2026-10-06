use chrono::{DateTime, Duration};
use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::{
    GpuAvailableWatchInput, ParsedCollectorPayload, ServerInput, SuccessEnvelope,
};
use gpuwatcher_core::protocol::parse_collector_json;
use gpuwatcher_core::repository::Repository;
use rusqlite::Connection;

const SUCCESS_JSON: &str = include_str!("../../../fixtures/protocol/v1/success_single_gpu.json");
const GPU_UUID: &str = "GPU-11111111-1111-1111-1111-111111111111";

fn input(interval: i64) -> ServerInput {
    ServerInput {
        id: None,
        name: "Availability test".to_string(),
        host: "availability.example.test".to_string(),
        port: 22,
        username: "test".to_string(),
        ssh_key_path: None,
        polling_interval_seconds: Some(interval),
        enabled: true,
    }
}

fn repository(path: &std::path::Path) -> Repository {
    let repository = Repository::open(path).expect("open isolated repository");
    repository.migrate().expect("migrate isolated repository");
    repository
}

fn success() -> SuccessEnvelope {
    let ParsedCollectorPayload::Success(mut success) =
        parse_collector_json(SUCCESS_JSON).expect("parse protocol fixture")
    else {
        panic!("expected success fixture")
    };
    success.gpus[0].gpu_utilization_percent = Some(5.0);
    success.gpus[0].memory_used_mib = Some(1024);
    success
}

fn at(seconds: i64) -> String {
    let start = DateTime::parse_from_rfc3339("2026-06-02T00:00:00Z").expect("start time");
    (start + Duration::seconds(seconds)).to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn store(repository: &Repository, server: &str, success: &SuccessEnvelope, seconds: i64) {
    repository
        .store_success(server, SUCCESS_JSON, success, &at(seconds))
        .expect("store observed success");
}

fn assert_identity(
    repository: &Repository,
    server: &str,
    uuid: &str,
    index: i64,
    seconds: i64,
    state: &str,
    started: Option<i64>,
) {
    let availability = repository
        .gpu_availability(server, uuid, index, &at(seconds))
        .expect("read availability");
    assert_eq!(availability.state, state);
    assert_eq!(availability.condition_started_at, started.map(at));
}

fn assert_state(
    repository: &Repository,
    server: &str,
    seconds: i64,
    state: &str,
    started: Option<i64>,
) {
    assert_identity(repository, server, GPU_UUID, 0, seconds, state, started);
}

fn watch(server: &str) -> GpuAvailableWatchInput {
    GpuAvailableWatchInput {
        id: None,
        server_id: server.to_string(),
        gpu_uuid: Some(GPU_UUID.to_string()),
        gpu_index: 0,
        enabled: true,
        utilization_threshold_percent: None,
        memory_threshold_mib: None,
        sustain_seconds: Some(0),
        cooldown_seconds: Some(900),
    }
}

#[test]
fn inclusive_thresholds_require_300_seconds_of_successes_without_watch_opt_in() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    assert_state(&repository, &server.id, 0, "unknown", None);
    let success = success();
    for seconds in [0, 100, 200, 299] {
        store(&repository, &server.id, &success, seconds);
        assert_state(&repository, &server.id, seconds, "candidate", Some(0));
    }
    store(&repository, &server.id, &success, 300);
    assert_state(&repository, &server.id, 300, "available", Some(0));
    assert!(repository
        .list_watch_rules(&server.id)
        .expect("rules")
        .is_empty());
    assert!(repository
        .consume_notification_outbox()
        .expect("outbox")
        .is_empty());
}

#[test]
fn known_condition_exit_is_in_use_but_null_and_invalid_metrics_are_unknown() {
    let cases = [
        (Some(5.01), Some(1024), "in_use"),
        (Some(5.0), Some(1025), "in_use"),
        (Some(100.0), Some(0), "in_use"),
        (None, Some(0), "unknown"),
        (Some(0.0), None, "unknown"),
        (Some(6.0), None, "unknown"),
        (None, Some(1025), "unknown"),
        (None, None, "unknown"),
        (Some(-0.01), Some(0), "unknown"),
        (Some(100.01), Some(0), "unknown"),
        (Some(f64::NAN), Some(0), "unknown"),
        (Some(f64::INFINITY), Some(0), "unknown"),
        (Some(0.0), Some(-1), "unknown"),
    ];
    for (utilization, memory, expected) in cases {
        let temp = tempfile::tempdir().expect("temp dir");
        let repository = repository(&temp.path().join("availability.sqlite3"));
        let server = repository.save_server(input(30)).expect("server");
        let mut success = success();
        store(&repository, &server.id, &success, 0);
        success.gpus[0].gpu_utilization_percent = utilization;
        success.gpus[0].memory_used_mib = memory;
        store(&repository, &server.id, &success, 60);
        assert_state(&repository, &server.id, 60, expected, None);
        success.gpus[0].gpu_utilization_percent = Some(0.0);
        success.gpus[0].memory_used_mib = Some(0);
        store(&repository, &server.id, &success, 120);
        assert_state(&repository, &server.id, 120, "candidate", Some(120));
        for seconds in [220, 320, 420] {
            store(&repository, &server.id, &success, seconds);
        }
        assert_state(&repository, &server.id, 420, "available", Some(120));
    }
}

#[test]
fn null_observation_breaks_nearly_completed_sustain() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let mut success = success();
    for seconds in [0, 100, 200] {
        store(&repository, &server.id, &success, seconds);
    }
    success.gpus[0].memory_used_mib = None;
    store(&repository, &server.id, &success, 250);
    assert_state(&repository, &server.id, 250, "unknown", None);
    success.gpus[0].memory_used_mib = Some(0);
    store(&repository, &server.id, &success, 300);
    assert_state(&repository, &server.id, 300, "candidate", Some(300));
}

#[test]
fn failed_poll_keeps_stale_snapshot_but_resets_availability_and_sustain() {
    let temp = tempfile::tempdir().expect("temp dir");
    let path = temp.path().join("availability.sqlite3");
    let repository = repository(&path);
    let server = repository.save_server(input(30)).expect("server");
    let success = success();
    for seconds in [0, 100, 200, 300] {
        store(&repository, &server.id, &success, seconds);
    }
    assert_state(&repository, &server.id, 300, "available", Some(0));
    repository
        .store_failure(
            &server.id,
            &AppError::new("transport_ssh", "down", "down"),
            &at(310),
        )
        .expect("failed poll");
    assert_eq!(
        repository
            .get_health(&server.id)
            .expect("health")
            .expect("health row")
            .status,
        "stale"
    );
    assert_eq!(
        repository
            .latest_snapshot(&server.id)
            .expect("snapshot")
            .expect("stale success")
            .received_at,
        at(300)
    );
    let connection = Connection::open(path).expect("inspection connection");
    let history_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM gpu_history_samples", [], |row| {
            row.get(0)
        })
        .expect("history count");
    assert_eq!(history_count, 4);
    assert_state(&repository, &server.id, 310, "unknown", None);
    store(&repository, &server.id, &success, 320);
    assert_state(&repository, &server.id, 320, "candidate", Some(320));
}

#[test]
fn interval_gap_is_inclusive_and_longer_gaps_restart_sustain() {
    for interval in [1, 30, 120] {
        let limit = 2 * interval + 60;
        for excess in [0, 1] {
            let temp = tempfile::tempdir().expect("temp dir");
            let repository = repository(&temp.path().join("availability.sqlite3"));
            let server = repository.save_server(input(interval)).expect("server");
            let success = success();
            store(&repository, &server.id, &success, 0);
            store(&repository, &server.id, &success, limit + excess);
            let state = if excess == 0 && limit >= 300 {
                "available"
            } else {
                "candidate"
            };
            let started = if excess == 0 { 0 } else { limit + excess };
            assert_state(
                &repository,
                &server.id,
                limit + excess,
                state,
                Some(started),
            );
        }
    }
}

#[test]
fn reads_expire_observations_without_promoting_candidate_on_elapsed_wall_time() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(300)).expect("server");
    let success = success();
    store(&repository, &server.id, &success, 0);
    repository
        .mark_poll_started(&server.id, &at(30))
        .expect("poll started");
    assert_state(&repository, &server.id, 300, "candidate", Some(0));
    assert_state(&repository, &server.id, 660, "candidate", Some(0));
    assert_state(&repository, &server.id, 661, "unknown", None);
    assert_state(&repository, &server.id, -1, "unknown", None);
    assert_eq!(
        repository
            .gpu_availability(&server.id, GPU_UUID, 0, "invalid")
            .expect("invalid read time")
            .state,
        "unknown"
    );
    store(&repository, &server.id, &success, 300);
    assert_state(&repository, &server.id, 960, "available", Some(0));
    assert_state(&repository, &server.id, 961, "unknown", None);
}

#[test]
fn duplicate_timestamp_is_not_new_evidence_and_reverse_time_breaks_continuity() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let mut success = success();
    store(&repository, &server.id, &success, 0);
    store(&repository, &server.id, &success, 100);
    let previous = repository
        .latest_snapshot(&server.id)
        .expect("snapshot")
        .expect("success");
    success.gpus[0].gpu_utilization_percent = Some(90.0);
    store(&repository, &server.id, &success, 100);
    assert_state(&repository, &server.id, 100, "candidate", Some(0));
    assert_eq!(
        repository
            .latest_snapshot(&server.id)
            .expect("snapshot")
            .expect("success")
            .raw_json,
        previous.raw_json
    );
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    store(&repository, &server.id, &success, 50);
    assert_state(&repository, &server.id, 50, "unknown", None);
    store(&repository, &server.id, &success, 60);
    assert_state(&repository, &server.id, 60, "candidate", Some(60));
}

#[test]
fn invalid_success_timestamp_resets_observations_without_replacing_last_success() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let success = success();
    store(&repository, &server.id, &success, 0);
    store(&repository, &server.id, &success, 100);
    assert!(repository
        .store_success(&server.id, SUCCESS_JSON, &success, "invalid")
        .is_err());
    assert_state(&repository, &server.id, 100, "unknown", None);
    assert_eq!(
        repository
            .latest_snapshot(&server.id)
            .expect("snapshot")
            .expect("last valid success")
            .received_at,
        at(100)
    );
    store(&repository, &server.id, &success, 200);
    assert_state(&repository, &server.id, 200, "candidate", Some(200));
}

#[test]
fn disappeared_gpu_does_not_resume_old_sustain_when_it_returns() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let success = success();
    store(&repository, &server.id, &success, 0);
    store(&repository, &server.id, &success, 100);
    let mut missing = success.clone();
    missing.gpus.clear();
    store(&repository, &server.id, &missing, 200);
    assert_state(&repository, &server.id, 200, "unknown", None);
    store(&repository, &server.id, &success, 300);
    assert_state(&repository, &server.id, 300, "candidate", Some(300));
}

#[test]
fn uuid_survives_index_change_but_never_falls_back_to_replacement_at_same_index() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let mut success = success();
    store(&repository, &server.id, &success, 0);
    success.gpus[0].index = 7;
    store(&repository, &server.id, &success, 100);
    assert_identity(
        &repository,
        &server.id,
        GPU_UUID,
        7,
        100,
        "candidate",
        Some(0),
    );
    success.gpus[0].uuid = "GPU-replacement".to_string();
    store(&repository, &server.id, &success, 200);
    assert_identity(&repository, &server.id, GPU_UUID, 7, 200, "unknown", None);
    assert_identity(
        &repository,
        &server.id,
        "GPU-replacement",
        7,
        200,
        "candidate",
        Some(200),
    );
    assert_identity(&repository, &server.id, "", 7, 200, "unknown", None);
}

#[test]
fn absent_uuid_uses_index_identity_and_index_change_starts_new_condition() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let mut success = success();
    success.gpus[0].uuid.clear();
    store(&repository, &server.id, &success, 0);
    store(&repository, &server.id, &success, 100);
    assert_identity(&repository, &server.id, "", 0, 100, "candidate", Some(0));
    success.gpus[0].index = 1;
    store(&repository, &server.id, &success, 200);
    assert_identity(&repository, &server.id, "", 0, 200, "unknown", None);
    assert_identity(&repository, &server.id, "", 1, 200, "candidate", Some(200));
}

#[test]
fn disabling_or_changing_server_configuration_resets_observations() {
    for change in ["disable", "host", "interval"] {
        let temp = tempfile::tempdir().expect("temp dir");
        let repository = repository(&temp.path().join("availability.sqlite3"));
        let server = repository.save_server(input(30)).expect("server");
        let success = success();
        for seconds in [0, 100, 200, 300] {
            store(&repository, &server.id, &success, seconds);
        }
        if change == "disable" {
            repository
                .set_server_enabled(&server.id, false)
                .expect("disable");
            assert_state(&repository, &server.id, 300, "unknown", None);
            store(&repository, &server.id, &success, 310);
            assert_state(&repository, &server.id, 310, "unknown", None);
            repository
                .set_server_enabled(&server.id, true)
                .expect("enable");
        } else {
            let mut updated = input(30);
            updated.id = Some(server.id.clone());
            if change == "host" {
                updated.host = "changed.example.test".to_string();
            } else {
                updated.polling_interval_seconds = Some(60);
            }
            repository
                .save_server(updated)
                .expect("configuration change");
            assert_state(&repository, &server.id, 300, "unknown", None);
        }
        store(&repository, &server.id, &success, 320);
        assert_state(&repository, &server.id, 320, "candidate", Some(320));
    }
}

#[test]
fn scoped_and_global_reset_preserve_watch_settings_cooldown_armed_and_poll_schedule() {
    let temp = tempfile::tempdir().expect("temp dir");
    let path = temp.path().join("availability.sqlite3");
    let repository = repository(&path);
    let first = repository.save_server(input(30)).expect("first server");
    let mut second_input = input(60);
    second_input.host = "second.example.test".to_string();
    let second = repository.save_server(second_input).expect("second server");
    let rule = repository
        .save_gpu_available_watch(watch(&first.id))
        .expect("watch");
    let mut second_watch = watch(&second.id);
    second_watch.sustain_seconds = Some(300);
    let armed_rule = repository
        .save_gpu_available_watch(second_watch)
        .expect("armed watch");
    let success = success();
    store(&repository, &first.id, &success, 0);
    store(&repository, &second.id, &success, 0);
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("first event")
            .len(),
        1
    );
    let health_before =
        serde_json::to_value(repository.all_health().expect("health")).expect("health JSON");
    let rules_before = serde_json::to_value(repository.list_watch_rules(&first.id).expect("rules"))
        .expect("rules JSON");
    let due_before: Vec<_> = repository
        .due_servers()
        .expect("schedule")
        .into_iter()
        .map(|server| server.id)
        .collect();
    repository
        .reset_availability_observations(Some(&first.id))
        .expect("one server reset");
    assert_state(&repository, &first.id, 0, "unknown", None);
    assert_state(&repository, &second.id, 0, "candidate", Some(0));
    let connection = Connection::open(path).expect("inspection connection");
    let runtime: (Option<String>, Option<String>, Option<String>, i64) = connection.query_row(
        "SELECT condition_started_at, last_observed_at, last_triggered_at, armed FROM watch_runtime_state WHERE rule_id = ?1",
        [&rule.id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).expect("preserved runtime");
    assert_eq!(runtime, (None, None, Some(at(0)), 0));
    let untouched: (Option<String>, Option<String>, i64) = connection.query_row(
        "SELECT condition_started_at, last_observed_at, armed FROM watch_runtime_state WHERE rule_id = ?1",
        [&armed_rule.id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).expect("unrelated watch untouched");
    assert_eq!(untouched, (Some(at(0)), Some(at(0)), 1));
    assert_eq!(
        serde_json::to_value(repository.all_health().expect("health")).expect("health JSON"),
        health_before
    );
    assert_eq!(
        serde_json::to_value(repository.list_watch_rules(&first.id).expect("rules"))
            .expect("rules JSON"),
        rules_before
    );
    assert_eq!(
        repository
            .get_server(&first.id)
            .expect("server")
            .expect("server row")
            .polling_interval_seconds,
        30
    );
    assert_eq!(
        repository
            .due_servers()
            .expect("schedule")
            .into_iter()
            .map(|server| server.id)
            .collect::<Vec<_>>(),
        due_before
    );
    assert_eq!(
        repository
            .latest_snapshot(&first.id)
            .expect("snapshot")
            .expect("snapshot row")
            .received_at,
        at(0)
    );
    store(&repository, &first.id, &success, 60);
    assert_state(&repository, &first.id, 60, "candidate", Some(60));
    assert!(repository
        .consume_notification_outbox()
        .expect("disarmed outbox")
        .is_empty());
    repository
        .reset_availability_observations(None)
        .expect("global reset");
    assert_state(&repository, &first.id, 60, "unknown", None);
    assert_state(&repository, &second.id, 60, "unknown", None);
    let last_and_armed: (Option<String>, i64) = connection
        .query_row(
            "SELECT last_triggered_at, armed FROM watch_runtime_state WHERE rule_id = ?1",
            [&rule.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("global reset runtime");
    assert_eq!(last_and_armed, (Some(at(0)), 0));
    let armed_runtime: (Option<String>, Option<String>, Option<String>, i64) = connection.query_row(
        "SELECT condition_started_at, last_observed_at, last_triggered_at, armed FROM watch_runtime_state WHERE rule_id = ?1",
        [&armed_rule.id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).expect("global reset preserves armed watch");
    assert_eq!(armed_runtime, (None, None, None, 1));
}

#[test]
fn service_detail_projects_observed_availability_and_reset_without_busy_inference() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let mut payload = success();
    payload.gpus[0].process_count = 9;
    let raw = serde_json::to_string(&payload).expect("fixture JSON");
    let now = chrono::Utc::now();
    for seconds in [300, 200, 100, 0] {
        repository
            .store_success(
                &server.id,
                &raw,
                &payload,
                &(now - Duration::seconds(seconds)).to_rfc3339(),
            )
            .expect("observed success");
    }
    assert!(repository
        .list_watch_rules(&server.id)
        .expect("rules")
        .is_empty());
    let state = gpuwatcher_core::state::AppState::new(repository);
    let detail = gpuwatcher_core::service::get_server_detail(&state, server.id.clone())
        .expect("detail")
        .expect("server");
    assert!(detail.gpus[0].busy);
    assert_eq!(detail.gpus[0].availability.state, "available");
    assert!(detail.gpus[0].availability.condition_started_at.is_some());
    assert_eq!(
        serde_json::to_value(&detail).expect("DTO")["gpus"][0]["availability"]["state"],
        "available"
    );
    gpuwatcher_core::service::reset_availability_observations(&state, Some(server.id.clone()))
        .expect("reset");
    let reset = gpuwatcher_core::service::get_server_detail(&state, server.id)
        .expect("detail")
        .expect("server");
    assert_eq!(reset.gpus[0].availability.state, "unknown");
    assert_eq!(
        reset.gpus[0].memory_used_mib,
        detail.gpus[0].memory_used_mib
    );
}

#[test]
fn watch_memory_mib_json_matches_renderer_and_preserves_custom_value() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(30)).expect("server");
    let input: GpuAvailableWatchInput = serde_json::from_value(serde_json::json!({
        "serverId": server.id, "gpuUuid": GPU_UUID, "gpuIndex": 0, "enabled": true,
        "memoryThresholdMiB": 512
    }))
    .expect("renderer input");
    assert_eq!(input.memory_threshold_mib, Some(512));
    let rule = repository
        .save_gpu_available_watch(input)
        .expect("saved rule");
    assert_eq!(rule.memory_threshold_mib, 512);
    let json = serde_json::to_value(rule).expect("renderer DTO");
    assert_eq!(json["memoryThresholdMiB"], 512);
    assert!(json.get("memoryThresholdMib").is_none());
}

#[test]
fn unknown_after_notification_does_not_rearm_but_known_exit_does_after_cooldown() {
    let temp = tempfile::tempdir().expect("temp dir");
    let repository = repository(&temp.path().join("availability.sqlite3"));
    let server = repository.save_server(input(300)).expect("server");
    repository
        .save_gpu_available_watch(watch(&server.id))
        .expect("watch");
    let mut success = success();
    store(&repository, &server.id, &success, 0);
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("first event")
            .len(),
        1
    );
    success.gpus[0].memory_used_mib = None;
    store(&repository, &server.id, &success, 300);
    assert_state(&repository, &server.id, 300, "unknown", None);
    success.gpus[0].memory_used_mib = Some(0);
    for seconds in [600, 900, 1200] {
        store(&repository, &server.id, &success, seconds);
    }
    assert_state(&repository, &server.id, 1200, "available", Some(600));
    assert!(repository
        .consume_notification_outbox()
        .expect("unknown did not rearm")
        .is_empty());
    success.gpus[0].gpu_utilization_percent = Some(6.0);
    store(&repository, &server.id, &success, 1300);
    assert_state(&repository, &server.id, 1300, "in_use", None);
    success.gpus[0].gpu_utilization_percent = Some(0.0);
    store(&repository, &server.id, &success, 1400);
    assert_eq!(
        repository
            .consume_notification_outbox()
            .expect("known exit rearmed")
            .len(),
        1
    );
}
