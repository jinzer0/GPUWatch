use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::error::AppError;
use crate::repository::{now_string, Repository};

use super::AppState;

impl AppState {
    pub fn open_in_data_dir(data_dir: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = database_path_from_data_dir(data_dir);
        Self::open_database_path(&path)
    }

    pub fn open_database_path(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(storage_io_error)?;
        }
        backup_database_if_destructive_migration_needed(path)?;
        let repository = Repository::open(path)?;
        repository.migrate()?;
        repository.prune_gpu_history(&now_string())?;
        Ok(Self::new(repository))
    }
}

pub fn default_database_path() -> Result<PathBuf, AppError> {
    if let Some(data_dir) = test_data_dir_override() {
        return Ok(database_path_from_data_dir(data_dir));
    }

    let base = dirs::data_dir().ok_or_else(|| {
        AppError::new(
            "storage_app",
            "sqlite_error",
            "could not resolve local data directory",
        )
    })?;
    Ok(database_path_from_data_dir(base))
}

pub fn database_path_from_data_dir(data_dir: impl AsRef<Path>) -> PathBuf {
    data_dir
        .as_ref()
        .join("GPUWatcher")
        .join("gpuwatcher.sqlite3")
}

pub fn test_data_dir_override() -> Option<PathBuf> {
    std::env::var_os("GPUWATCHER_TEST_DATA_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn backup_database_if_destructive_migration_needed(
    path: &Path,
) -> Result<Option<PathBuf>, AppError> {
    if Repository::path_requires_legacy_collector_command_drop(path)? {
        backup_existing_database_before_migration(path)
    } else {
        Ok(None)
    }
}

pub fn backup_existing_database_before_migration(path: &Path) -> Result<Option<PathBuf>, AppError> {
    if !path.exists() {
        return Ok(None);
    }

    let parent = path.parent().ok_or_else(|| {
        AppError::new(
            "storage_app",
            "sqlite_error",
            format!("database path has no parent: {}", path.display()),
        )
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("gpuwatcher.sqlite3");
    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.9fZ");
    let backup_path = parent.join(format!("{file_name}.backup-{timestamp}"));
    std::fs::copy(path, &backup_path).map_err(storage_io_error)?;
    Ok(Some(backup_path))
}

fn storage_io_error(err: std::io::Error) -> AppError {
    AppError::new("storage_app", "sqlite_error", err.to_string())
}
