use serde_json::{json, Value};

use super::support::{parse_error, run_helper};

#[test]
fn cli_health_writes_one_json_response_to_stdout() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);

    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], true);
    assert_eq!(response["data"]["status"], "ok");
    assert!(response["data"]["allowlistedActions"]
        .as_array()
        .expect("actions")
        .contains(&json!("health")));
}

#[test]
fn cli_unknown_action_writes_structured_error_without_stderr() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"uname -a","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);

    let error = parse_error(&stdout);
    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "unknown_action");
}
