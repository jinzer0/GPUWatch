use crate::models::CollectorProcess;

use super::super::helpers::{parse_f64_optional, parse_i64_optional, parse_string_optional};
use super::super::types::{PmonHeader, ProcessRow};

pub(super) fn parse_pmon(raw: &str, warnings: &mut Vec<String>) -> Vec<ProcessRow> {
    let mut rows = Vec::new();
    let mut header = None;
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('#') || trimmed.starts_with("gpu") {
            header = parse_pmon_header(trimmed);
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 4 {
            warnings.push(format!(
                "pmon line {} ignored: too few fields",
                line_number + 1
            ));
            continue;
        }
        let pmon_header = header.unwrap_or(PmonHeader {
            gpu_index: 0,
            pid: 1,
            process_type: Some(2),
            fb: Some(3),
            sm: Some(4),
            memory: Some(5),
            encoder: Some(6),
            decoder: Some(7),
            command: parts.len().checked_sub(1),
        });
        let Some(gpu_index) = get_pmon_field(&parts, pmon_header.gpu_index)
            .and_then(|value| parse_i64_optional(value, "pmon.gpu", warnings).flatten())
        else {
            warnings.push(format!(
                "pmon line {} ignored: missing GPU index",
                line_number + 1
            ));
            continue;
        };
        let Some(pid) = get_pmon_field(&parts, pmon_header.pid)
            .and_then(|value| parse_i64_optional(value, "pmon.pid", warnings).flatten())
        else {
            warnings.push(format!(
                "pmon line {} ignored: missing pid",
                line_number + 1
            ));
            continue;
        };
        rows.push(pmon_process_row(
            &parts,
            pmon_header,
            gpu_index,
            pid,
            warnings,
        ));
    }
    rows
}

fn pmon_process_row(
    parts: &[&str],
    pmon_header: PmonHeader,
    gpu_index: i64,
    pid: i64,
    warnings: &mut Vec<String>,
) -> ProcessRow {
    let gpu_memory_used_mib = pmon_header
        .fb
        .and_then(|index| get_pmon_field(parts, index))
        .and_then(|value| parse_i64_optional(value, "pmon.fb", warnings).flatten());
    let gpu_utilization_percent = pmon_header
        .sm
        .and_then(|index| get_pmon_field(parts, index))
        .and_then(|value| parse_f64_optional(value, "pmon.sm", warnings).flatten());
    let gpu_memory_utilization_percent = pmon_header
        .memory
        .and_then(|index| get_pmon_field(parts, index))
        .and_then(|value| parse_f64_optional(value, "pmon.mem", warnings).flatten());
    let gpu_encoder_utilization_percent = pmon_header
        .encoder
        .and_then(|index| get_pmon_field(parts, index))
        .and_then(|value| parse_f64_optional(value, "pmon.enc", warnings).flatten());
    let gpu_decoder_utilization_percent = pmon_header
        .decoder
        .and_then(|index| get_pmon_field(parts, index))
        .and_then(|value| parse_f64_optional(value, "pmon.dec", warnings).flatten());
    let process_kind = pmon_header
        .process_type
        .and_then(|index| get_pmon_field(parts, index))
        .map(process_kind_from_pmon_type)
        .unwrap_or_else(|| "unknown".to_string());

    ProcessRow {
        gpu_uuid: None,
        gpu_index: Some(gpu_index),
        process: CollectorProcess {
            pid,
            gpu_uuid: None,
            process_kind,
            parent_pid: None,
            runtime_seconds: None,
            username: None,
            command: pmon_header
                .command
                .and_then(|index| get_pmon_field(parts, index))
                .and_then(parse_string_optional),
            gpu_memory_used_mib,
            gpu_utilization_percent,
            gpu_sm_utilization_percent: gpu_utilization_percent,
            gpu_memory_utilization_percent,
            gpu_encoder_utilization_percent,
            gpu_decoder_utilization_percent,
            cpu_percent: None,
            host_memory_used_mib: None,
        },
    }
}

fn parse_pmon_header(line: &str) -> Option<PmonHeader> {
    let columns: Vec<&str> = line.trim_start_matches('#').split_whitespace().collect();
    let gpu_index = columns.iter().position(|column| *column == "gpu")?;
    let pid = columns.iter().position(|column| *column == "pid")?;
    Some(PmonHeader {
        gpu_index,
        pid,
        process_type: columns.iter().position(|column| *column == "type"),
        fb: columns.iter().position(|column| *column == "fb"),
        sm: columns.iter().position(|column| *column == "sm"),
        memory: columns.iter().position(|column| *column == "mem"),
        encoder: columns.iter().position(|column| *column == "enc"),
        decoder: columns.iter().position(|column| *column == "dec"),
        command: columns.iter().position(|column| *column == "command"),
    })
}

fn get_pmon_field<'a>(parts: &'a [&str], index: usize) -> Option<&'a str> {
    parts.get(index).copied()
}

fn process_kind_from_pmon_type(value: &str) -> String {
    match value.trim() {
        "C" => "compute".to_string(),
        "G" => "graphics".to_string(),
        _ => "unknown".to_string(),
    }
}
