use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use crate::config::{
    COMMAND_TIMEOUT_SECONDS, SSH_CONNECT_TIMEOUT_SECONDS, STDERR_CAP_BYTES, STDOUT_CAP_BYTES,
};
use crate::error::AppError;
use crate::models::Server;

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Default)]
pub struct SystemSshRunner;

impl SystemSshRunner {
    pub async fn run_remote_argv<I, S>(
        &self,
        server: &Server,
        args: I,
    ) -> Result<CommandOutput, AppError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let remote_args = args
            .into_iter()
            .map(|arg| arg.as_ref().to_string())
            .collect::<Vec<_>>();
        self.run_ssh(server, remote_args, None).await
    }

    pub async fn run_remote_script(
        &self,
        server: &Server,
        script: &str,
    ) -> Result<CommandOutput, AppError> {
        self.run_ssh(
            server,
            vec!["sh".to_string(), "-s".to_string(), "--".to_string()],
            Some(script),
        )
        .await
    }

    async fn run_ssh(
        &self,
        server: &Server,
        remote_args: Vec<String>,
        stdin: Option<&str>,
    ) -> Result<CommandOutput, AppError> {
        let mut command = Command::new("ssh");
        command.args(ssh_args(server, remote_args));
        if stdin.is_some() {
            command.stdin(Stdio::piped());
        }
        command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let result = timeout(Duration::from_secs(COMMAND_TIMEOUT_SECONDS), async {
            let mut child = command.spawn().map_err(|err| {
                AppError::new("remote_command", "remote_command_failed", err.to_string())
            })?;
            if let Some(input) = stdin {
                let mut child_stdin = child.stdin.take().ok_or_else(|| {
                    AppError::new(
                        "remote_command",
                        "remote_command_failed",
                        "failed to open remote command stdin",
                    )
                })?;
                child_stdin
                    .write_all(input.as_bytes())
                    .await
                    .map_err(|err| {
                        AppError::new("remote_command", "remote_command_failed", err.to_string())
                    })?;
            }
            child.wait_with_output().await.map_err(|err| {
                AppError::new("remote_command", "remote_command_failed", err.to_string())
            })
        })
        .await;
        let output = match result {
            Ok(output) => output?,
            Err(_) => {
                return Err(AppError::new(
                    "remote_command",
                    "remote_command_timeout",
                    format!("remote collector command exceeded {COMMAND_TIMEOUT_SECONDS}s timeout"),
                ));
            }
        };

        let stdout = capped_utf8(&output.stdout, STDOUT_CAP_BYTES, "stdout")?;
        let stderr = capped_utf8(&output.stderr, STDERR_CAP_BYTES, "stderr")?;
        if !output.status.success() {
            return Err(classify_ssh_failure(output.status.code(), &stderr));
        }
        Ok(CommandOutput { stdout, stderr })
    }
}

fn ssh_args(server: &Server, remote_args: Vec<String>) -> Vec<String> {
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

fn capped_utf8(bytes: &[u8], cap: usize, stream: &str) -> Result<String, AppError> {
    if bytes.len() > cap {
        return Err(AppError::new(
            "remote_command",
            "remote_command_failed",
            format!("{stream} exceeded {cap} byte capture limit"),
        ));
    }
    Ok(String::from_utf8_lossy(bytes).to_string())
}

pub fn classify_ssh_failure(exit_code: Option<i32>, stderr: &str) -> AppError {
    let detail = stderr.trim();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("permission denied") || lower.contains("publickey") {
        return AppError::new(
            "transport_ssh",
            "ssh_auth_failed",
            safe_message(detail, "SSH authentication failed"),
        );
    }
    if lower.contains("host key verification failed")
        || lower.contains("remote host identification has changed")
    {
        return AppError::new(
            "transport_ssh",
            "ssh_host_key_failed",
            safe_message(detail, "SSH host key check failed"),
        );
    }
    if lower.contains("operation timed out") || lower.contains("connection timed out") {
        return AppError::new(
            "transport_ssh",
            "ssh_timeout",
            safe_message(detail, "SSH connection timed out"),
        );
    }
    if lower.contains("could not resolve hostname")
        || lower.contains("no route to host")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        return AppError::new(
            "transport_ssh",
            "ssh_unreachable",
            safe_message(detail, "SSH host is unreachable"),
        );
    }
    if exit_code == Some(127)
        || lower.contains("command not found")
        || lower.contains("gpuwatcher: not found")
    {
        return AppError::new(
            "remote_command",
            "collector_missing",
            safe_message(detail, "collector command was not found"),
        );
    }
    AppError::new(
        "remote_command",
        "remote_command_failed",
        safe_message(detail, "remote command failed"),
    )
}

fn safe_message(detail: &str, fallback: &str) -> String {
    if detail.is_empty() {
        fallback.to_string()
    } else {
        detail.lines().next().unwrap_or(fallback).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_auth_failure() {
        let err = classify_ssh_failure(Some(255), "Permission denied (publickey).");
        assert_eq!(err.layer, "transport_ssh");
        assert_eq!(err.error_type, "ssh_auth_failed");
    }

    #[test]
    fn maps_unreachable_failure() {
        let err = classify_ssh_failure(Some(255), "Could not resolve hostname missing-host");
        assert_eq!(err.error_type, "ssh_unreachable");
    }

    #[test]
    fn maps_host_key_failure() {
        let err = classify_ssh_failure(Some(255), "Host key verification failed.");
        assert_eq!(err.layer, "transport_ssh");
        assert_eq!(err.error_type, "ssh_host_key_failed");
    }

    #[test]
    fn maps_collector_missing() {
        let err = classify_ssh_failure(Some(127), "bash: gpuwatcher: command not found");
        assert_eq!(err.layer, "remote_command");
        assert_eq!(err.error_type, "collector_missing");
    }

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
