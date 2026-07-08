use crate::error::AppError;
use crate::models::{LatestSnapshot, Server, ServerDetailDto, ServerHealth};

use super::mappers::{gpu_card, health_dto};
use super::snapshot::parse_success_snapshot;

pub fn build_server_detail(
    server: Server,
    health: Option<ServerHealth>,
    snapshot: Option<LatestSnapshot>,
) -> Result<ServerDetailDto, AppError> {
    let parsed = match snapshot.as_ref() {
        Some(value) => Some(parse_success_snapshot(value)?),
        None => None,
    };
    let gpus = parsed
        .as_ref()
        .map(|payload| payload.gpus.iter().map(gpu_card).collect())
        .unwrap_or_default();
    Ok(ServerDetailDto {
        server,
        health: health_dto(health.as_ref()),
        collector_hostname: parsed
            .as_ref()
            .and_then(|payload| payload.server.hostname.clone()),
        driver_version: parsed
            .as_ref()
            .and_then(|payload| payload.server.driver_version.clone()),
        cuda_version: parsed
            .as_ref()
            .and_then(|payload| payload.server.cuda_version.clone()),
        received_at: snapshot.map(|value| value.received_at),
        warnings: parsed.map(|payload| payload.warnings).unwrap_or_default(),
        gpus,
    })
}
