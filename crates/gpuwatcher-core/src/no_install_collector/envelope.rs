use crate::command_runner::CommandOutput;
use crate::config::{PROTOCOL_VERSION, SCHEMA_VERSION};
use crate::diagnostics::sanitize_diagnostic_excerpt;
use crate::error::AppError;
use crate::models::{CollectorServerInfo, Server, SuccessEnvelope};
use crate::nvidia_smi::{parse_nvidia_smi_outputs, NvidiaSmiOutputs};
use crate::repository::now_string;

use super::sections::{
    first_non_empty_line, optional_success_section, parse_sections, required_gpu_csv,
};

pub fn build_no_install_snapshot_from_output(
    _server: &Server,
    output: &CommandOutput,
) -> Result<(String, SuccessEnvelope), AppError> {
    let sections = parse_sections(&output.stdout)?;
    let hostname = optional_success_section(&sections, "hostname", &mut Vec::new())
        .and_then(first_non_empty_line);
    let mut warnings = Vec::new();
    let gpu_csv = required_gpu_csv(&sections)?;
    let compute_apps_csv = optional_success_section(&sections, "compute_apps_csv", &mut warnings);
    let gpu_extra_csv = optional_success_section(&sections, "gpu_extra_csv", &mut warnings);
    let mig_list = optional_success_section(&sections, "mig_list", &mut warnings);
    let pmon = optional_success_section(&sections, "pmon", &mut warnings);
    let dmon = optional_success_section(&sections, "dmon", &mut warnings);
    let dmon_pcie = optional_success_section(&sections, "dmon_pcie", &mut warnings);
    let ps = optional_success_section(&sections, "ps", &mut warnings);

    let parsed = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv,
        compute_apps_csv,
        gpu_extra_csv,
        mig_list,
        pmon,
        dmon,
        dmon_pcie,
        ps,
    })?;
    warnings.extend(parsed.warnings);
    if !output.stderr.trim().is_empty() {
        warnings.push(format!(
            "remote script stderr: {}",
            sanitize_diagnostic_excerpt(&output.stderr)
        ));
    }

    let driver_version = parsed
        .gpu_supplements
        .iter()
        .find_map(|supplement| supplement.driver_version.clone());
    let envelope = SuccessEnvelope {
        protocol_version: PROTOCOL_VERSION,
        schema_version: SCHEMA_VERSION,
        ok: true,
        timestamp: now_string(),
        server: CollectorServerInfo {
            hostname,
            driver_version,
            cuda_version: None,
        },
        gpus: parsed.gpus,
        warnings,
    };
    let raw_json = serde_json::to_string(&envelope)?;
    Ok((raw_json, envelope))
}
