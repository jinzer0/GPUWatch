use chrono::Utc;

use super::Repository;
use crate::error::AppError;
use crate::models::Server;

impl Repository {
    pub fn poll_target_current(
        &self,
        id: &str,
        expected_config_revision: i64,
    ) -> Result<bool, AppError> {
        Ok(self.get_server(id)?.is_some_and(|server| {
            server.enabled && server.config_revision == expected_config_revision
        }))
    }

    pub fn due_servers(&self) -> Result<Vec<Server>, AppError> {
        let servers = self.list_servers()?;
        let health = self.all_health()?;
        let now = Utc::now();
        Ok(servers
            .into_iter()
            .filter(|server| {
                if !server.enabled {
                    return false;
                }
                let Some(row) = health.get(&server.id) else {
                    return true;
                };
                if row.status == "polling" {
                    return false;
                }
                let reference = row
                    .last_poll_finished_at
                    .as_ref()
                    .or(row.last_poll_started_at.as_ref())
                    .or(row.last_success_at.as_ref());
                let Some(reference) = reference else {
                    return true;
                };
                let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(reference) else {
                    return true;
                };
                let interval_seconds = if row.status == "offline" {
                    server.polling_interval_seconds.saturating_mul(2)
                } else {
                    server.polling_interval_seconds
                };
                now.signed_duration_since(parsed.with_timezone(&Utc))
                    .num_seconds()
                    >= interval_seconds
            })
            .collect())
    }
}
