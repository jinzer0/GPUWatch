use std::fs;
use std::path::Path;

use gpuwatcher_core::ssh_config_import::import_ssh_config_from_home;

fn write_ssh_config(home: &Path, body: &str) {
    let ssh_dir = home.join(".ssh");
    fs::create_dir_all(&ssh_dir).expect("create .ssh");
    fs::write(ssh_dir.join("config"), body).expect("write ssh config");
}

#[test]
fn ssh_config_import_maps_alias_to_server_draft_when_host_has_direct_fields() {
    let temp_dir = tempfile::tempdir().expect("temp home");
    write_ssh_config(
        temp_dir.path(),
        r#"
Host gpu-lab
  HostName gpu01.internal.example
  User alice
  Port 2202
  IdentityFile ~/.ssh/id_gpuwatcher
"#,
    );

    let result = import_ssh_config_from_home(temp_dir.path()).expect("import ssh config");

    assert!(result.warnings.is_empty());
    assert_eq!(result.candidates.len(), 1);
    let candidate = &result.candidates[0];
    assert_eq!(candidate.host_alias, "gpu-lab");
    assert_eq!(
        candidate.hostname.as_deref(),
        Some("gpu01.internal.example")
    );
    assert_eq!(candidate.draft.name, "gpu-lab");
    assert_eq!(candidate.draft.host, "gpu-lab");
    assert_eq!(candidate.draft.username, "alice");
    assert_eq!(candidate.draft.port, 2202);
    assert_eq!(
        candidate.draft.ssh_key_path.as_deref(),
        Some("~/.ssh/id_gpuwatcher")
    );
    assert_eq!(candidate.draft.polling_interval_seconds, None);
    assert!(candidate.draft.enabled);
    assert!(candidate.warnings.is_empty());
}

#[test]
fn ssh_config_import_reads_bounded_include_under_ssh_directory() {
    let temp_dir = tempfile::tempdir().expect("temp home");
    let ssh_dir = temp_dir.path().join(".ssh");
    fs::create_dir_all(&ssh_dir).expect("create .ssh");
    fs::write(
        ssh_dir.join("config"),
        "Include conf.d/gpu.conf\nHost base\n  User base-user\n",
    )
    .expect("write root config");
    fs::create_dir_all(ssh_dir.join("conf.d")).expect("create include dir");
    fs::write(
        ssh_dir.join("conf.d/gpu.conf"),
        "Host included-gpu\n  HostName included.example\n  User carol\n  Port 2222\n",
    )
    .expect("write included config");

    let result = import_ssh_config_from_home(temp_dir.path()).expect("import ssh config");

    let aliases = result
        .candidates
        .iter()
        .map(|candidate| candidate.host_alias.as_str())
        .collect::<Vec<_>>();
    assert_eq!(aliases, vec!["included-gpu", "base"]);
    assert!(result
        .candidates
        .iter()
        .any(|candidate| candidate.hostname.as_deref() == Some("included.example")));
}

#[test]
fn ssh_config_import_excludes_wildcard_only_hosts_and_warns_for_unsupported_directives() {
    let temp_dir = tempfile::tempdir().expect("temp home");
    write_ssh_config(
        temp_dir.path(),
        r#"
Host *
  User default-user
Host gpu-* ?ast
  User wildcard-user
Host gpu-safe
  User dana
  ProxyJump bastion.internal
  ProxyCommand sh -c 'cat ~/.ssh/id_ed25519 && echo secret=abc'
"#,
    );

    let result = import_ssh_config_from_home(temp_dir.path()).expect("import ssh config");

    assert_eq!(result.candidates.len(), 1);
    let candidate = &result.candidates[0];
    assert_eq!(candidate.host_alias, "gpu-safe");
    assert_eq!(candidate.draft.username, "dana");
    assert!(candidate
        .warnings
        .iter()
        .any(|warning| warning == "Host gpu-safe uses unsupported ProxyJump; import ignores it"));
    assert!(
        candidate
            .warnings
            .iter()
            .any(|warning| warning
                == "Host gpu-safe uses unsupported ProxyCommand; import ignores it")
    );
    assert!(!candidate
        .warnings
        .iter()
        .any(|warning| warning.contains("id_ed25519") || warning.contains("abc")));
}

#[test]
fn ssh_config_import_warns_and_defaults_bad_port_without_dropping_candidate() {
    let temp_dir = tempfile::tempdir().expect("temp home");
    write_ssh_config(
        temp_dir.path(),
        "Host bad-port\n  User erin\n  Port 70000\n",
    );

    let result = import_ssh_config_from_home(temp_dir.path()).expect("import ssh config");

    assert_eq!(result.candidates.len(), 1);
    let candidate = &result.candidates[0];
    assert_eq!(candidate.draft.port, 22);
    assert_eq!(
        candidate.warnings,
        vec!["Host bad-port has invalid Port; using 22".to_string()]
    );
}

#[test]
fn ssh_config_import_bounds_recursive_include_loops() {
    let temp_dir = tempfile::tempdir().expect("temp home");
    let ssh_dir = temp_dir.path().join(".ssh");
    fs::create_dir_all(&ssh_dir).expect("create .ssh");
    fs::write(ssh_dir.join("config"), "Include loop.conf\n").expect("write root config");
    fs::write(
        ssh_dir.join("loop.conf"),
        "Include loop.conf\nHost looped\n  User frank\n",
    )
    .expect("write loop config");

    let result = import_ssh_config_from_home(temp_dir.path()).expect("import ssh config");

    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.candidates[0].host_alias, "looped");
    assert!(result
        .warnings
        .iter()
        .any(|warning| warning.contains("Include skipped because it was already read")));
}
