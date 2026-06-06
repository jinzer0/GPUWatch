use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::Value;

fn run_helper(input: &str) -> (std::process::ExitStatus, String, String) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_gpuwatcher-helper"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn helper");

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
