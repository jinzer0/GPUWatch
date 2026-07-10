use crate::models::{LatestSnapshot, Server, ServerHealth};

pub(super) fn read_server(row: &rusqlite::Row<'_>) -> rusqlite::Result<Server> {
    Ok(Server {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        ssh_key_path: row.get(5)?,
        polling_interval_seconds: row.get(6)?,
        enabled: row.get::<_, i64>(7)? != 0,
        config_revision: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(super) fn read_health(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServerHealth> {
    Ok(ServerHealth {
        server_id: row.get(0)?,
        status: row.get(1)?,
        last_error_type: row.get(2)?,
        last_error_message: row.get(3)?,
        last_poll_started_at: row.get(4)?,
        last_poll_finished_at: row.get(5)?,
        last_success_at: row.get(6)?,
    })
}

pub(super) fn read_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<LatestSnapshot> {
    Ok(LatestSnapshot {
        server_id: row.get(0)?,
        protocol_version: row.get(1)?,
        schema_version: row.get(2)?,
        received_at: row.get(3)?,
        raw_json: row.get(4)?,
        parsed_summary_json: row.get(5)?,
    })
}
