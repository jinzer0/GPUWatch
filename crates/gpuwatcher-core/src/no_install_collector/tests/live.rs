use crate::command_runner::SystemSshRunner;
use crate::models::Server;
use crate::no_install_collector::{collect_no_install_snapshot, NO_INSTALL_COLLECTOR_SCRIPT};

#[test]
fn remote_script_filters_pid_candidates_before_ps() {
    assert!(NO_INSTALL_COLLECTOR_SCRIPT.contains("$2 ~ /^[0-9]+$/"));
    assert!(NO_INSTALL_COLLECTOR_SCRIPT.contains("*[!0-9,]*|''"));
    assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("ps -p \"$compute_apps_output\""));
}

fn live_tml_server_config() -> Option<Server> {
    let raw_target = std::env::var("GPUWATCHER_LIVE_SSH_TARGET").ok()?;
    let target = raw_target.trim();
    if target != "tml-server" {
        return None;
    }

    let (configured_user, host) = target
        .split_once('@')
        .map(|(user, host)| (Some(user.to_string()), host.to_string()))
        .unwrap_or((None, target.to_string()));
    let ssh_config = std::process::Command::new("ssh")
        .args(["-G", &host])
        .output()
        .expect("ssh -G should run for live target");
    assert!(
        ssh_config.status.success(),
        "ssh -G failed for {host}: {}",
        String::from_utf8_lossy(&ssh_config.stderr)
    );
    let config = String::from_utf8_lossy(&ssh_config.stdout);
    let username = configured_user
        .or_else(|| ssh_config_value(&config, "user"))
        .expect("live SSH target must resolve a user");
    let port = ssh_config_value(&config, "port")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(22);

    Some(Server {
        id: "live-tml-server".to_string(),
        name: "Live tml-server".to_string(),
        host,
        port,
        username,
        ssh_key_path: None,
        polling_interval_seconds: 30,
        enabled: true,
        config_revision: 1,
        created_at: "2026-06-02T00:00:00Z".to_string(),
        updated_at: "2026-06-02T00:00:00Z".to_string(),
    })
}

fn ssh_config_value(config: &str, key: &str) -> Option<String> {
    config.lines().find_map(|line| {
        let (line_key, value) = line.split_once(' ')?;
        (line_key == key).then(|| value.trim().to_string())
    })
}

#[tokio::test]
#[ignore]
async fn live_tml_server() {
    let Some(server) = live_tml_server_config() else {
        eprintln!("skipping: GPUWATCHER_LIVE_SSH_TARGET must be exactly tml-server");
        return;
    };
    assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("gpuwatcher"));
    assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("nvitop"));
    assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("python"));

    let runner = SystemSshRunner;
    let (raw_json, envelope) = collect_no_install_snapshot(&runner, &server)
        .await
        .expect("live no-install collection should succeed");
    let gpu = envelope
        .gpus
        .iter()
        .find(|gpu| gpu.uuid == "GPU-4ce68a8b-2e61-7620-a3d0-ed8714a21d30")
        .expect("live tml-server should expose the expected RTX 5090 UUID");

    assert_eq!(gpu.name, "NVIDIA GeForce RTX 5090");
    assert_eq!(
        envelope.server.driver_version.as_deref(),
        Some("570.211.01")
    );
    assert!(!envelope.gpus.is_empty());
    println!(
        "live_tml_server host={} user={} port={} hostname={:?} gpu_count={} gpu_name={} uuid={} driver={:?} warnings={:?}",
        server.host,
        server.username,
        server.port,
        envelope.server.hostname,
        envelope.gpus.len(),
        gpu.name,
        gpu.uuid,
        envelope.server.driver_version,
        envelope.warnings
    );
    println!("live_tml_server raw_json={raw_json}");
}

#[tokio::test]
#[ignore]
async fn live_tml_server_processes() {
    let Some(server) = live_tml_server_config() else {
        eprintln!("skipping: GPUWATCHER_LIVE_SSH_TARGET must be exactly tml-server");
        return;
    };

    let runner = SystemSshRunner;
    let (_, envelope) = collect_no_install_snapshot(&runner, &server)
        .await
        .expect("live process collection should degrade without snapshot failure");
    let process_count: i64 = envelope.gpus.iter().map(|gpu| gpu.process_count).sum();
    let process_rows: usize = envelope.gpus.iter().map(|gpu| gpu.processes.len()).sum();

    assert!(!envelope.gpus.is_empty());
    assert!(envelope.gpus.iter().all(|gpu| gpu.process_count >= 0));
    assert_eq!(process_count as usize, process_rows);
    println!(
        "live_tml_server_processes gpu_count={} process_count={} warnings={:?}",
        envelope.gpus.len(),
        process_count,
        envelope.warnings
    );
    for gpu in &envelope.gpus {
        println!(
            "live_tml_server_processes gpu={} uuid={} processes={:?}",
            gpu.index, gpu.uuid, gpu.processes
        );
    }
}
