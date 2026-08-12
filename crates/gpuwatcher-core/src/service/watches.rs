use crate::error::AppError;
use crate::models::{GpuAvailableWatchInput, GpuAvailableWatchRule, NotificationOutboxEvent};
use crate::state::AppState;

pub fn list_watch_rules(
    state: &AppState,
    server_id: String,
) -> Result<Vec<GpuAvailableWatchRule>, AppError> {
    state.repository()?.list_watch_rules(&server_id)
}

pub fn save_gpu_available_watch(
    state: &AppState,
    input: GpuAvailableWatchInput,
) -> Result<GpuAvailableWatchRule, AppError> {
    state.repository()?.save_gpu_available_watch(input)
}

pub fn delete_watch_rule(state: &AppState, id: String) -> Result<(), AppError> {
    state.repository()?.delete_watch_rule(&id)
}

pub fn consume_notification_outbox(
    state: &AppState,
) -> Result<Vec<NotificationOutboxEvent>, AppError> {
    state.repository()?.consume_notification_outbox()
}
