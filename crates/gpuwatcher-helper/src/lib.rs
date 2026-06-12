pub mod contract;

use serde_json::{json, Value};

use contract::{HelperAction, HELPER_CONTRACT};
use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::ServerInput;
use gpuwatcher_core::{service, state::AppState};

pub use gpuwatcher_core as core;

const ERROR_LAYER: &str = "helper_contract";

pub fn handle_request(input: &str) -> Value {
    match parse_request(input) {
        Ok((action, payload)) => dispatch_action(action, payload),
        Err(error) => error,
    }
}

pub fn handle_request_to_string(input: &str) -> String {
    serde_json::to_string(&handle_request(input)).expect("helper response serialization failed")
}

fn parse_request(input: &str) -> Result<(HelperAction, serde_json::Map<String, Value>), Value> {
    let request: Value = serde_json::from_str(input).map_err(|err| {
        error_response(
            "malformed_json",
            format!("helper request must be valid JSON: {err}"),
        )
    })?;

    let object = request.as_object().ok_or_else(|| {
        error_response(
            "invalid_request",
            "helper request must be a JSON object with action and payload",
        )
    })?;

    let action_value = object.get("action").ok_or_else(|| {
        error_response(
            "invalid_request",
            "helper request action must be an allowlisted string",
        )
    })?;
    let action_text = action_value.as_str().ok_or_else(|| {
        error_response(
            "invalid_request",
            "helper request action must be an allowlisted string",
        )
    })?;
    let action = parse_action(action_text).ok_or_else(|| {
        error_response(
            "unknown_action",
            format!("helper action '{action_text}' is not allowlisted"),
        )
    })?;

    let payload_value = object.get("payload").ok_or_else(|| {
        error_response(
            "invalid_payload",
            "helper request payload must be an object",
        )
    })?;
    let payload = payload_value.as_object().cloned().ok_or_else(|| {
        error_response(
            "invalid_payload",
            "helper request payload must be an object",
        )
    })?;

    Ok((action, payload))
}

fn dispatch_action(action: HelperAction, payload: serde_json::Map<String, Value>) -> Value {
    match action {
        HelperAction::Health => ok_response(health_data()),
        HelperAction::InitializeApp => with_state(payload, |state, payload| {
            expect_empty_payload(&payload)?;
            service::initialize_app(&state).and_then(to_value)
        }),
        HelperAction::ListOverview => with_state(payload, |state, payload| {
            expect_empty_payload(&payload)?;
            service::list_overview(&state).and_then(to_value)
        }),
        HelperAction::ListServers => with_state(payload, |state, payload| {
            expect_empty_payload(&payload)?;
            service::list_servers(&state).and_then(to_value)
        }),
        HelperAction::SaveServer => with_state(payload, |state, payload| {
            let request: SaveServerPayload = payload_from_map(payload)?;
            service::save_server(&state, request.input).and_then(to_value)
        }),
        HelperAction::DeleteServer => with_state(payload, |state, payload| {
            let request: IdPayload = payload_from_map(payload)?;
            service::delete_server(&state, request.id).map(|()| Value::Null)
        }),
        HelperAction::SetServerEnabled => with_state(payload, |state, payload| {
            let request: SetServerEnabledPayload = payload_from_map(payload)?;
            service::set_server_enabled(&state, request.id, request.enabled).and_then(to_value)
        }),
        HelperAction::SeedDemoData => with_state(payload, |state, payload| {
            expect_empty_payload(&payload)?;
            service::seed_demo_data(&state).and_then(to_value)
        }),
        HelperAction::GetServerDetail => with_state(payload, |state, payload| {
            let request: IdPayload = payload_from_map(payload)?;
            service::get_server_detail(&state, request.id).and_then(to_value)
        }),
        HelperAction::ListGpuHistory => with_state(payload, |state, payload| {
            let request: ListGpuHistoryPayload = payload_from_map(payload)?;
            service::list_gpu_history(
                &state,
                request.server_id,
                request.gpu_index,
                request.gpu_uuid,
                request.range,
            )
            .and_then(to_value)
        }),
        HelperAction::ListProcesses => with_state(payload, |state, payload| {
            expect_empty_payload(&payload)?;
            service::list_processes(&state).and_then(to_value)
        }),
        HelperAction::TestConnection => with_state(payload, |state, payload| {
            let request: IdPayload = payload_from_map(payload)?;
            block_on_service(service::test_connection(&state, request.id)).and_then(to_value)
        }),
        HelperAction::RefreshServer => with_state(payload, |state, payload| {
            let request: IdPayload = payload_from_map(payload)?;
            block_on_service(service::refresh_server(&state, request.id)).and_then(to_value)
        }),
        HelperAction::PollDueServers => error_response(
            "main_scheduler_owned",
            "poll_due_servers is main-only; Electron main owns due polling through list_servers, get_server_detail, and refresh_server",
        ),
    }
}

