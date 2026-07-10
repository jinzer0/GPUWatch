use crate::error::AppError;
use crate::models::ConnectionTestResultDto;

pub(super) fn discarded_result() -> ConnectionTestResultDto {
    ConnectionTestResultDto {
        ok: false,
        status: "stale_discarded".to_string(),
        error_type: Some("stale_poll_discarded".to_string()),
        message: Some("poll result was discarded because server configuration changed".to_string()),
    }
}

pub(super) fn error_result(error: AppError) -> ConnectionTestResultDto {
    ConnectionTestResultDto {
        ok: false,
        status: if error.layer == "transport_ssh" {
            "offline"
        } else {
            "error"
        }
        .to_string(),
        error_type: Some(error.error_type),
        message: Some(error.message),
    }
}
