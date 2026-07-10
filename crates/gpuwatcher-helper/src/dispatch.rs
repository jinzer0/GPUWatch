use serde_json::Value;

use crate::contract::HelperAction;
use crate::response::{app_error_response, error_response, ok_response};

mod health;
mod payload;
mod server_actions;

pub(crate) fn dispatch_action(
    action: HelperAction,
    payload: serde_json::Map<String, Value>,
) -> Value {
    match action {
        HelperAction::Health => ok_response(health::health_data()),
        HelperAction::InitializeApp
        | HelperAction::ListOverview
        | HelperAction::ListServers
        | HelperAction::SeedDemoData
        | HelperAction::ListProcesses => server_actions::dispatch_empty_payload_action(action, payload),
        HelperAction::ListSshConfigHosts => server_actions::dispatch_ssh_config_import(payload),
        HelperAction::SaveServer
        | HelperAction::DeleteServer
        | HelperAction::SetServerEnabled
        | HelperAction::GetServerDetail
        | HelperAction::ListGpuHistory
        | HelperAction::TestConnection
        | HelperAction::RefreshServer => server_actions::dispatch_stateful_payload_action(action, payload),
        HelperAction::PollDueServers => error_response(
            "main_scheduler_owned",
            "poll_due_servers is main-only; Electron main owns due polling through list_servers, get_server_detail, and refresh_server",
        ),
    }
}

fn with_state(
    payload: serde_json::Map<String, Value>,
    action: impl FnOnce(
        gpuwatcher_core::state::AppState,
        serde_json::Map<String, Value>,
    ) -> Result<Value, gpuwatcher_core::error::AppError>,
) -> Value {
    let state = match gpuwatcher_core::state::AppState::open_default() {
        Ok(state) => state,
        Err(error) => return app_error_response(error),
    };

    match action(state, payload) {
        Ok(data) => ok_response(data),
        Err(error) => app_error_response(error),
    }
}
