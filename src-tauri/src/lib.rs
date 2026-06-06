pub use gpuwatcher_core::{
    command_runner, config, error, models, no_install_collector, nvidia_smi, protocol, read_model,
    repository, scheduler, service, state, AppState,
};

pub mod commands;

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
            commands::list_gpu_history,
            commands::test_connection,
            commands::refresh_server
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GPUWatcher app");
}
