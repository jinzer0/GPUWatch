use serde_json::Value;

use crate::contract::{parse_action, HelperAction};
use crate::response::error_response;

pub(crate) struct ParsedRequest {
    pub(crate) action: HelperAction,
    pub(crate) payload: serde_json::Map<String, Value>,
}

pub(crate) fn parse_request(input: &str) -> Result<ParsedRequest, Value> {
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

    let action_text = object
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| {
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

    let payload = object
        .get("payload")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| {
            error_response(
                "invalid_payload",
                "helper request payload must be an object",
            )
        })?;

    Ok(ParsedRequest { action, payload })
}
