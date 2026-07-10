use std::{path::Path, time::Duration};

use chrono::Utc;
use rusqlite::Connection;

use crate::error::AppError;

mod health;
mod history;
mod mappers;
mod polling;
mod schema;
mod servers;
mod snapshots;

const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct Repository {
    conn: Connection,
}

impl Repository {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        Self::from_connection(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, AppError> {
        let repository = Self::from_connection(Connection::open_in_memory()?)?;
        repository.migrate()?;
        Ok(repository)
    }

    fn from_connection(conn: Connection) -> Result<Self, AppError> {
        conn.busy_timeout(SQLITE_BUSY_TIMEOUT)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            ",
        )?;
        Ok(Self { conn })
    }
}

pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}
