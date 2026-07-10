use serde_json::{json, Value};

use gpuwatcher_core::error::AppError;

pub(crate) const ERROR_LAYER: &str = "helper_contract";

pub(crate) fn ok_response(data: Value) -> Value {
    json!({ "ok": true, "data": data })
}

pub(crate) fn error_response(error_type: impl Into<String>, message: impl Into<String>) -> Value {
    json!({
        "ok": false,
        "error": {
            "layer": ERROR_LAYER,
            "type": error_type.into(),
            "message": message.into(),
        }
    })
}

pub(crate) fn app_error_response(error: AppError) -> Value {
    json!({
        "ok": false,
        "error": {
            "layer": error.layer,
            "type": error.error_type,
            "message": error.message,
        }
    })
}

pub(crate) fn helper_payload_error(message: impl Into<String>) -> AppError {
    AppError::new(ERROR_LAYER, "invalid_payload", message)
}

pub(crate) fn to_value<T: serde::Serialize>(data: T) -> Result<Value, AppError> {
    serde_json::to_value(data).map_err(|err| {
        AppError::new(
            ERROR_LAYER,
            "response_serialization_failed",
            format!("helper response data could not be serialized: {err}"),
        )
    })
}
