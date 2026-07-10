use serde_json::Value;

use gpuwatcher_core::error::AppError;
use gpuwatcher_core::{service, ssh_config_import};

use crate::contract::HelperAction;
use crate::dispatch::payload::{
    block_on_service, expect_empty_payload, payload_from_map, IdPayload, ListGpuHistoryPayload,
    SaveServerPayload, SetServerEnabledPayload,
};
use crate::dispatch::with_state;
use crate::response::{app_error_response, ok_response, to_value};

pub(super) fn dispatch_empty_payload_action(
    action: HelperAction,
    payload: serde_json::Map<String, Value>,
) -> Value {
    with_state(payload, |state, payload| {
        expect_empty_payload(&payload)?;
        match action {
            HelperAction::InitializeApp => service::initialize_app(&state).and_then(to_value),
            HelperAction::ListOverview => service::list_overview(&state).and_then(to_value),
            HelperAction::ListServers => service::list_servers(&state).and_then(to_value),
            HelperAction::SeedDemoData => service::seed_demo_data(&state).and_then(to_value),
            HelperAction::ListProcesses => service::list_processes(&state).and_then(to_value),
            HelperAction::Health
            | HelperAction::ListSshConfigHosts
            | HelperAction::SaveServer
            | HelperAction::DeleteServer
            | HelperAction::SetServerEnabled
            | HelperAction::GetServerDetail
            | HelperAction::ListGpuHistory
            | HelperAction::TestConnection
            | HelperAction::RefreshServer
            | HelperAction::PollDueServers => Err(dispatch_route_error(action)),
        }
    })
}

pub(super) fn dispatch_ssh_config_import(payload: serde_json::Map<String, Value>) -> Value {
    expect_empty_payload(&payload)
        .and_then(|()| ssh_config_import::import_ssh_config().and_then(to_value))
        .map_or_else(app_error_response, ok_response)
}

pub(super) fn dispatch_stateful_payload_action(
    action: HelperAction,
    payload: serde_json::Map<String, Value>,
) -> Value {
    with_state(payload, |state, payload| match action {
        HelperAction::SaveServer => {
            let request: SaveServerPayload = payload_from_map(payload)?;
            service::save_server(&state, request.input).and_then(to_value)
        }
        HelperAction::DeleteServer => {
            let request: IdPayload = payload_from_map(payload)?;
            service::delete_server(&state, request.id).map(|()| Value::Null)
        }
        HelperAction::SetServerEnabled => {
            let request: SetServerEnabledPayload = payload_from_map(payload)?;
            service::set_server_enabled(&state, request.id, request.enabled).and_then(to_value)
        }
        HelperAction::GetServerDetail => {
            let request: IdPayload = payload_from_map(payload)?;
            service::get_server_detail(&state, request.id).and_then(to_value)
        }
        HelperAction::ListGpuHistory => {
            let request: ListGpuHistoryPayload = payload_from_map(payload)?;
            service::list_gpu_history(
                &state,
                request.server_id,
                request.gpu_index,
                request.gpu_uuid,
                request.range,
            )
            .and_then(to_value)
        }
        HelperAction::TestConnection => {
            let request: IdPayload = payload_from_map(payload)?;
            block_on_service(service::test_connection(&state, request.id)).and_then(to_value)
        }
        HelperAction::RefreshServer => {
            let request: IdPayload = payload_from_map(payload)?;
            block_on_service(service::refresh_server(&state, request.id)).and_then(to_value)
        }
        HelperAction::InitializeApp
        | HelperAction::ListOverview
        | HelperAction::ListServers
        | HelperAction::ListSshConfigHosts
        | HelperAction::SeedDemoData
        | HelperAction::ListProcesses
        | HelperAction::PollDueServers
        | HelperAction::Health => Err(dispatch_route_error(action)),
    })
}

fn dispatch_route_error(action: HelperAction) -> AppError {
    AppError::new(
        "helper_contract",
        "dispatch_route_error",
        format!("helper action {action:?} was routed to the wrong dispatch group"),
    )
}
