pub mod contract;

mod dispatch;
mod request;
mod response;

use serde_json::Value;

pub use gpuwatcher_core as core;

pub fn handle_request(input: &str) -> Value {
    match request::parse_request(input) {
        Ok(request) => dispatch::dispatch_action(request.action, request.payload),
        Err(error) => error,
    }
}

pub fn handle_request_to_string(input: &str) -> String {
    serde_json::to_string(&handle_request(input)).expect("helper response serialization failed")
}
