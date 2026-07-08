use serde_json::json;

use super::support::{run_error_with_home, run_success_with_home, temp_data_dir};

#[test]
fn list_ssh_config_hosts_reads_default_home_without_stderr_data() {
    let home = temp_data_dir("ssh-config-home");
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir).expect("create .ssh");
    std::fs::write(
        ssh_dir.join("config"),
        "Host gpu-lab\n  HostName gpu01.internal.example\n  User alice\n  Port 2202\n  IdentityFile ~/.ssh/id_gpuwatcher\n",
    )
    .expect("write ssh config");

    let imported = run_success_with_home("list_ssh_config_hosts", json!({}), &home);

    assert_eq!(imported["warnings"], json!([]));
    assert_eq!(imported["candidates"][0]["hostAlias"], "gpu-lab");
    assert_eq!(
        imported["candidates"][0]["hostname"],
        "gpu01.internal.example"
    );
    assert_eq!(imported["candidates"][0]["draft"]["host"], "gpu-lab");
    assert_eq!(
        imported["candidates"][0]["draft"]["sshKeyPath"],
        "~/.ssh/id_gpuwatcher"
    );
}

#[test]
fn list_ssh_config_hosts_rejects_import_path_payload_in_v1() {
    let home = temp_data_dir("ssh-config-path-rejected");

    let error = run_error_with_home(
        "list_ssh_config_hosts",
        json!({ "path": "/tmp/config" }),
        &home,
    );

    assert_eq!(error["layer"], "helper_contract");
    assert_eq!(error["type"], "invalid_payload");
}
