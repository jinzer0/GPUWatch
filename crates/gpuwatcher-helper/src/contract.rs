use serde::{Deserialize, Serialize};
use serde_json::Value;

mod action_names;

pub use action_names::{action_name, parse_action};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HelperAction {
    InitializeApp,
    ListOverview,
    ListServers,
    ListSshConfigHosts,
    SaveServer,
    DeleteServer,
    SetServerEnabled,
    SeedDemoData,
    GetServerDetail,
    ListGpuHistory,
    ListProcesses,
    TestConnection,
    RefreshServer,
    PollDueServers,
    Health,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionVisibility {
    Renderer,
    MainOnly,
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
    pub helper_action: HelperAction,
    pub visibility: ActionVisibility,
    pub electron_preload_method: Option<&'static str>,
    pub timeout_class: TimeoutClass,
    pub db_mutation: DbMutation,
    pub polling_overlap_key: PollingOverlapKey,
    pub fallback_behavior: &'static str,
    pub notes: &'static str,
}

pub const REQUEST_ENVELOPE: &str = r#"{"action":string,"payload":object}"#;
pub const RESPONSE_ENVELOPE: &str = r#"{"ok":true,"data":...}|{"ok":false,"error":{"layer":string,"type":string,"message":string}}"#;

pub const HELPER_CONTRACT: &[HelperContractEntry] = &[
    HelperContractEntry {
        frontend_api: Some("initializeApp"),
        helper_action: HelperAction::InitializeApp,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("initializeApp"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Return the same overview list as list_overview.",
        notes: "Initial app load delegates directly to list_overview.",
    },
    HelperContractEntry {
        frontend_api: Some("listOverview"),
        helper_action: HelperAction::ListOverview,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("listOverview"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Surface helper errors through the response envelope.",
        notes: "Reads servers, health, and latest snapshots to build overview rows.",
    },
    HelperContractEntry {
        frontend_api: Some("listServers"),
        helper_action: HelperAction::ListServers,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("listServers"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Return an empty array only when no servers exist.",
        notes: "SQLite read of server settings.",
    },
    HelperContractEntry {
        frontend_api: Some("listSshConfigHosts"),
        helper_action: HelperAction::ListSshConfigHosts,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("listSshConfigHosts"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Read default ~/.ssh/config only; browser fallback returns no candidates plus backend-unavailable warning.",
        notes: "Lists SSH config import candidates from the core parser without accepting renderer-provided file paths.",
    },
    HelperContractEntry {
        frontend_api: Some("saveServer"),
        helper_action: HelperAction::SaveServer,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("saveServer"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServersWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Serialize DB mutation and block same-server polling while saving.",
        notes: "Creates or updates server, increments config revision on update, and ensures health.",
    },
    HelperContractEntry {
        frontend_api: Some("deleteServer"),
        helper_action: HelperAction::DeleteServer,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("deleteServer"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServersDelete,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Serialize DB mutation and block same-server polling while deleting.",
        notes: "Deletes the server row and dependent state through the repository schema.",
    },
    HelperContractEntry {
        frontend_api: Some("setServerEnabled"),
        helper_action: HelperAction::SetServerEnabled,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("setServerEnabled"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::ServerEnabledWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Serialize DB mutation and block same-server polling while toggling.",
        notes: "Updates enabled state, config revision, and health status.",
    },
    HelperContractEntry {
        frontend_api: Some("seedDemoData"),
        helper_action: HelperAction::SeedDemoData,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("seedDemoData"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::DemoSeedWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Serialize DB mutation and treat the created or reused server as overlap key.",
        notes: "Stores the bundled success fixture, then returns overview rows.",
    },
    HelperContractEntry {
        frontend_api: Some("getServerDetail"),
        helper_action: HelperAction::GetServerDetail,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("getServerDetail"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Return null data when the server id is not found.",
        notes: "Reads server, health, and latest snapshot for detail DTO.",
    },
    HelperContractEntry {
        frontend_api: Some("listGpuHistory"),
        helper_action: HelperAction::ListGpuHistory,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("listGpuHistory"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Keep renderer-side blank serverId rejection and return contract errors for invalid helper payloads.",
        notes: "Reads retained GPU history for 1h, 6h, or 24h ranges.",
    },
    HelperContractEntry {
        frontend_api: Some("listProcesses"),
        helper_action: HelperAction::ListProcesses,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("listProcesses"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Return an empty array when no latest snapshots contain processes.",
        notes: "Reads servers, health, and latest snapshots for process rows.",
    },
    HelperContractEntry {
        frontend_api: Some("testConnection"),
        helper_action: HelperAction::TestConnection,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("testConnection"),
        timeout_class: TimeoutClass::Ssh60s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Run SSH collection without storing snapshot or health changes.",
        notes: "Reports online, offline for transport_ssh, or error for other layers.",
    },
    HelperContractEntry {
        frontend_api: Some("refreshServer"),
        helper_action: HelperAction::RefreshServer,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("refreshServer"),
        timeout_class: TimeoutClass::Ssh60s,
        db_mutation: DbMutation::PollHealthStartAndResultWrite,
        polling_overlap_key: PollingOverlapKey::ServerId,
        fallback_behavior: "Electron main rejects same-server overlap with poll_already_running and discards stale configRevision results.",
        notes: "Marks polling, runs SSH collection, and stores success snapshot/history or failure health metadata.",
    },
    HelperContractEntry {
        frontend_api: None,
        helper_action: HelperAction::PollDueServers,
        visibility: ActionVisibility::MainOnly,
        electron_preload_method: None,
        timeout_class: TimeoutClass::Ssh60s,
        db_mutation: DbMutation::PollHealthStartAndResultWrite,
        polling_overlap_key: PollingOverlapKey::ElectronMainScheduler,
        fallback_behavior: "Return a structured main_scheduler_owned error if called directly; renderer bridge and IPC do not expose it.",
        notes: "Electron main performs due polling with list_servers, get_server_detail, and refresh_server without adding a renderer-callable polling method.",
    },
    HelperContractEntry {
        frontend_api: None,
        helper_action: HelperAction::Health,
        visibility: ActionVisibility::Renderer,
        electron_preload_method: Some("helperHealth"),
        timeout_class: TimeoutClass::Local10s,
        db_mutation: DbMutation::None,
        polling_overlap_key: PollingOverlapKey::None,
        fallback_behavior: "Optional helper smoke action only; renderer frontend API must not depend on it.",
        notes: "Documented helper-only action allowed for packaging and smoke checks.",
    },
];