fn with_state(
    payload: serde_json::Map<String, Value>,
    action: impl FnOnce(AppState, serde_json::Map<String, Value>) -> Result<Value, AppError>,
) -> Value {
    let state = match AppState::open_default() {
        Ok(state) => state,
        Err(error) => return app_error_response(error),
    };

    match action(state, payload) {
        Ok(data) => ok_response(data),
        Err(error) => app_error_response(error),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveServerPayload {
    input: ServerInput,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdPayload {
    id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetServerEnabledPayload {
    id: String,
    enabled: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListGpuHistoryPayload {
    server_id: String,
    gpu_index: Option<i64>,
    gpu_uuid: Option<String>,
    range: String,
}

fn expect_empty_payload(payload: &serde_json::Map<String, Value>) -> Result<(), AppError> {
    if payload.is_empty() {
        Ok(())
    } else {
        Err(helper_payload_error(
            "payload must be empty for this helper action",
        ))
    }
}

fn payload_from_map<T>(payload: serde_json::Map<String, Value>) -> Result<T, AppError>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(Value::Object(payload)).map_err(|err| {
        helper_payload_error(format!("helper request payload has invalid shape: {err}"))
    })
}

fn helper_payload_error(message: impl Into<String>) -> AppError {
    AppError::new(ERROR_LAYER, "invalid_payload", message)
}

fn block_on_service<T>(
    future: impl std::future::Future<Output = Result<T, AppError>>,
) -> Result<T, AppError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| AppError::new(ERROR_LAYER, "runtime_unavailable", err.to_string()))?;
    runtime.block_on(future)
}

fn to_value<T: serde::Serialize>(data: T) -> Result<Value, AppError> {
    serde_json::to_value(data).map_err(|err| {
        AppError::new(
            ERROR_LAYER,
            "response_serialization_failed",
            format!("helper response data could not be serialized: {err}"),
        )
    })
}

fn parse_action(action: &str) -> Option<HelperAction> {
    HELPER_CONTRACT
        .iter()
        .map(|entry| entry.helper_action)
        .find(|candidate| action_name(*candidate) == action)
}

fn action_name(action: HelperAction) -> &'static str {
    match action {
        HelperAction::InitializeApp => "initialize_app",
        HelperAction::ListOverview => "list_overview",
        HelperAction::ListServers => "list_servers",
        HelperAction::SaveServer => "save_server",
        HelperAction::DeleteServer => "delete_server",
        HelperAction::SetServerEnabled => "set_server_enabled",
        HelperAction::SeedDemoData => "seed_demo_data",
        HelperAction::GetServerDetail => "get_server_detail",
        HelperAction::ListGpuHistory => "list_gpu_history",
        HelperAction::ListProcesses => "list_processes",
        HelperAction::TestConnection => "test_connection",
        HelperAction::RefreshServer => "refresh_server",
        HelperAction::PollDueServers => "poll_due_servers",
        HelperAction::Health => "health",
    }
}

fn health_data() -> Value {
    let actions: Vec<&'static str> = HELPER_CONTRACT
        .iter()
        .map(|entry| action_name(entry.helper_action))
        .collect();

    json!({
        "helperName": env!("CARGO_PKG_NAME"),
        "helperVersion": env!("CARGO_PKG_VERSION"),
        "status": "ok",
        "requestEnvelope": contract::REQUEST_ENVELOPE,
        "responseEnvelope": contract::RESPONSE_ENVELOPE,
        "allowlistedActions": actions,
    })
}

fn ok_response(data: Value) -> Value {
    json!({ "ok": true, "data": data })
}

fn error_response(error_type: impl Into<String>, message: impl Into<String>) -> Value {
    json!({
        "ok": false,
        "error": {
            "layer": ERROR_LAYER,
            "type": error_type.into(),
            "message": message.into(),
        }
    })
}

fn app_error_response(error: AppError) -> Value {
    json!({
        "ok": false,
        "error": {
            "layer": error.layer,
            "type": error.error_type,
            "message": error.message,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_returns_ok_response_with_allowlisted_actions() {
        let response = handle_request(r#"{"action":"health","payload":{}}"#);

        assert_eq!(response["ok"], true);
        assert_eq!(response["data"]["status"], "ok");
        assert_eq!(response["data"]["helperName"], "gpuwatcher-helper");
        assert!(response["data"]["allowlistedActions"]
            .as_array()
            .expect("actions array")
            .contains(&json!("health")));
    }

    #[test]
    fn unknown_action_returns_structured_error() {
        let response = handle_request(r#"{"action":"rm -rf /","payload":{}}"#);

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["layer"], ERROR_LAYER);
        assert_eq!(response["error"]["type"], "unknown_action");
    }

    #[test]
    fn non_object_payload_returns_structured_error() {
        let response = handle_request(r#"{"action":"health","payload":null}"#);

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["type"], "invalid_payload");
    }

    #[test]
    fn poll_due_servers_returns_main_scheduler_owned_error() {
        let response =
            handle_request(r#"{"action":"poll_due_servers","payload":{"id":"server-1"}}"#);

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["type"], "main_scheduler_owned");
        assert!(response["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("Electron main owns due polling"));
    }

    #[test]
    fn poll_due_servers_is_main_only_without_preload_method() {
        let main_only: Vec<_> = contract::HELPER_CONTRACT
            .iter()
            .filter(|entry| entry.visibility == contract::ActionVisibility::MainOnly)
            .collect();

        assert_eq!(main_only.len(), 1);
        assert_eq!(main_only[0].helper_action, HelperAction::PollDueServers);
        assert_eq!(main_only[0].electron_preload_method, None);
        assert_eq!(
            main_only[0].polling_overlap_key,
            contract::PollingOverlapKey::ElectronMainScheduler
        );
    }

    #[test]
    fn malformed_json_returns_structured_error() {
        let response = handle_request("not json");

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["type"], "malformed_json");
    }

    #[test]
    fn response_string_preserves_the_stdout_helper_envelope_contract() {
        let response = handle_request_to_string(r#"{"action":"health","payload":{}}"#);
        let parsed: Value = serde_json::from_str(&response).expect("response json");

        assert_eq!(parsed["ok"], true);
        assert!(parsed.get("data").is_some());
    }

    #[test]
    fn missing_payload_returns_structured_error_envelope() {
        let response = handle_request(r#"{"action":"health"}"#);

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["layer"], ERROR_LAYER);
        assert_eq!(response["error"]["type"], "invalid_payload");
    }
}
