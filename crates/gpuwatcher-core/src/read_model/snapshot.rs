use crate::error::AppError;
use crate::models::{LatestSnapshot, ParsedCollectorPayload, SuccessEnvelope};
use crate::protocol::parse_collector_json;

pub(super) fn parse_success_snapshot(
    snapshot: &LatestSnapshot,
) -> Result<SuccessEnvelope, AppError> {
    match parse_collector_json(&snapshot.raw_json)? {
        ParsedCollectorPayload::Success(success) => Ok(success),
        ParsedCollectorPayload::CollectorError(error) => Err(AppError::new(
            "collector",
            error.error.error_type,
            error.error.message,
        )),
    }
}
