pub mod command_runner;
pub mod commands;
pub mod config;
pub mod error;
pub mod models;
pub mod no_install_collector;
pub mod nvidia_smi;
pub mod protocol;
pub mod read_model;
pub mod repository;
pub mod scheduler;
pub mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = state::AppState::open_default()?;
            app.manage(state);
            commands::start_polling_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::initialize_app,
            commands::list_servers,
            commands::save_server,
            commands::delete_server,
            commands::set_server_enabled,
            commands::seed_demo_data,
            commands::list_overview,
            commands::get_server_detail,
            commands::list_processes,
            commands::test_connection,
            commands::refresh_server
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GPUWatcher app");
}
