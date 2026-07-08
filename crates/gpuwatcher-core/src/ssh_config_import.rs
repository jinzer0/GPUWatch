use std::path::Path;

use crate::error::AppError;
use crate::models::SshConfigImportResult;

mod parser;

pub fn import_ssh_config() -> Result<SshConfigImportResult, AppError> {
    let home = dirs::home_dir().ok_or_else(|| {
        AppError::new(
            "storage_app",
            "ssh_config_home_unavailable",
            "home directory unavailable for SSH config import",
        )
    })?;
    import_ssh_config_from_home(&home)
}

pub fn import_ssh_config_from_home(home: &Path) -> Result<SshConfigImportResult, AppError> {
    parser::import_from_home(home)
}
