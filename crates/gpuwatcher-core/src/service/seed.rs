use crate::error::AppError;
use crate::models::{ParsedCollectorPayload, ServerInput, ServerOverviewDto};
use crate::protocol::parse_collector_json;
use crate::repository::now_string;
use crate::state::AppState;

use super::queries::list_overview;

pub fn seed_demo_data(state: &AppState) -> Result<Vec<ServerOverviewDto>, AppError> {
    let raw = include_str!("../../../../fixtures/protocol/v1/success_multi_gpu.json");
    {
        let repository = state.repository()?;
        let mut servers = repository.list_servers()?;
        let server = if let Some(existing) = servers.pop() {
            existing
        } else {
            repository.save_server(ServerInput {
                id: None,
                name: "Demo GPU Server".to_string(),
                host: "demo.local".to_string(),
                port: 22,
                username: "demo".to_string(),
                ssh_key_path: None,
                polling_interval_seconds: None,
                enabled: true,
            })?
        };
        let ParsedCollectorPayload::Success(success) = parse_collector_json(raw)? else {
            return Err(AppError::new(
                "protocol",
                "protocol_schema_invalid",
                "demo fixture was not a success envelope",
            ));
        };
        repository.store_success(&server.id, raw, &success, &now_string())?;
    }
    list_overview(state)
}
