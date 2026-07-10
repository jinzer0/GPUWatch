mod envelope;
mod script;
mod sections;

#[cfg(test)]
mod tests;

use crate::command_runner::SystemSshRunner;
use crate::error::AppError;
use crate::models::{Server, SuccessEnvelope};

pub use envelope::build_no_install_snapshot_from_output;
use script::NO_INSTALL_COLLECTOR_SCRIPT;

pub async fn collect_no_install_snapshot(
    runner: &SystemSshRunner,
    server: &Server,
) -> Result<(String, SuccessEnvelope), AppError> {
    let output = runner
        .run_remote_script(server, NO_INSTALL_COLLECTOR_SCRIPT)
        .await?;
    build_no_install_snapshot_from_output(server, &output)
}
