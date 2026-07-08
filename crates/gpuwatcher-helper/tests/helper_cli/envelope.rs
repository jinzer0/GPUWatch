use serde_json::Value;

use super::support::{parse_success, run_helper};

#[test]
fn cli_success_stdout_is_exactly_one_json_envelope_line_and_stderr_empty() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    assert_eq!(stdout.lines().count(), 1);
    assert!(stdout.ends_with('\n'));

    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], true);
    assert!(response.get("data").is_some());
    assert!(response.get("error").is_none());
}

#[test]
fn cli_response_string_preserves_stdout_helper_envelope_contract() {
    let (status, stdout, stderr) = run_helper(r#"{"action":"health","payload":{}}"#);

    assert!(status.success());
    assert_eq!(stderr, "");
    let data = parse_success(&stdout);
    assert_eq!(data["helperName"], "gpuwatcher-helper");
    assert_eq!(data["status"], "ok");
}
