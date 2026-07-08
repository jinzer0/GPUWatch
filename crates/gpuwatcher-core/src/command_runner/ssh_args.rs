use crate::config::SSH_CONNECT_TIMEOUT_SECONDS;
use crate::models::Server;

pub(super) fn ssh_args(server: &Server, remote_args: Vec<String>) -> Vec<String> {
    let mut args = vec![
        "-o".to_string(),
        "BatchMode=yes".to_string(),
        "-o".to_string(),
        format!("ConnectTimeout={SSH_CONNECT_TIMEOUT_SECONDS}"),
        "-p".to_string(),
        server.port.to_string(),
    ];
    if let Some(key_path) = &server.ssh_key_path {
        if !key_path.trim().is_empty() {
            args.push("-i".to_string());
            args.push(key_path.clone());
        }
    }
    args.push("--".to_string());
    args.push(format!("{}@{}", server.username, server.host));
    args.extend(remote_args);
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_ssh_argv_with_options_destination_and_remote_args() {
        let args = ssh_args(
            &sample_server(),
            vec!["nvidia-smi".to_string(), "--query-gpu=name".to_string()],
        );
        assert_eq!(
            args,
            vec![
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=8",
                "-p",
                "2222",
                "-i",
                "/tmp/test-key",
                "--",
                "gpu-user@example.test",
                "nvidia-smi",
                "--query-gpu=name",
            ]
        );
    }

    #[test]
    fn remote_transport_only_uses_fixed_args_and_no_server_command_field() {
        let args = ssh_args(
            &sample_server(),
            vec!["fixed-command".to_string(), "fixed-arg".to_string()],
        );
        assert!(args.ends_with(&[
            "gpu-user@example.test".to_string(),
            "fixed-command".to_string(),
            "fixed-arg".to_string(),
        ]));
        assert!(!args.iter().any(|arg| arg.contains("legacy collector")));
        assert!(!args.iter().any(|arg| arg == "rm -rf /"));
    }

    #[test]
    fn builds_script_transport_after_destination() {
        let args = ssh_args(
            &sample_server(),
            vec!["sh".to_string(), "-s".to_string(), "--".to_string()],
        );
        assert!(args.ends_with(&[
            "gpu-user@example.test".to_string(),
            "sh".to_string(),
            "-s".to_string(),
            "--".to_string(),
        ]));
    }

    fn sample_server() -> Server {
        Server {
            id: "server-1".to_string(),
            name: "GPU Server".to_string(),
            host: "example.test".to_string(),
            port: 2222,
            username: "gpu-user".to_string(),
            ssh_key_path: Some("/tmp/test-key".to_string()),
            polling_interval_seconds: 30,
            enabled: true,
            config_revision: 1,
            created_at: "2026-06-02T00:00:00Z".to_string(),
            updated_at: "2026-06-02T00:00:00Z".to_string(),
        }
    }
}
