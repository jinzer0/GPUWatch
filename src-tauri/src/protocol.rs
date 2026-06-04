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
    fn rich_optional_metrics_fixture_parses() {
        let raw = include_str!("../../fixtures/protocol/v1/success_rich_optional_metrics.json");
        let parsed = parse_collector_json(raw).expect("rich optional metrics fixture should parse");
        let ParsedCollectorPayload::Success(success) = parsed else {
            panic!("expected success");
        };
        let gpu = &success.gpus[0];
        assert_eq!(gpu.encoder_utilization_percent, Some(4.5));
        assert_eq!(gpu.decoder_utilization_percent, Some(2.25));
        assert_eq!(gpu.jpeg_utilization_percent, Some(1.5));
        assert_eq!(gpu.ofa_utilization_percent, Some(0.5));
        assert_eq!(gpu.pcie_rx_kib_per_sec, Some(123456));
        assert_eq!(gpu.pcie_tx_kib_per_sec, Some(654321));
        assert_eq!(gpu.pcie_link_gen_current, Some(4));
        assert_eq!(gpu.pcie_link_width_current, Some(16));
        assert_eq!(gpu.mig_mode_current.as_deref(), Some("enabled"));
        assert_eq!(gpu.mig_mode_pending.as_deref(), Some("disabled"));
        assert_eq!(gpu.mig_instance_count, Some(7));

        let process = &gpu.processes[0];
        assert_eq!(process.parent_pid, Some(9800));
        assert_eq!(process.runtime_seconds, Some(3661));
        assert_eq!(process.gpu_sm_utilization_percent, Some(82.75));
        assert_eq!(process.gpu_memory_utilization_percent, Some(70.5));
        assert_eq!(process.gpu_encoder_utilization_percent, Some(3.25));
        assert_eq!(process.gpu_decoder_utilization_percent, Some(1.25));
    }

    #[test]
    fn optional_metrics_are_missing_or_null_safe() {
        let old_raw = include_str!("../../fixtures/protocol/v1/success_single_gpu.json");
        let ParsedCollectorPayload::Success(old_success) =
            parse_collector_json(old_raw).expect("old fixture should parse")
        else {
            panic!("expected success");
        };
        assert_eq!(old_success.gpus[0].encoder_utilization_percent, None);
        assert_eq!(old_success.gpus[0].pcie_rx_kib_per_sec, None);
        assert_eq!(old_success.gpus[0].mig_mode_current, None);
        assert_eq!(old_success.gpus[0].processes[0].parent_pid, None);
        assert_eq!(
            old_success.gpus[0].processes[0].gpu_sm_utilization_percent,
            None
        );

        let null_raw =
            include_str!("../../fixtures/protocol/v1/success_optional_metrics_missing_null.json");
        let ParsedCollectorPayload::Success(null_success) =
            parse_collector_json(null_raw).expect("null optional metrics fixture should parse")
        else {
            panic!("expected success");
        };
        assert_eq!(null_success.gpus[0].decoder_utilization_percent, None);
        assert_eq!(null_success.gpus[0].pcie_link_width_current, None);
        assert_eq!(null_success.gpus[0].processes[0].runtime_seconds, None);
        assert_eq!(
            null_success.gpus[0].processes[0].gpu_decoder_utilization_percent,
            None
        );
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
    fn protocol_schema_lists_optional_rich_metrics_without_requiring_them() {
        let schema: Value =
            serde_json::from_str(include_str!("../../schemas/gpuwatcher-v1.schema.json"))
                .expect("schema JSON parses");
        let gpu = &schema["$defs"]["gpu"];
        let process = &schema["$defs"]["process"];

        for field in [
            "encoderUtilizationPercent",
            "decoderUtilizationPercent",
            "jpegUtilizationPercent",
            "ofaUtilizationPercent",
            "pcieRxKibPerSec",
            "pcieTxKibPerSec",
            "pcieLinkGenCurrent",
            "pcieLinkWidthCurrent",
            "migModeCurrent",
            "migModePending",
            "migInstanceCount",
        ] {
            assert!(gpu["properties"].get(field).is_some(), "missing {field}");
            assert!(!gpu["required"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == field));
        }

        for field in [
            "parentPid",
            "runtimeSeconds",
            "gpuSmUtilizationPercent",
            "gpuMemoryUtilizationPercent",
            "gpuEncoderUtilizationPercent",
            "gpuDecoderUtilizationPercent",
        ] {
            assert!(
                process["properties"].get(field).is_some(),
                "missing {field}"
            );
            assert!(!process["required"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == field));
        }
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
