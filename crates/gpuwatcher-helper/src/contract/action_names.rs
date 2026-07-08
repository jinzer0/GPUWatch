use super::{HelperAction, HELPER_CONTRACT};

pub fn parse_action(action: &str) -> Option<HelperAction> {
    HELPER_CONTRACT
        .iter()
        .map(|entry| entry.helper_action)
        .find(|candidate| action_name(*candidate) == action)
}

pub fn action_name(action: HelperAction) -> &'static str {
    match action {
        HelperAction::InitializeApp => "initialize_app",
        HelperAction::ListOverview => "list_overview",
        HelperAction::ListServers => "list_servers",
        HelperAction::ListSshConfigHosts => "list_ssh_config_hosts",
        HelperAction::SaveServer => "save_server",
        HelperAction::DeleteServer => "delete_server",
        HelperAction::SetServerEnabled => "set_server_enabled",
        HelperAction::SeedDemoData => "seed_demo_data",
        HelperAction::GetServerDetail => "get_server_detail",
        HelperAction::ListGpuHistory => "list_gpu_history",
        HelperAction::ListProcesses => "list_processes",
        HelperAction::TestConnection => "test_connection",
        HelperAction::RefreshServer => "refresh_server",
        HelperAction::PollDueServers => "poll_due_servers",
        HelperAction::Health => "health",
    }
}
