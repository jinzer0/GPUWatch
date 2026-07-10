use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::mappers::read_server;
use super::{bool_to_i64, now_string, Repository};
use crate::config::DEFAULT_POLLING_INTERVAL_SECONDS;
use crate::error::AppError;
use crate::models::{Server, ServerInput};

impl Repository {
    pub fn list_servers(&self) -> Result<Vec<Server>, AppError> {
        let mut statement = self.conn.prepare(
            "SELECT id, name, host, port, username, ssh_key_path,
                    polling_interval_seconds, enabled, config_revision, created_at, updated_at
             FROM servers ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], read_server)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn get_server(&self, id: &str) -> Result<Option<Server>, AppError> {
        self.conn
            .query_row(
                "SELECT id, name, host, port, username, ssh_key_path,
                        polling_interval_seconds, enabled, config_revision, created_at, updated_at
                 FROM servers WHERE id = ?1",
                params![id],
                read_server,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn save_server(&self, input: ServerInput) -> Result<Server, AppError> {
        let now = now_string();
        let normalized = normalize_server_input(input)?;
        let NormalizedServerInput {
            id,
            name,
            host,
            port,
            username,
            ssh_key_path,
            polling_interval_seconds,
            enabled,
        } = normalized;

        if let Some(id) = id {
            let current = self.get_server(&id)?.ok_or_else(|| {
                AppError::new("storage_app", "server_not_found", "server not found")
            })?;
            let changed = self.conn.execute(
                "UPDATE servers
                 SET name = ?1, host = ?2, port = ?3, username = ?4, ssh_key_path = ?5,
                     polling_interval_seconds = ?6, enabled = ?7,
                     config_revision = config_revision + 1, updated_at = ?8
                WHERE id = ?9",
                params![
                    &name,
                    &host,
                    port,
                    &username,
                    &ssh_key_path,
                    polling_interval_seconds,
                    bool_to_i64(enabled),
                    &now,
                    &id
                ],
            )?;
            if changed == 0 {
                return Err(AppError::new(
                    "storage_app",
                    "server_not_found",
                    "server not found",
                ));
            }
            self.ensure_health(&id, if enabled { "idle" } else { "disabled" })?;
            return self.get_server(&id)?.ok_or_else(|| {
                AppError::new(
                    "storage_app",
                    "server_not_found",
                    format!("updated server {} disappeared", current.id),
                )
            });
        }

        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO servers(id, name, host, port, username, ssh_key_path,
                  polling_interval_seconds, enabled, config_revision, created_at, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10)",
            params![
                &id,
                &name,
                &host,
                port,
                &username,
                &ssh_key_path,
                polling_interval_seconds,
                bool_to_i64(enabled),
                &now,
                &now
            ],
        )?;
        self.ensure_health(&id, if enabled { "idle" } else { "disabled" })?;
        self.get_server(&id)?.ok_or_else(|| {
            AppError::new(
                "storage_app",
                "server_not_found",
                "created server not found",
            )
        })
    }

    pub fn delete_server(&self, id: &str) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM latest_snapshots WHERE server_id = ?1",
            params![id],
        )?;
        self.conn.execute(
            "DELETE FROM server_health WHERE server_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM servers WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_server_enabled(&self, id: &str, enabled: bool) -> Result<Server, AppError> {
        let now = now_string();
        let changed = self.conn.execute(
            "UPDATE servers SET enabled = ?1, config_revision = config_revision + 1, updated_at = ?2 WHERE id = ?3",
            params![bool_to_i64(enabled), now, id],
        )?;
        if changed == 0 {
            return Err(AppError::new(
                "storage_app",
                "server_not_found",
                "server not found",
            ));
        }
        self.ensure_health(id, if enabled { "idle" } else { "disabled" })?;
        self.get_server(id)?
            .ok_or_else(|| AppError::new("storage_app", "server_not_found", "server not found"))
    }
}

struct NormalizedServerInput {
    id: Option<String>,
    name: String,
    host: String,
    port: i64,
    username: String,
    ssh_key_path: Option<String>,
    polling_interval_seconds: i64,
    enabled: bool,
}

fn normalize_server_input(input: ServerInput) -> Result<NormalizedServerInput, AppError> {
    let name = trim_required(input.name, "name")?;
    let host = validate_ssh_token(input.host, "host")?;
    let username = validate_ssh_token(input.username, "username")?;
    let port = if input.port > 0 { input.port } else { 22 };
    if !(1..=65_535).contains(&port) {
        return Err(config_error("port must be between 1 and 65535"));
    }
    let polling_interval_seconds = match input.polling_interval_seconds {
        Some(value) if (1..=86_400).contains(&value) => value,
        Some(_) => {
            return Err(config_error(
                "polling interval must be between 1 and 86400 seconds",
            ))
        }
        None => DEFAULT_POLLING_INTERVAL_SECONDS,
    };
    let ssh_key_path = validate_ssh_key_path(input.ssh_key_path)?;
    Ok(NormalizedServerInput {
        id: input.id,
        name,
        host,
        port,
        username,
        ssh_key_path,
        polling_interval_seconds,
        enabled: input.enabled,
    })
}

fn trim_required(value: String, label: &str) -> Result<String, AppError> {
    let trimmed = validate_single_line(value, label)?;
    if trimmed.is_empty() {
        return Err(config_error(format!("{label} is required")));
    }
    Ok(trimmed)
}

fn validate_ssh_token(value: String, label: &str) -> Result<String, AppError> {
    let trimmed = trim_required(value, label)?;
    if trimmed.starts_with('-') || trimmed.contains('@') || trimmed.chars().any(char::is_whitespace)
    {
        return Err(config_error(format!("{label} is not a valid SSH {label}")));
    }
    Ok(trimmed)
}

fn validate_ssh_key_path(value: Option<String>) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = validate_single_line(value, "SSH key path")?;
    if trimmed.is_empty() {
        return Ok(None);
    }
    let upper = trimmed.to_ascii_uppercase();
    if upper.contains("-----BEGIN") || upper.contains("PRIVATE KEY") || upper.contains("-----END") {
        return Err(config_error(
            "SSH key path must be a filesystem path, not private key material",
        ));
    }
    Ok(Some(trimmed))
}

fn validate_single_line(value: String, label: &str) -> Result<String, AppError> {
    if value
        .chars()
        .any(|ch| ch == '\0' || ch == '\n' || ch == '\r')
    {
        return Err(config_error(format!("{label} must be a single line")));
    }
    Ok(value.trim().to_string())
}

fn config_error(message: impl Into<String>) -> AppError {
    AppError::new("storage_app", "server_config_invalid", message.into())
}
