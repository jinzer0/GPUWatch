use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HelperAction {
    InitializeApp,
    ListOverview,
    ListServers,
    SaveServer,
    DeleteServer,
    SetServerEnabled,
    SeedDemoData,
    GetServerDetail,
    ListGpuHistory,
    ListProcesses,
    TestConnection,
    RefreshServer,
    Health,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TimeoutClass {
    Local10s,
    Ssh60s,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DbMutation {
    None,
    ServersWrite,
    ServersDelete,
    ServerEnabledWrite,
    DemoSeedWrite,
    PollHealthStartAndResultWrite,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PollingOverlapKey {
    None,
    ServerId,
    ElectronMainScheduler,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MigrationStatus {
    Migrate,
    ElectronMainOnly,
    DocumentedHelperHealth,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HelperRequestEnvelope {
    pub action: HelperAction,
    #[serde(default)]
    pub payload: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HelperErrorEnvelope {
    pub layer: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HelperResponseEnvelope {
    Ok {
        ok: bool,
        data: Value,
    },
    Err {
        ok: bool,
        error: HelperErrorEnvelope,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HelperContractEntry {
    pub frontend_api: Option<&'static str>,
    pub tauri_command: Option<&'static str>,
    pub helper_action: HelperAction,
    pub electron_preload_method: &'static str,
    pub timeout_class: TimeoutClass,
    pub db_mutation: DbMutation,
    pub polling_overlap_key: PollingOverlapKey,
    pub migration_status: MigrationStatus,
    pub fallback_behavior: &'static str,
    pub notes: &'static str,
}

pub const REQUEST_ENVELOPE: &str = r#"{"action":string,"payload":object}"#;
pub const RESPONSE_ENVELOPE: &str = r#"{"ok":true,"data":...}|{"ok":false,"error":{"layer":string,"type":string,"message":string}}"#;

pub const HELPER_CONTRACT: &[HelperContractEntry] = &[
    HelperContractEntry {
        frontend_api: Some("initializeApp"),
        tauri_command: Some("initialize_app"),
        helper_action: HelperAction::InitializeApp,
        electron_preload_method: "initializeApp",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Return the same overview list as list_overview.",
        notes: "Tauri delegates initialize_app directly to list_overview.",
    },
    HelperContractEntry {
        frontend_api: Some("listOverview"),
        tauri_command: Some("list_overview"),
        helper_action: HelperAction::ListOverview,
        electron_preload_method: "listOverview",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Surface helper errors through the response envelope.",
        notes: "Reads servers, health, and latest snapshots to build overview rows.",
    },
    HelperContractEntry {
        frontend_api: Some("listServers"),
        tauri_command: Some("list_servers"),
        helper_action: HelperAction::ListServers,
        electron_preload_method: "listServers",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Return an empty array only when no servers exist.",
        notes: "SQLite read of server settings.",
    },
    HelperContractEntry {
        frontend_api: Some("saveServer"),
        tauri_command: Some("save_server"),
        helper_action: HelperAction::SaveServer,
        electron_preload_method: "saveServer",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServersWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Serialize DB mutation and block same-server polling while saving.",
        notes: "Creates or updates server, increments config revision on update, and ensures health.",
    },
    HelperContractEntry {
        frontend_api: Some("deleteServer"),
        tauri_command: Some("delete_server"),
        helper_action: HelperAction::DeleteServer,
        electron_preload_method: "deleteServer",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServersDelete,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Serialize DB mutation and block same-server polling while deleting.",
        notes: "Deletes the server row and dependent state through the repository schema.",
    },
    HelperContractEntry {
        frontend_api: Some("setServerEnabled"),
        tauri_command: Some("set_server_enabled"),
        helper_action: HelperAction::SetServerEnabled,
        electron_preload_method: "setServerEnabled",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServerEnabledWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Serialize DB mutation and block same-server polling while toggling.",
        notes: "Updates enabled state, config revision, and health status.",
    },
    HelperContractEntry {
        frontend_api: Some("seedDemoData"),
        tauri_command: Some("seed_demo_data"),
        helper_action: HelperAction::SeedDemoData,
        electron_preload_method: "seedDemoData",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::DemoSeedWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Serialize DB mutation and treat the created or reused server as overlap key.",
        notes: "Stores the bundled success fixture, then returns overview rows.",
    },
    HelperContractEntry {
        frontend_api: Some("getServerDetail"),
        tauri_command: Some("get_server_detail"),
        helper_action: HelperAction::GetServerDetail,
        electron_preload_method: "getServerDetail",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Return null data when the server id is not found.",
        notes: "Reads server, health, and latest snapshot for detail DTO.",
    },
    HelperContractEntry {
        frontend_api: Some("listGpuHistory"),
        tauri_command: Some("list_gpu_history"),
        helper_action: HelperAction::ListGpuHistory,
        electron_preload_method: "listGpuHistory",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Keep renderer-side blank serverId rejection and return contract errors for invalid helper payloads.",
        notes: "Reads retained GPU history for 1h, 6h, or 24h ranges.",
    },
    HelperContractEntry {
        frontend_api: Some("listProcesses"),
        tauri_command: Some("list_processes"),
        helper_action: HelperAction::ListProcesses,
        electron_preload_method: "listProcesses",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Return an empty array when no latest snapshots contain processes.",
        notes: "Reads servers, health, and latest snapshots for process rows.",
    },
    HelperContractEntry {
        frontend_api: Some("testConnection"),
        tauri_command: Some("test_connection"),
        helper_action: HelperAction::TestConnection,
        electron_preload_method: "testConnection",
        timeout_class: TimeoutClass::Ssh60s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Run SSH collection without storing snapshot or health changes.",
        notes: "Reports online, offline for transport_ssh, or error for other layers.",
    },
    HelperContractEntry {
        frontend_api: Some("refreshServer"),
        tauri_command: Some("refresh_server"),
        helper_action: HelperAction::RefreshServer,
        electron_preload_method: "refreshServer",
        timeout_class: TimeoutClass::Ssh60s,
        db_mutation: DbMutation::PollHealthStartAndResultWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        migration_status: MigrationStatus::Migrate,
        fallback_behavior: "Electron main rejects same-server overlap with poll_already_running and discards stale configRevision results.",
        notes: "Marks polling, runs SSH collection, and stores success snapshot/history or failure health metadata.",
    },
    HelperContractEntry {
        frontend_api: None,
        tauri_command: None,
        helper_action: HelperAction::Health,
        electron_preload_method: "helperHealth",
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        migration_status: MigrationStatus::DocumentedHelperHealth,
        fallback_behavior: "Optional helper smoke action only; renderer frontend API must not depend on it.",
        notes: "Documented helper-only action allowed for packaging and smoke checks.",
    },
];
