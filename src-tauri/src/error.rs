use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error, Serialize, PartialEq, Eq)]
#[error("{layer}:{error_type}: {message}")]
pub struct AppError {
    pub layer: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

impl AppError {
    pub fn new(
        layer: impl Into<String>,
        error_type: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            layer: layer.into(),
            error_type: error_type.into(),
            message: message.into(),
        }
    }

    pub fn protocol(error_type: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new("protocol", error_type, message)
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self::new("storage_app", "sqlite_error", message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::storage(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::protocol("protocol_schema_invalid", value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::new("unknown", "io_error", value.to_string())
    }
}
