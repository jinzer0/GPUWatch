use serde_json::{json, Value};

use super::support::{parse_error, run_error, run_helper, temp_data_dir};

#[test]
fn cli_malformed_json_returns_structured_error_envelope() {
    let (status, stdout, stderr) = run_helper("not json");

    assert!(status.success());
    assert_eq!(stderr, "");
    let error = parse_error(&stdout);
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "malformed_json");
}

#[test]
fn cli_missing_payload_returns_structured_error_envelope() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health"}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    let error = parse_error(&stdout);
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "invalid_payload");
}

#[test]
fn cli_non_object_payload_returns_structured_error_envelope() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health","payload":null}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    let error = parse_error(&stdout);
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "invalid_payload");
}

#[test]
fn cli_invalid_path_payload_returns_helper_contract_error() {
    let data_dir = temp_data_dir("invalid-path-payload");

    let error = run_error(
        &data_dir,
        "list_ssh_config_hosts",
        json!({ "path": "/tmp/config" }),
    );

    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "invalid_payload");
}

#[test]
fn cli_error_response_preserves_the_helper_envelope_shape() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"rm -rf /","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);
    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], false);
    assert!(response.get("error").is_some());
    assert!(response.get("data").is_none());
}
