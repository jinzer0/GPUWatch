use serde_json::{json, Value};

use crate::contract::{action_name, HELPER_CONTRACT, REQUEST_ENVELOPE, RESPONSE_ENVELOPE};

pub(super) fn health_data() -> Value {
    let actions: Vec<&'static str> = HELPER_CONTRACT
        .iter()
        .map(|entry| action_name(entry.helper_action))
        .collect();

    json!({
        "helperName": env!("CARGO_PKG_NAME"),
        "helperVersion": env!("CARGO_PKG_VERSION"),
        "status": "ok",
        "requestEnvelope": REQUEST_ENVELOPE,
        "responseEnvelope": RESPONSE_ENVELOPE,
        "allowlistedActions": actions,
    })
}
