mod caps;
mod classification;
mod process;
mod ssh_args;

use crate::error::AppError;
use crate::models::Server;

pub use classification::classify_ssh_failure;

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
        process::run_ssh(server, remote_args, None).await
    }

    pub async fn run_remote_script(
        &self,
        server: &Server,
        script: &str,
    ) -> Result<CommandOutput, AppError> {
        process::run_ssh(
            server,
            vec!["sh".to_string(), "-s".to_string(), "--".to_string()],
            Some(script),
        )
        .await
    }
}
