use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;

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
            std::fs::create_dir_all(parent).map_err(storage_io_error)?;
        }
        backup_existing_database_before_migration(&path)?;
        let repository = Repository::open(&path)?;
        repository.migrate()?;
        repository.prune_gpu_history(&now_string())?;
        Ok(Self::new(repository))
    }
}

pub fn default_database_path() -> Result<PathBuf, AppError> {
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
    data_dir.as_ref().join("GPUWatcher").join("gpuwatcher.sqlite3")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_path_from_data_dir_preserves_gpuwatcher_sqlite_path() {
        let path = database_path_from_data_dir("/tmp/Application Support");
        assert_eq!(
            path,
            PathBuf::from("/tmp/Application Support")
                .join("GPUWatcher")
                .join("gpuwatcher.sqlite3")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn default_database_path_uses_macos_application_support_gpuwatcher_path() {
        let path = default_database_path().expect("default database path");
        assert!(path.ends_with(Path::new("GPUWatcher").join("gpuwatcher.sqlite3")));
        assert!(path
            .to_string_lossy()
            .contains("Library/Application Support/GPUWatcher/gpuwatcher.sqlite3"));
    }

    #[test]
    fn backup_existing_database_before_migration_skips_missing_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = temp_dir.path().join("gpuwatcher.sqlite3");

        let backup = backup_existing_database_before_migration(&path).expect("backup guard");

        assert!(backup.is_none());
    }

    #[test]
    fn backup_existing_database_before_migration_copies_existing_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = temp_dir.path().join("gpuwatcher.sqlite3");
        std::fs::write(&path, b"existing-db").expect("write database");

        let backup = backup_existing_database_before_migration(&path)
            .expect("backup guard")
            .expect("backup path");

        assert!(backup.exists());
        let backup_file_name = backup
            .file_name()
            .and_then(|name| name.to_str())
            .expect("backup file name");
        assert!(backup_file_name.starts_with("gpuwatcher.sqlite3.backup-"));
        assert_eq!(std::fs::read(&backup).expect("read backup"), b"existing-db");
        assert_eq!(std::fs::read(&path).expect("read original"), b"existing-db");
    }
}
