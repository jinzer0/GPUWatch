use serde::Deserialize;
use serde_json::Value;

use crate::config::{PROTOCOL_VERSION, SCHEMA_VERSION};
use crate::error::AppError;
use crate::models::{CollectorErrorEnvelope, ParsedCollectorPayload, SuccessEnvelope};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaseEnvelope {
    protocol_version: i64,
    schema_version: i64,
    ok: bool,
}

pub fn parse_collector_json(raw_json: &str) -> Result<ParsedCollectorPayload, AppError> {
    let value: Value = serde_json::from_str(raw_json).map_err(|err| {
        AppError::new(
            "protocol",
            "protocol_malformed_json",
            format!("collector stdout is not JSON: {err}"),
        )
    })?;
    let base: BaseEnvelope = serde_json::from_value(value.clone()).map_err(|err| {
        AppError::new(
            "protocol",
            "protocol_schema_invalid",
            format!("base envelope is invalid: {err}"),
        )
    })?;

    if base.protocol_version != PROTOCOL_VERSION || base.schema_version != SCHEMA_VERSION {
        return Err(AppError::new(
            "protocol",
            "protocol_unsupported_version",
            format!(
                "unsupported protocol/schema version {}/{}",
                base.protocol_version, base.schema_version
            ),
        ));
    }

    if base.ok {
        let success: SuccessEnvelope = serde_json::from_value(value).map_err(|err| {
            AppError::new(
                "protocol",
                "protocol_schema_invalid",
                format!("success envelope is invalid: {err}"),
            )
        })?;
        Ok(ParsedCollectorPayload::Success(success))
    } else {
        let failure: CollectorErrorEnvelope = serde_json::from_value(value).map_err(|err| {
            AppError::new(
                "protocol",
                "protocol_schema_invalid",
                format!("collector error envelope is invalid: {err}"),
            )
        })?;
        Ok(ParsedCollectorPayload::CollectorError(failure))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_success_fixture_parses() {
        let raw = include_str!("../../fixtures/protocol/v1/success_multi_gpu.json");
        let parsed = parse_collector_json(raw).expect("fixture should parse");
        match parsed {
            ParsedCollectorPayload::Success(success) => assert_eq!(success.gpus.len(), 2),
            ParsedCollectorPayload::CollectorError(_) => panic!("expected success"),
        }
    }

    #[test]
    fn protocol_schema_artifact_is_present() {
        let schema: Value =
            serde_json::from_str(include_str!("../../schemas/gpuwatcher-v1.schema.json"))
                .expect("schema JSON parses");
        assert_eq!(
            schema.get("title").and_then(Value::as_str),
            Some("GPUWatcher JSON Protocol v1")
        );
        assert!(schema
            .get("oneOf")
            .and_then(Value::as_array)
            .is_some_and(|items| items.len() == 2));
    }

    #[test]
    fn collector_error_fixture_parses_as_collector_error() {
        let raw = include_str!("../../fixtures/protocol/v1/collector_nvml_unavailable.json");
        let parsed = parse_collector_json(raw).expect("collector error should parse");
        match parsed {
            ParsedCollectorPayload::CollectorError(error) => {
                assert_eq!(error.error.error_type, "collector_dependency_unavailable");
            }
            ParsedCollectorPayload::Success(_) => panic!("expected collector error"),
        }
    }

    #[test]
    fn malformed_json_is_deterministic_error() {
        let raw = include_str!("../../fixtures/protocol/v1/malformed_json.txt");
        let error = parse_collector_json(raw).expect_err("fixture should fail");
        assert_eq!(error.error_type, "protocol_malformed_json");
    }

    #[test]
    fn missing_required_field_is_schema_error() {
        let raw = include_str!("../../fixtures/protocol/v1/missing_required_field.json");
        let error = parse_collector_json(raw).expect_err("fixture should fail");
        assert_eq!(error.error_type, "protocol_schema_invalid");
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let raw = include_str!("../../fixtures/protocol/v1/unsupported_protocol_version.json");
        let error = parse_collector_json(raw).expect_err("fixture should fail");
        assert_eq!(error.error_type, "protocol_unsupported_version");
    }
}
