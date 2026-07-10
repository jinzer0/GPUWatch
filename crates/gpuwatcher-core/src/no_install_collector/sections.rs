use std::collections::HashMap;

use crate::diagnostics::sanitize_diagnostic_excerpt;
use crate::error::AppError;

const SECTION_PREFIX: &str = "__GPUWATCH_SECTION__:";
const SECTION_END_PREFIX: &str = "__GPUWATCH_END__:";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ScriptSection {
    status: i32,
    body: String,
}

pub(super) fn parse_sections(stdout: &str) -> Result<HashMap<String, ScriptSection>, AppError> {
    let mut sections = HashMap::new();
    let mut current: Option<(String, i32, Vec<String>)> = None;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix(SECTION_PREFIX) {
            if current.is_some() {
                return Err(AppError::new(
                    "collector",
                    "remote_output_malformed",
                    "remote output started a section before ending the previous section",
                ));
            }
            let (name, status) = parse_section_header(rest)?;
            current = Some((name, status, Vec::new()));
            continue;
        }

        if let Some(end_name) = line.strip_prefix(SECTION_END_PREFIX) {
            let Some((name, status, lines)) = current.take() else {
                return Err(AppError::new(
                    "collector",
                    "remote_output_malformed",
                    "remote output ended a section that was not open",
                ));
            };
            if name != end_name {
                return Err(AppError::new(
                    "collector",
                    "remote_output_malformed",
                    format!("remote output section end mismatch: expected {name}, got {end_name}"),
                ));
            }
            sections.insert(
                name,
                ScriptSection {
                    status,
                    body: lines.join("\n"),
                },
            );
            continue;
        }

        if let Some((_, _, lines)) = current.as_mut() {
            lines.push(line.to_string());
        }
    }

    if current.is_some() {
        return Err(AppError::new(
            "collector",
            "remote_output_malformed",
            "remote output ended before closing the current section",
        ));
    }
    Ok(sections)
}

fn parse_section_header(rest: &str) -> Result<(String, i32), AppError> {
    let mut parts = rest.splitn(2, ':');
    let name = parts.next().unwrap_or_default();
    let status = parts.next().unwrap_or_default();
    if name.is_empty() || status.is_empty() {
        return Err(AppError::new(
            "collector",
            "remote_output_malformed",
            "remote output section header is incomplete",
        ));
    }
    let status = status.parse::<i32>().map_err(|err| {
        AppError::new(
            "collector",
            "remote_output_malformed",
            format!("remote output section status is invalid: {err}"),
        )
    })?;
    Ok((name.to_string(), status))
}

pub(super) fn required_gpu_csv(
    sections: &HashMap<String, ScriptSection>,
) -> Result<&str, AppError> {
    let section = sections.get("gpu_csv").ok_or_else(|| {
        AppError::new(
            "collector",
            "remote_output_malformed",
            "remote output did not include GPU CSV section",
        )
    })?;
    if section.status == 127 || contains_command_missing(&section.body) {
        return Err(AppError::new(
            "collector",
            "nvidia_smi_missing",
            section_message(section, "nvidia-smi is not available on the remote host"),
        ));
    }
    if section.status != 0 || section.body.trim().is_empty() {
        return Err(AppError::new(
            "collector",
            "remote_gpu_query_failed",
            section_message(section, "base nvidia-smi GPU query failed"),
        ));
    }
    Ok(section.body.as_str())
}

pub(super) fn optional_success_section<'a>(
    sections: &'a HashMap<String, ScriptSection>,
    name: &str,
    warnings: &mut Vec<String>,
) -> Option<&'a str> {
    let Some(section) = sections.get(name) else {
        warnings.push(format!("{name} collection missing"));
        return None;
    };
    if section.status != 0 {
        warnings.push(format!(
            "{name} collection failed: {}",
            section_message(section, "remote command failed")
        ));
        return None;
    }
    Some(section.body.as_str())
}

pub(super) fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn section_message(section: &ScriptSection, fallback: &str) -> String {
    let sanitized = sanitize_diagnostic_excerpt(&section.body);
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

fn contains_command_missing(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("nvidia-smi")
        && (lower.contains("not found") || lower.contains("command not found"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn section(status: i32, body: &str) -> ScriptSection {
        ScriptSection {
            status,
            body: body.to_string(),
        }
    }

    #[test]
    fn required_gpu_csv_maps_command_not_found_to_nvidia_smi_missing() {
        let mut sections = HashMap::new();
        sections.insert(
            "gpu_csv".to_string(),
            section(127, "sh: 1: nvidia-smi: command not found"),
        );

        let err = required_gpu_csv(&sections).expect_err("missing nvidia-smi should fail");

        assert_eq!(err.layer, "collector");
        assert_eq!(err.error_type, "nvidia_smi_missing");
        assert!(err.message.contains("nvidia-smi"));
    }

    #[test]
    fn required_gpu_csv_maps_nonzero_base_query_to_remote_gpu_query_failed() {
        let mut sections = HashMap::new();
        sections.insert(
            "gpu_csv".to_string(),
            section(
                9,
                "Failed to initialize NVML: Driver/library version mismatch",
            ),
        );

        let err = required_gpu_csv(&sections).expect_err("base GPU query should fail");

        assert_eq!(err.layer, "collector");
        assert_eq!(err.error_type, "remote_gpu_query_failed");
        assert!(err.message.contains("Failed to initialize NVML"));
    }

    #[test]
    fn required_gpu_csv_sanitizes_failure_message() {
        let mut sections = HashMap::new();
        sections.insert(
            "gpu_csv".to_string(),
            section(
                127,
                "nvidia-smi: command not found\n-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----\ntoken=abc123 password hunter2 secret: keepout /Users/alice/.ssh/id_ed25519",
            ),
        );

        let err = required_gpu_csv(&sections).expect_err("missing nvidia-smi should fail");

        assert_eq!(err.error_type, "nvidia_smi_missing");
        assert!(err.message.contains("nvidia-smi: command not found"));
        assert!(err.message.contains("[private key redacted]"));
        assert!(err.message.contains("token=[redacted]"));
        assert!(err.message.contains("password=[redacted]"));
        assert!(err.message.contains("secret=[redacted]"));
        assert!(err.message.contains("[path redacted]"));
        assert!(!err.message.contains("abc123"));
        assert!(!err.message.contains("hunter2"));
        assert!(!err.message.contains("keepout"));
        assert!(!err.message.contains("/Users/alice/.ssh/id_ed25519"));
    }

    #[test]
    fn parse_sections_rejects_malformed_input() {
        let err = parse_sections("__GPUWATCH_END__:gpu_csv")
            .expect_err("unopened end marker should be malformed");

        assert_eq!(err.layer, "collector");
        assert_eq!(err.error_type, "remote_output_malformed");
    }
}
