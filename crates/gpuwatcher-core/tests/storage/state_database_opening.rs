use std::path::{Path, PathBuf};
use std::sync::Mutex;

use gpuwatcher_core::models::ParsedCollectorPayload;
use gpuwatcher_core::protocol::parse_collector_json;
use gpuwatcher_core::repository::now_string;
use gpuwatcher_core::state::{
    backup_existing_database_before_migration, database_path_from_data_dir, default_database_path,
    AppState,
};

use super::fixtures::{
    assert_storage_error, backup_paths, create_legacy_database, isolated_server_input,
    sqlite_columns, MULTI_SUCCESS_JSON,
};

static ENV_MUTEX: Mutex<()> = Mutex::new(());

#[test]
fn state_database_path_from_data_dir_preserves_gpuwatcher_sqlite_path() {
    let path = database_path_from_data_dir("/tmp/Application Support");

    assert_eq!(
        path,
        PathBuf::from("/tmp/Application Support")
            .join("GPUWatcher")
            .join("gpuwatcher.sqlite3")
    );
}

#[test]
fn state_default_database_path_uses_test_data_dir_override_when_present() {
    let _guard = ENV_MUTEX.lock().expect("env mutex");
    let temp_dir = tempfile::tempdir().expect("temp dir");
    std::env::set_var("GPUWATCHER_TEST_DATA_DIR", temp_dir.path());
    let path = default_database_path().expect("default database path");
    std::env::remove_var("GPUWATCHER_TEST_DATA_DIR");

    assert_eq!(path, database_path_from_data_dir(temp_dir.path()));
}

#[cfg(target_os = "macos")]
#[test]
fn state_default_database_path_uses_macos_application_support_gpuwatcher_path() {
    let _guard = ENV_MUTEX.lock().expect("env mutex");
    std::env::remove_var("GPUWATCHER_TEST_DATA_DIR");
    let path = default_database_path().expect("default database path");

    assert!(path.ends_with(Path::new("GPUWatcher").join("gpuwatcher.sqlite3")));
    assert!(path
        .to_string_lossy()
        .contains("Library/Application Support/GPUWatcher/gpuwatcher.sqlite3"));
}

#[test]
fn state_backup_existing_database_before_migration_skips_missing_database() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = temp_dir.path().join("gpuwatcher.sqlite3");

    let backup = backup_existing_database_before_migration(&path).expect("backup guard");

    assert!(backup.is_none());
}

#[test]
fn state_backup_existing_database_before_migration_copies_existing_database() {
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
fn state_open_in_data_dir_creates_parent_and_database_at_redirected_canonical_path() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = database_path_from_data_dir(temp_dir.path());

    let state = AppState::open_in_data_dir(temp_dir.path()).expect("open isolated state");
    drop(state);

    assert!(path.exists());
    assert_eq!(backup_paths(path.parent().expect("db parent")).len(), 0);
}

#[test]
fn state_repeated_current_database_opens_do_not_create_backups() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = database_path_from_data_dir(temp_dir.path());

    AppState::open_in_data_dir(temp_dir.path()).expect("first open");
    AppState::open_in_data_dir(temp_dir.path()).expect("second open");

    assert_eq!(backup_paths(path.parent().expect("db parent")).len(), 0);
}

#[test]
fn state_legacy_collector_command_migration_creates_one_backup_and_preserves_server() {
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
fn state_redirected_existing_database_reads_servers_snapshots_and_history() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let received_at = now_string();
    let ParsedCollectorPayload::Success(success) =
        parse_collector_json(MULTI_SUCCESS_JSON).expect("fixture")
    else {
        panic!("expected success fixture")
    };

    let state = AppState::open_in_data_dir(temp_dir.path()).expect("open isolated state");
    let server_id = {
        let repository = state.repository.lock().expect("repository mutex");
        let server = repository
            .save_server(isolated_server_input())
            .expect("save server");
        repository
            .store_success(&server.id, MULTI_SUCCESS_JSON, &success, &received_at)
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
        MULTI_SUCCESS_JSON
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
fn state_corrupt_redirected_database_returns_structured_storage_error() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = database_path_from_data_dir(temp_dir.path());
    std::fs::create_dir_all(path.parent().expect("db parent")).expect("create db parent");
    std::fs::write(&path, b"not a sqlite database").expect("write corrupt db");

    let error = match AppState::open_in_data_dir(temp_dir.path()) {
        Ok(_) => panic!("corrupt db unexpectedly opened"),
        Err(error) => error,
    };

    assert_storage_error(error);
}

#[test]
fn state_redirected_database_path_without_writable_parent_returns_structured_storage_error() {
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

#[test]
fn state_open_database_path_returns_storage_error_for_corrupt_sqlite_file() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let path = temp_dir.path().join("gpuwatcher.sqlite3");
    std::fs::write(&path, b"not a sqlite database").expect("write corrupt db");

    let error = match AppState::open_database_path(&path) {
        Ok(_) => panic!("corrupt db unexpectedly opened"),
        Err(error) => error,
    };

    assert_storage_error(error);
}
