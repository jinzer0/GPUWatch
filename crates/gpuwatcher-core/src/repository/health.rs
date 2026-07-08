use std::collections::HashMap;

use rusqlite::{params, OptionalExtension};

use super::mappers::read_health;
use super::Repository;
use crate::error::AppError;
use crate::models::ServerHealth;

impl Repository {
    pub fn all_health(&self) -> Result<HashMap<String, ServerHealth>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT server_id, status, last_error_type, last_error_message,
                    last_poll_started_at, last_poll_finished_at, last_success_at
             FROM server_health",
        )?;
        let rows = statement.query_map([], read_health)?;
        let mut result = HashMap::new();
        for row in rows {
            let health = row?;
            result.insert(health.server_id.clone(), health);
        }
        Ok(result)
    }

    pub fn get_health(&self, id: &str) -> Result<Option<ServerHealth>, AppError> {
        self.conn
            .query_row(
                "SELECT server_id, status, last_error_type, last_error_message,
                        last_poll_started_at, last_poll_finished_at, last_success_at
                 FROM server_health WHERE server_id = ?1",
                params![id],
                read_health,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn mark_poll_started(&self, id: &str, started_at: &str) -> Result<(), AppError> {
        let changed = self.conn.execute(
            "UPDATE server_health
             SET status = 'polling', last_poll_started_at = ?1, last_poll_finished_at = NULL
             WHERE server_id = ?2",
            params![started_at, id],
        )?;
        if changed == 0 {
            return Err(AppError::new(
                "storage_app",
                "server_not_found",
                "server not found",
            ));
        }
        Ok(())
    }

    pub(super) fn ensure_health(&self, id: &str, status: &str) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO server_health(server_id, status) VALUES(?1, ?2)
             ON CONFLICT(server_id) DO UPDATE SET status = excluded.status",
            params![id, status],
        )?;
        Ok(())
    }
}
