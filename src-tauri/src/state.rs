use std::path::PathBuf;
use std::sync::Mutex;

use crate::command_runner::SystemSshRunner;
use crate::error::AppError;
use crate::repository::{now_string, Repository};
use crate::scheduler::PollScheduler;

pub struct AppState {
    pub repository: Mutex<Repository>,
    pub runner: SystemSshRunner,
    pub scheduler: PollScheduler,
}

impl AppState {
    pub fn new(repository: Repository) -> Self {
        Self {
            repository: Mutex::new(repository),
            runner: SystemSshRunner,
            scheduler: PollScheduler::default_limit(),
        }
    }

    pub fn open_default() -> Result<Self, AppError> {
        let path = default_database_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| AppError::new("storage_app", "sqlite_error", err.to_string()))?;
        }
        let repository = Repository::open(&path)?;
        repository.migrate()?;
        repository.prune_gpu_history(&now_string())?;
        Ok(Self::new(repository))
    }
}

fn default_database_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_dir().ok_or_else(|| {
        AppError::new(
            "storage_app",
            "sqlite_error",
            "could not resolve local data directory",
        )
    })?;
    Ok(base.join("GPUWatcher").join("gpuwatcher.sqlite3"))
}
