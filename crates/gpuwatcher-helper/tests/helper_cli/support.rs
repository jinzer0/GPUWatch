use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

pub fn run_helper(input: &str) -> (ExitStatus, String, String) {
    run_helper_with_env(input, None)
}

pub fn run_helper_with_data_dir(input: &str, data_dir: &Path) -> (ExitStatus, String, String) {
    run_helper_with_env(input, Some(data_dir))
}

fn run_helper_with_env(input: &str, data_dir: Option<&Path>) -> (ExitStatus, String, String) {
    run_helper_with_extra_env(input, data_dir, &[])
}

pub fn run_helper_with_extra_env(
    input: &str,
    data_dir: Option<&Path>,
    extra_env: &[(String, OsString)],
) -> (ExitStatus, String, String) {
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

pub fn run_helper_with_extra_env_only(
    input: &str,
    extra_env: &[(String, OsString)],
) -> (ExitStatus, String, String) {
    run_helper_with_extra_env(input, None, extra_env)
}

pub fn parse_success(stdout: &str) -> Value {
    assert_eq!(stdout.lines().count(), 1);
    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], true, "{response:?}");
    response["data"].clone()
}

pub fn parse_error(stdout: &str) -> Value {
    assert_eq!(stdout.lines().count(), 1);
    let response: Value = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    assert_eq!(response["ok"], false, "{response:?}");
    response["error"].clone()
}

pub fn run_success(data_dir: &Path, action: &str, payload: Value) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) = run_helper_with_data_dir(&request.to_string(), data_dir);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_success(&stdout)
}

pub fn run_error(data_dir: &Path, action: &str, payload: Value) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) = run_helper_with_data_dir(&request.to_string(), data_dir);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_error(&stdout)
}

pub fn run_success_with_env(
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

pub fn run_success_with_home(action: &str, payload: Value, home: &Path) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let env = [("HOME".to_string(), home.as_os_str().to_os_string())];
    let (status, stdout, stderr) = run_helper_with_extra_env_only(&request.to_string(), &env);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_success(&stdout)
}

pub fn run_error_with_home(action: &str, payload: Value, home: &Path) -> Value {
    let request = json!({ "action": action, "payload": payload });
    let env = [("HOME".to_string(), home.as_os_str().to_os_string())];
    let (status, stdout, stderr) = run_helper_with_extra_env_only(&request.to_string(), &env);
    assert!(status.success());
    assert_eq!(stderr, "");
    parse_error(&stdout)
}

pub fn run_helper_value_with_env(
    data_dir: &Path,
    action: &str,
    payload: Value,
    extra_env: &[(String, OsString)],
) -> (ExitStatus, String, String, Value) {
    let request = json!({ "action": action, "payload": payload });
    let (status, stdout, stderr) =
        run_helper_with_extra_env(&request.to_string(), Some(data_dir), extra_env);
    let response = serde_json::from_str(stdout.trim_end()).expect("stdout json");
    (status, stdout, stderr, response)
}

pub fn temp_data_dir(test_name: &str) -> PathBuf {
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

pub fn sample_server_input() -> Value {
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

pub fn fake_ssh_path_env(test_name: &str, stdout: &str) -> (PathBuf, Vec<(String, OsString)>) {
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

pub fn no_install_stdout_with_optional_warnings() -> String {
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
