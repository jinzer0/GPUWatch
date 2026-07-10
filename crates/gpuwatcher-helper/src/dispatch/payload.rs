use serde_json::Value;

use gpuwatcher_core::error::AppError;
use gpuwatcher_core::models::ServerInput;

use crate::response::{helper_payload_error, ERROR_LAYER};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SaveServerPayload {
    pub(super) input: ServerInput,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IdPayload {
    pub(super) id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SetServerEnabledPayload {
    pub(super) id: String,
    pub(super) enabled: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ListGpuHistoryPayload {
    pub(super) server_id: String,
    pub(super) gpu_index: Option<i64>,
    pub(super) gpu_uuid: Option<String>,
    pub(super) range: String,
}

pub(super) fn expect_empty_payload(
    payload: &serde_json::Map<String, Value>,
) -> Result<(), AppError> {
    if payload.is_empty() {
        Ok(())
    } else {
        Err(helper_payload_error(
            "payload must be empty for this helper action",
        ))
    }
}

pub(super) fn payload_from_map<T>(payload: serde_json::Map<String, Value>) -> Result<T, AppError>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(Value::Object(payload)).map_err(|err| {
        helper_payload_error(format!("helper request payload has invalid shape: {err}"))
    })
}

pub(super) fn block_on_service<T>(
    future: impl std::future::Future<Output = Result<T, AppError>>,
) -> Result<T, AppError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| AppError::new(ERROR_LAYER, "runtime_unavailable", err.to_string()))?;
    runtime.block_on(future)
}
