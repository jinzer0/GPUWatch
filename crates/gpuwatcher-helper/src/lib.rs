pub mod contract;

use serde_json::{json, Value};

use contract::{HelperAction, HELPER_CONTRACT};

pub use gpuwatcher_core as core;

const ERROR_LAYER: &str = "helper_contract";

pub fn handle_request(input: &str) -> Value {
    match parse_request(input) {
        Ok((HelperAction::Health, _payload)) => ok_response(health_data()),
        Ok((action, _payload)) => error_response(
            "helper_action_deferred",
            format!(
                "helper action '{}' is allowlisted but not implemented in this task",
                action_name(action)
            ),
        ),
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
    fn allowlisted_non_health_action_is_deferred() {
        let response = handle_request(r#"{"action":"list_servers","payload":{}}"#);

        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["type"], "helper_action_deferred");
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
