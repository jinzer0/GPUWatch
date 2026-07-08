use crate::error::AppError;
use crate::models::ConnectionTestResultDto;
use crate::state::AppState;

use super::collector::SnapshotCollector;
use super::results::error_result;

pub async fn test_connection(
    state: &AppState,
    id: String,
) -> Result<ConnectionTestResultDto, AppError> {
    let server = {
        let repository = state.repository()?;
        repository
            .get_server(&id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))?
    };
    match state.runner.collect_snapshot(state, &server).await {
        Ok((_raw_json, _success)) => Ok(ConnectionTestResultDto {
            ok: true,
            status: "online".to_string(),
            error_type: None,
            message: Some("no-install snapshot collection succeeded".to_string()),
        }),
        Err(error) => Ok(error_result(error)),
    }
}
