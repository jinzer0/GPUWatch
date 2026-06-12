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
        Self::open_database_path(&path)
    }

    pub fn open_in_data_dir(data_dir: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = database_path_from_data_dir(data_dir);
        Self::open_database_path(&path)
    }

    pub fn open_database_path(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(storage_io_error)?;
        }
        backup_database_if_destructive_migration_needed(path)?;
        let repository = Repository::open(&path)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ParsedCollectorPayload, ServerInput};
    use crate::protocol::parse_collector_json;
    use rusqlite::Connection;
    use std::sync::Mutex;

    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    fn backup_paths(parent: &Path) -> Vec<PathBuf> {
        let mut paths = std::fs::read_dir(parent)
            .expect("read db parent")
            .filter_map(|entry| {
                let path = entry.expect("dir entry").path();
                let is_backup = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("gpuwatcher.sqlite3.backup-"));
                is_backup.then_some(path)
            })
            .collect::<Vec<_>>();
        paths.sort();
        paths
    }

    fn sample_server_input() -> ServerInput {
        ServerInput {
            id: None,
            name: "Isolated GPU".to_string(),
            host: "isolated.example.test".to_string(),
            port: 22,
            username: "gpuwatch".to_string(),
            ssh_key_path: None,
            polling_interval_seconds: Some(30),
            enabled: true,
        }
    }

    fn create_legacy_database(path: &Path) {
        let parent = path.parent().expect("db parent");
        std::fs::create_dir_all(parent).expect("create db parent");
        let conn = Connection::open(path).expect("legacy connection");
        conn.execute_batch(
            "
            CREATE TABLE schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            );
            INSERT INTO schema_migrations(version, applied_at) VALUES(1, '2026-06-01T00:00:00Z');
            CREATE TABLE servers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              host TEXT NOT NULL,
              port INTEGER NOT NULL,
              username TEXT NOT NULL,
              ssh_key_path TEXT,
              collector_command TEXT NOT NULL,
              polling_interval_seconds INTEGER NOT NULL,
              enabled INTEGER NOT NULL,
              config_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE server_health (
              server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
              status TEXT NOT NULL,
              last_error_type TEXT,
              last_error_message TEXT,
              last_poll_started_at TEXT,
              last_poll_finished_at TEXT,
              last_success_at TEXT
            );
            CREATE TABLE latest_snapshots (
              server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
              protocol_version INTEGER NOT NULL,
              schema_version INTEGER NOT NULL,
              received_at TEXT NOT NULL,
              raw_json TEXT NOT NULL,
              parsed_summary_json TEXT NOT NULL
            );
            INSERT INTO servers(id, name, host, port, username, ssh_key_path, collector_command,
                                polling_interval_seconds, enabled, config_revision, created_at, updated_at)
            VALUES('server-1', 'Legacy Lab', 'legacy.example.test', 2222, 'legacy-user', NULL,
                   'gpuwatcher --json', 45, 1, 7, '2026-06-01T00:00:00Z', '2026-06-01T00:05:00Z');
            INSERT INTO server_health(server_id, status) VALUES('server-1', 'idle');
            ",
        )
        .expect("legacy schema");
    }

    fn sqlite_columns(path: &Path, table: &str) -> Vec<String> {
        let conn = Connection::open(path).expect("sqlite connection");
        let mut statement = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .expect("table info");
        statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("column names")
    }

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

    #[test]
    fn default_database_path_uses_test_data_dir_override_when_present() {
        let _guard = ENV_MUTEX.lock().expect("env mutex");
        let temp_dir = tempfile::tempdir().expect("temp dir");
        std::env::set_var("GPUWATCHER_TEST_DATA_DIR", temp_dir.path());
        let path = default_database_path().expect("default database path");
        std::env::remove_var("GPUWATCHER_TEST_DATA_DIR");

        assert_eq!(path, database_path_from_data_dir(temp_dir.path()));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn default_database_path_uses_macos_application_support_gpuwatcher_path() {
        let _guard = ENV_MUTEX.lock().expect("env mutex");
        std::env::remove_var("GPUWATCHER_TEST_DATA_DIR");
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

    #[test]
    fn open_in_data_dir_creates_parent_and_database_at_redirected_canonical_path() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = database_path_from_data_dir(temp_dir.path());

        let state = AppState::open_in_data_dir(temp_dir.path()).expect("open isolated state");
        drop(state);

        assert!(path.exists());
        assert_eq!(backup_paths(path.parent().expect("db parent")).len(), 0);
    }

    #[test]
    fn repeated_current_database_opens_do_not_create_backups() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = database_path_from_data_dir(temp_dir.path());

        AppState::open_in_data_dir(temp_dir.path()).expect("first open");
        AppState::open_in_data_dir(temp_dir.path()).expect("second open");

        assert_eq!(backup_paths(path.parent().expect("db parent")).len(), 0);
    }

    #[test]
    fn legacy_collector_command_migration_creates_one_backup_and_preserves_server() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = database_path_from_data_dir(temp_dir.path());
        create_legacy_database(&path);

        let state = AppState::open_in_data_dir(temp_dir.path()).expect("migrate legacy state");
        let servers = state
            .repository
            .lock()
            .expect("repository mutex")
            .list_servers()
            .expect("servers");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "Legacy Lab");
        assert_eq!(servers[0].host, "legacy.example.test");
        assert_eq!(servers[0].polling_interval_seconds, 45);
        drop(state);

        let parent = path.parent().expect("db parent");
        let backups = backup_paths(parent);
        assert_eq!(backups.len(), 1);
        assert!(sqlite_columns(&backups[0], "servers").contains(&"collector_command".to_string()));
        assert!(!sqlite_columns(&path, "servers").contains(&"collector_command".to_string()));

        AppState::open_in_data_dir(temp_dir.path()).expect("reopen migrated state");
        assert_eq!(backup_paths(parent).len(), 1);
    }

    #[test]
    fn redirected_existing_database_reads_servers_snapshots_and_history() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let raw = include_str!("../../../fixtures/protocol/v1/success_multi_gpu.json");
        let received_at = now_string();
        let ParsedCollectorPayload::Success(success) = parse_collector_json(raw).expect("fixture")
        else {
            panic!("expected success fixture")
        };

        let state = AppState::open_in_data_dir(temp_dir.path()).expect("open isolated state");
        let server_id = {
            let repository = state.repository.lock().expect("repository mutex");
            let server = repository
                .save_server(sample_server_input())
                .expect("save server");
            repository
                .store_success(&server.id, raw, &success, &received_at)
                .expect("store success");
            server.id
        };
        drop(state);

        let state = AppState::open_in_data_dir(temp_dir.path()).expect("reopen isolated state");
        let repository = state.repository.lock().expect("repository mutex");
        assert_eq!(repository.list_servers().expect("servers").len(), 1);
        assert_eq!(
            repository
                .latest_snapshot(&server_id)
                .expect("latest")
                .expect("latest snapshot")
                .raw_json,
            raw
        );
        assert_eq!(
            repository
                .list_gpu_history(&server_id, None, None, "24h", &received_at)
                .expect("history")
                .series
                .len(),
            2
        );
    }

    #[test]
    fn corrupt_redirected_database_returns_structured_storage_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = database_path_from_data_dir(temp_dir.path());
        std::fs::create_dir_all(path.parent().expect("db parent")).expect("create db parent");
        std::fs::write(&path, b"not a sqlite database").expect("write corrupt db");

        let error = match AppState::open_in_data_dir(temp_dir.path()) {
            Ok(_) => panic!("corrupt db unexpectedly opened"),
            Err(error) => error,
        };

        assert_eq!(error.layer, "storage_app");
        assert_eq!(error.error_type, "sqlite_error");
    }

    #[test]
    fn redirected_database_path_without_writable_parent_returns_structured_storage_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let blocked_parent = temp_dir.path().join("GPUWatcher");
        std::fs::write(&blocked_parent, b"not a directory").expect("blocking file");

        let error = match AppState::open_in_data_dir(temp_dir.path()) {
            Ok(_) => panic!("database unexpectedly opened through blocked parent"),
            Err(error) => error,
        };

        assert_eq!(error.layer, "storage_app");
        assert_eq!(error.error_type, "sqlite_error");
        assert!(
            error.message.contains("Not a directory")
                || error.message.contains("not a directory")
                || error.message.contains("File exists")
                || error.message.contains("file exists"),
            "unexpected storage error message: {}",
            error.message
        );
    }
}
