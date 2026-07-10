use crate::error::AppError;
use crate::models::{Server, ServerInput};
use crate::state::AppState;

pub fn save_server(state: &AppState, input: ServerInput) -> Result<Server, AppError> {
    let repository = state.repository()?;
    repository.save_server(input)
}

pub fn delete_server(state: &AppState, id: String) -> Result<(), AppError> {
    let repository = state.repository()?;
    repository.delete_server(&id)
}

pub fn set_server_enabled(state: &AppState, id: String, enabled: bool) -> Result<Server, AppError> {
    let repository = state.repository()?;
    repository.set_server_enabled(&id, enabled)
}
