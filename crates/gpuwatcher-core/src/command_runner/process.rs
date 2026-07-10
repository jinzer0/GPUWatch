use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use super::caps::capped_utf8;
use super::classification::classify_ssh_failure;
use super::ssh_args::ssh_args;
use super::CommandOutput;
use crate::config::{COMMAND_TIMEOUT_SECONDS, STDERR_CAP_BYTES, STDOUT_CAP_BYTES};
use crate::error::AppError;
use crate::models::Server;

pub(super) async fn run_ssh(
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
