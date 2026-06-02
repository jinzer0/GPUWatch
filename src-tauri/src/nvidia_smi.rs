use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{CollectorGpu, CollectorProcess};

const GPU_CSV_FIELD_COUNT: usize = 16;
const COMPUTE_APPS_FIELD_COUNT: usize = 4;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct NvidiaSmiOutputs<'a> {
    pub gpu_csv: &'a str,
    pub compute_apps_csv: Option<&'a str>,
    pub pmon: Option<&'a str>,
    pub dmon: Option<&'a str>,
    pub ps: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NvidiaSmiParseResult {
    pub gpus: Vec<CollectorGpu>,
    pub warnings: Vec<String>,
    pub gpu_supplements: Vec<GpuSupplement>,
    pub dmon_samples: Vec<DmonSample>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GpuSupplement {
    pub index: i64,
    pub uuid: String,
    pub pci_bus_id: Option<String>,
    pub driver_version: Option<String>,
    pub graphics_clock_mhz: Option<i64>,
    pub memory_clock_mhz: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DmonSample {
    pub gpu_index: i64,
    pub power_draw_watt: Option<f64>,
    pub temperature_celsius: Option<f64>,
    pub gpu_utilization_percent: Option<f64>,
    pub memory_utilization_percent: Option<f64>,
    pub graphics_clock_mhz: Option<i64>,
    pub memory_clock_mhz: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PsProcessInfo {
    pub pid: i64,
    pub ppid: Option<i64>,
    pub user: Option<String>,
    pub comm: Option<String>,
    pub args: Option<String>,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
    pub elapsed: Option<String>,
}

#[derive(Debug, Clone)]
struct GpuRow {
    gpu: CollectorGpu,
    driver_version: Option<String>,
    pci_bus_id: Option<String>,
    graphics_clock_mhz: Option<i64>,
    memory_clock_mhz: Option<i64>,
}

#[derive(Debug, Clone)]
struct ProcessRow {
    gpu_uuid: Option<String>,
    gpu_index: Option<i64>,
    process: CollectorProcess,
}

#[derive(Debug, Clone, Copy)]
struct PmonHeader {
    gpu_index: usize,
    pid: usize,
    fb: Option<usize>,
    sm: Option<usize>,
    command: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
struct DmonHeader {
    gpu_index: usize,
    power: Option<usize>,
    gpu_temperature: Option<usize>,
    sm: Option<usize>,
    memory: Option<usize>,
    memory_clock: Option<usize>,
    graphics_clock: Option<usize>,
}

pub fn parse_nvidia_smi_outputs(
    outputs: NvidiaSmiOutputs<'_>,
) -> Result<NvidiaSmiParseResult, AppError> {
    let mut warnings = Vec::new();
    let mut rows = parse_gpu_csv(outputs.gpu_csv, &mut warnings)?;
    let compute_processes =
        parse_compute_apps_csv(outputs.compute_apps_csv.unwrap_or_default(), &mut warnings);
    attach_compute_processes(&mut rows, compute_processes);

    if let Some(pmon) = outputs.pmon {
        let pmon_processes = parse_pmon(pmon, &mut warnings);
        attach_pmon_processes(&mut rows, pmon_processes);
    }

    if let Some(ps) = outputs.ps {
        let ps_info = parse_ps_enrichment(ps, &mut warnings);
        enrich_processes(&mut rows, &ps_info);
    }

    let dmon_samples = outputs
        .dmon
        .map(|raw| parse_dmon(raw, &mut warnings))
        .unwrap_or_default();
    apply_dmon_samples(&mut rows, &dmon_samples);

    let gpu_supplements: Vec<GpuSupplement> = rows
        .iter()
        .map(|row| GpuSupplement {
            index: row.gpu.index,
            uuid: row.gpu.uuid.clone(),
            pci_bus_id: row.pci_bus_id.clone(),
            driver_version: row.driver_version.clone(),
            graphics_clock_mhz: row.graphics_clock_mhz,
            memory_clock_mhz: row.memory_clock_mhz,
        })
        .collect();
    let mut gpus: Vec<CollectorGpu> = rows
        .into_iter()
        .map(|mut row| {
            row.gpu.process_count = row.gpu.processes.len() as i64;
            row.gpu
        })
        .collect();
    gpus.sort_by_key(|gpu| gpu.index);

    Ok(NvidiaSmiParseResult {
        gpus,
        warnings,
        gpu_supplements,
        dmon_samples,
    })
}

pub fn parse_ps_enrichment(raw: &str, warnings: &mut Vec<String>) -> HashMap<i64, PsProcessInfo> {
    let mut processes = HashMap::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("PID") || trimmed.starts_with("#") {
            continue;
        }
        let parts: Vec<&str> = trimmed.splitn(8, '|').map(str::trim).collect();
        if parts.len() != 8 {
            warnings.push(format!(
                "ps line {} ignored: expected 8 fields",
                line_number + 1
            ));
            continue;
        }
        let Some(pid) = parse_i64_optional(parts[0], "ps.pid", warnings).flatten() else {
            warnings.push(format!("ps line {} ignored: missing pid", line_number + 1));
            continue;
        };
        processes.insert(
            pid,
            PsProcessInfo {
                pid,
                ppid: parse_i64_optional(parts[1], "ps.ppid", warnings).flatten(),
                user: parse_string_optional(parts[2]),
                comm: parse_string_optional(parts[3]),
                args: parse_string_optional(parts[4]),
                cpu_percent: parse_f64_optional(parts[5], "ps.cpu_percent", warnings).flatten(),
                memory_percent: parse_f64_optional(parts[6], "ps.memory_percent", warnings)
                    .flatten(),
                elapsed: parse_string_optional(parts[7]),
            },
        );
    }
    processes
}

fn parse_gpu_csv(raw: &str, warnings: &mut Vec<String>) -> Result<Vec<GpuRow>, AppError> {
    let mut rows = Vec::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if fields.len() != GPU_CSV_FIELD_COUNT {
            return Err(AppError::new(
                "collector",
                "nvidia_smi_gpu_csv_malformed",
                format!(
                    "GPU CSV line {} has {} fields; expected {}",
                    line_number + 1,
                    fields.len(),
                    GPU_CSV_FIELD_COUNT
                ),
            ));
        }

        let index = parse_required_i64(fields[0], "index", line_number + 1)?;
        let uuid = parse_required_string(fields[1], "uuid", line_number + 1)?;
        let pci_bus_id = parse_string_optional(fields[2]);
        let name = parse_required_string(fields[3], "name", line_number + 1)?;
        let driver_version = parse_string_optional(fields[4]);

        rows.push(GpuRow {
            gpu: CollectorGpu {
                index,
                uuid,
                name,
                memory_total_mib: parse_i64_optional(fields[5], "memory.total", warnings).flatten(),
                memory_used_mib: parse_i64_optional(fields[6], "memory.used", warnings).flatten(),
                memory_free_mib: parse_i64_optional(fields[7], "memory.free", warnings).flatten(),
                gpu_utilization_percent: parse_f64_optional(fields[8], "utilization.gpu", warnings)
                    .flatten(),
                memory_utilization_percent: parse_f64_optional(
                    fields[9],
                    "utilization.memory",
                    warnings,
                )
                .flatten(),
                temperature_celsius: parse_f64_optional(fields[10], "temperature.gpu", warnings)
                    .flatten(),
                power_draw_watt: parse_f64_optional(fields[11], "power.draw", warnings).flatten(),
                power_limit_watt: parse_f64_optional(fields[12], "power.limit", warnings).flatten(),
                fan_speed_percent: parse_f64_optional(fields[13], "fan.speed", warnings).flatten(),
                process_count: 0,
                processes: Vec::new(),
            },
            driver_version,
            pci_bus_id,
            graphics_clock_mhz: parse_i64_optional(fields[14], "clocks.current.graphics", warnings)
                .flatten(),
            memory_clock_mhz: parse_i64_optional(fields[15], "clocks.current.memory", warnings)
                .flatten(),
        });
    }

    if rows.is_empty() {
        return Err(AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            "GPU CSV did not contain any GPU rows",
        ));
    }

    Ok(rows)
}

fn parse_compute_apps_csv(raw: &str, warnings: &mut Vec<String>) -> Vec<ProcessRow> {
    let mut rows = Vec::new();
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if fields.len() != COMPUTE_APPS_FIELD_COUNT {
            warnings.push(format!(
                "compute-apps CSV line {} ignored: expected {} fields",
                line_number + 1,
                COMPUTE_APPS_FIELD_COUNT
            ));
            continue;
        }
        let Some(pid) = parse_i64_optional(fields[1], "compute_apps.pid", warnings).flatten()
        else {
            warnings.push(format!(
                "compute-apps CSV line {} ignored: missing pid",
                line_number + 1
            ));
            continue;
        };
        rows.push(ProcessRow {
            gpu_uuid: parse_string_optional(fields[0]),
            gpu_index: None,
            process: CollectorProcess {
                pid,
                username: None,
                command: parse_string_optional(fields[2]),
                gpu_memory_used_mib: parse_i64_optional(
                    fields[3],
                    "compute_apps.used_gpu_memory",
                    warnings,
                )
                .flatten(),
                gpu_utilization_percent: None,
                cpu_percent: None,
                host_memory_used_mib: None,
            },
        });
    }
    rows
}

fn parse_pmon(raw: &str, warnings: &mut Vec<String>) -> Vec<ProcessRow> {
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
            fb: Some(3),
            sm: Some(4),
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
        let gpu_memory_used_mib = pmon_header
            .fb
            .and_then(|index| get_pmon_field(&parts, index))
            .and_then(|value| parse_i64_optional(value, "pmon.fb", warnings).flatten());
        let gpu_utilization_percent = pmon_header
            .sm
            .and_then(|index| get_pmon_field(&parts, index))
            .and_then(|value| parse_f64_optional(value, "pmon.sm", warnings).flatten());
        rows.push(ProcessRow {
            gpu_uuid: None,
            gpu_index: Some(gpu_index),
            process: CollectorProcess {
                pid,
                username: None,
                command: pmon_header
                    .command
                    .and_then(|index| get_pmon_field(&parts, index))
                    .and_then(parse_string_optional),
                gpu_memory_used_mib,
                gpu_utilization_percent,
                cpu_percent: None,
                host_memory_used_mib: None,
            },
        });
    }
    rows
}

fn parse_pmon_header(line: &str) -> Option<PmonHeader> {
    let columns: Vec<&str> = line.trim_start_matches('#').split_whitespace().collect();
    let gpu_index = columns.iter().position(|column| *column == "gpu")?;
    let pid = columns.iter().position(|column| *column == "pid")?;
    Some(PmonHeader {
        gpu_index,
        pid,
        fb: columns.iter().position(|column| *column == "fb"),
        sm: columns.iter().position(|column| *column == "sm"),
        command: columns.iter().position(|column| *column == "command"),
    })
}

fn get_pmon_field<'a>(parts: &'a [&str], index: usize) -> Option<&'a str> {
    parts.get(index).copied()
}

fn parse_dmon(raw: &str, warnings: &mut Vec<String>) -> Vec<DmonSample> {
    let mut samples = Vec::new();
    let mut header = None;
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('#') || trimmed.starts_with("gpu") {
            header = parse_dmon_header(trimmed);
            continue;
        }
        let normalized = trimmed.replace(',', " ");
        let parts: Vec<&str> = normalized.split_whitespace().collect();
        let dmon_header = header.unwrap_or_else(|| detect_dmon_header(parts.len()));
        let required_len = dmon_header
            .graphics_clock
            .or(dmon_header.memory_clock)
            .or(dmon_header.memory)
            .or(dmon_header.sm)
            .or(dmon_header.gpu_temperature)
            .or(dmon_header.power)
            .unwrap_or(dmon_header.gpu_index)
            + 1;
        if parts.len() < required_len {
            warnings.push(format!(
                "dmon line {} ignored: expected at least {} fields",
                line_number + 1,
                required_len
            ));
            continue;
        }
        let Some(gpu_index) = get_dmon_field(&parts, Some(dmon_header.gpu_index))
            .and_then(|value| parse_i64_optional(value, "dmon.gpu", warnings).flatten())
        else {
            warnings.push(format!(
                "dmon line {} ignored: missing GPU index",
                line_number + 1
            ));
            continue;
        };
        samples.push(DmonSample {
            gpu_index,
            power_draw_watt: get_dmon_field(&parts, dmon_header.power)
                .and_then(|value| parse_f64_optional(value, "dmon.power", warnings).flatten()),
            temperature_celsius: get_dmon_field(&parts, dmon_header.gpu_temperature).and_then(
                |value| parse_f64_optional(value, "dmon.gpu_temperature", warnings).flatten(),
            ),
            gpu_utilization_percent: get_dmon_field(&parts, dmon_header.sm)
                .and_then(|value| parse_f64_optional(value, "dmon.sm", warnings).flatten()),
            memory_utilization_percent: get_dmon_field(&parts, dmon_header.memory)
                .and_then(|value| parse_f64_optional(value, "dmon.memory", warnings).flatten()),
            memory_clock_mhz: get_dmon_field(&parts, dmon_header.memory_clock).and_then(|value| {
                parse_i64_optional(value, "dmon.memory_clock", warnings).flatten()
            }),
            graphics_clock_mhz: get_dmon_field(&parts, dmon_header.graphics_clock).and_then(
                |value| parse_i64_optional(value, "dmon.graphics_clock", warnings).flatten(),
            ),
        });
    }
    samples
}

fn parse_dmon_header(line: &str) -> Option<DmonHeader> {
    let normalized = line.trim_start_matches('#').replace(',', " ");
    let columns: Vec<&str> = normalized.split_whitespace().collect();
    let gpu_index = columns.iter().position(|column| *column == "gpu")?;
    Some(DmonHeader {
        gpu_index,
        power: columns
            .iter()
            .position(|column| *column == "pwr" || *column == "power"),
        gpu_temperature: columns
            .iter()
            .position(|column| *column == "gtemp" || *column == "temperature"),
        sm: columns.iter().position(|column| *column == "sm"),
        memory: columns.iter().position(|column| *column == "mem"),
        memory_clock: columns.iter().position(|column| *column == "mclk"),
        graphics_clock: columns.iter().position(|column| *column == "pclk"),
    })
}

fn detect_dmon_header(field_count: usize) -> DmonHeader {
    let (memory_clock, graphics_clock) = if field_count >= 15 { (10, 11) } else { (8, 9) };
    DmonHeader {
        gpu_index: 0,
        power: Some(1),
        gpu_temperature: Some(2),
        sm: Some(4),
        memory: Some(5),
        memory_clock: Some(memory_clock),
        graphics_clock: Some(graphics_clock),
    }
}

fn get_dmon_field<'a>(parts: &'a [&str], index: Option<usize>) -> Option<&'a str> {
    index.and_then(|index| parts.get(index).copied())
}

fn attach_compute_processes(rows: &mut [GpuRow], processes: Vec<ProcessRow>) {
    for process in processes {
        if let Some(gpu_uuid) = process.gpu_uuid {
            if let Some(row) = rows.iter_mut().find(|row| row.gpu.uuid == gpu_uuid) {
                upsert_process(&mut row.gpu.processes, process.process);
            }
        }
    }
}

fn attach_pmon_processes(rows: &mut [GpuRow], processes: Vec<ProcessRow>) {
    for process in processes {
        if let Some(gpu_index) = process.gpu_index {
            if let Some(row) = rows.iter_mut().find(|row| row.gpu.index == gpu_index) {
                upsert_process(&mut row.gpu.processes, process.process);
            }
        }
    }
}

fn enrich_processes(rows: &mut [GpuRow], ps_info: &HashMap<i64, PsProcessInfo>) {
    for row in rows {
        for process in &mut row.gpu.processes {
            if let Some(info) = ps_info.get(&process.pid) {
                process.username = info.user.clone();
                process.command = info
                    .args
                    .clone()
                    .or_else(|| info.comm.clone())
                    .or(process.command.clone());
                process.cpu_percent = info.cpu_percent;
            }
        }
    }
}

fn apply_dmon_samples(rows: &mut [GpuRow], samples: &[DmonSample]) {
    for sample in samples {
        if let Some(row) = rows
            .iter_mut()
            .find(|row| row.gpu.index == sample.gpu_index)
        {
            row.gpu.power_draw_watt = row.gpu.power_draw_watt.or(sample.power_draw_watt);
            row.gpu.temperature_celsius =
                row.gpu.temperature_celsius.or(sample.temperature_celsius);
            row.gpu.gpu_utilization_percent = row
                .gpu
                .gpu_utilization_percent
                .or(sample.gpu_utilization_percent);
            row.gpu.memory_utilization_percent = row
                .gpu
                .memory_utilization_percent
                .or(sample.memory_utilization_percent);
        }
    }
}

fn upsert_process(processes: &mut Vec<CollectorProcess>, incoming: CollectorProcess) {
    if let Some(existing) = processes
        .iter_mut()
        .find(|process| process.pid == incoming.pid)
    {
        existing.command = existing.command.clone().or(incoming.command);
        existing.gpu_memory_used_mib = existing
            .gpu_memory_used_mib
            .or(incoming.gpu_memory_used_mib);
        existing.gpu_utilization_percent = existing
            .gpu_utilization_percent
            .or(incoming.gpu_utilization_percent);
    } else {
        processes.push(incoming);
    }
}

fn parse_required_string(value: &str, field: &str, line_number: usize) -> Result<String, AppError> {
    parse_string_optional(value).ok_or_else(|| {
        AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            format!("GPU CSV line {line_number} has missing required field {field}"),
        )
    })
}

fn parse_required_i64(value: &str, field: &str, line_number: usize) -> Result<i64, AppError> {
    clean_numeric(value).parse::<i64>().map_err(|err| {
        AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            format!("GPU CSV line {line_number} has invalid required field {field}: {err}"),
        )
    })
}

fn parse_string_optional(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if is_unknown(trimmed) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_i64_optional(value: &str, field: &str, warnings: &mut Vec<String>) -> Option<Option<i64>> {
    let trimmed = value.trim();
    if is_unknown(trimmed) {
        return Some(None);
    }
    match clean_numeric(trimmed).parse::<i64>() {
        Ok(parsed) => Some(Some(parsed)),
        Err(_) => {
            warnings.push(format!("unsupported numeric value for {field}: {trimmed}"));
            Some(None)
        }
    }
}

fn parse_f64_optional(value: &str, field: &str, warnings: &mut Vec<String>) -> Option<Option<f64>> {
    let trimmed = value.trim();
    if is_unknown(trimmed) {
        return Some(None);
    }
    match clean_numeric(trimmed).parse::<f64>() {
        Ok(parsed) => Some(Some(parsed)),
        Err(_) => {
            warnings.push(format!("unsupported numeric value for {field}: {trimmed}"));
            Some(None)
        }
    }
}

fn clean_numeric(value: &str) -> &str {
    value
        .trim()
        .trim_end_matches("MiB")
        .trim_end_matches('%')
        .trim_end_matches('W')
        .trim_end_matches("MHz")
        .trim()
}

fn is_unknown(value: &str) -> bool {
    value.is_empty()
        || value.eq_ignore_ascii_case("N/A")
        || value == "-"
        || value == "[Not Supported]"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_rtx_5090_outputs_parse() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../fixtures/nvidia-smi/compute_apps_rtx_5090.csv"
            )),
            pmon: Some(include_str!("../fixtures/nvidia-smi/pmon_rtx_5090.txt")),
            dmon: Some(include_str!("../fixtures/nvidia-smi/dmon_rtx_5090.txt")),
            ps: Some(include_str!("../fixtures/nvidia-smi/ps_rtx_5090.txt")),
        })
        .expect("normal fixtures parse");

        assert_eq!(result.gpus.len(), 2);
        assert!(result.warnings.is_empty());
        assert_eq!(result.gpus[0].name, "NVIDIA GeForce RTX 5090");
        assert_eq!(result.gpus[0].memory_total_mib, Some(32607));
        assert_eq!(result.gpus[0].process_count, 2);
        assert_eq!(
            result.gpus[0].processes[0].username.as_deref(),
            Some("alice")
        );
        assert_eq!(result.gpus[0].processes[0].cpu_percent, Some(97.5));
        assert_eq!(
            result.gpus[0].processes[1].command.as_deref(),
            Some("gnome-shell")
        );
        assert_eq!(
            result.gpu_supplements[0].driver_version.as_deref(),
            Some("575.64.03")
        );
        assert_eq!(result.gpu_supplements[0].graphics_clock_mhz, Some(2850));
        assert_eq!(result.dmon_samples.len(), 2);
    }

    #[test]
    fn unknown_values_parse_as_none() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_unknown_values.csv"),
            compute_apps_csv: Some(include_str!(
                "../fixtures/nvidia-smi/compute_apps_unknown_values.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("unknown values should not fail");

        let gpu = &result.gpus[0];
        assert_eq!(gpu.memory_used_mib, None);
        assert_eq!(gpu.power_draw_watt, None);
        assert_eq!(gpu.fan_speed_percent, None);
        assert_eq!(gpu.processes[0].gpu_memory_used_mib, None);
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("utilization.gpu")));
    }

    #[test]
    fn empty_compute_apps_output_is_empty_process_list() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../fixtures/nvidia-smi/compute_apps_empty.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("empty compute output should parse");

        assert!(result.gpus.iter().all(|gpu| gpu.process_count == 0));
    }

    #[test]
    fn pmon_graphics_only_process_is_included() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            pmon: Some(include_str!(
                "../fixtures/nvidia-smi/pmon_graphics_only.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("pmon graphics process should parse");

        assert_eq!(result.gpus[0].process_count, 1);
        let process = &result.gpus[0].processes[0];
        assert_eq!(process.command.as_deref(), Some("gnome-shell"));
        assert_eq!(process.gpu_memory_used_mib, Some(312));
    }

    #[test]
    fn pmon_live_um_graphics_only_process_uses_header_for_fb_memory() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            pmon: Some(include_str!(
                "../fixtures/nvidia-smi/pmon_live_um_graphics_only.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("live-like pmon output should parse");

        assert_eq!(result.gpus[0].process_count, 1);
        let process = &result.gpus[0].processes[0];
        assert_eq!(process.command.as_deref(), Some("gnome-shell"));
        assert_eq!(process.gpu_memory_used_mib, Some(6));
        assert_eq!(process.gpu_utilization_percent, None);
    }

    #[test]
    fn malformed_base_gpu_csv_returns_typed_error() {
        let error = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_malformed.csv"),
            ..NvidiaSmiOutputs::default()
        })
        .expect_err("malformed base GPU CSV should fail");

        assert_eq!(error.layer, "collector");
        assert_eq!(error.error_type, "nvidia_smi_gpu_csv_malformed");
    }

    #[test]
    fn optional_malformed_dmon_collects_warning_without_blocking() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            dmon: Some(include_str!("../fixtures/nvidia-smi/dmon_malformed.txt")),
            ..NvidiaSmiOutputs::default()
        })
        .expect("base GPU CSV should still parse");

        assert_eq!(result.gpus.len(), 2);
        assert!(result.dmon_samples.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("dmon line")));
    }

    #[test]
    fn dmon_live_pucm_noheader_uses_long_csv_clock_indices() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            dmon: Some(include_str!(
                "../fixtures/nvidia-smi/dmon_live_pucm_noheader.csv"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("live-like dmon output should parse");

        assert_eq!(result.dmon_samples.len(), 1);
        let sample = &result.dmon_samples[0];
        assert_eq!(sample.gpu_index, 0);
        assert_eq!(sample.power_draw_watt, Some(15.0));
        assert_eq!(sample.temperature_celsius, Some(34.0));
        assert_eq!(sample.gpu_utilization_percent, Some(0.0));
        assert_eq!(sample.memory_utilization_percent, Some(0.0));
        assert_eq!(sample.memory_clock_mhz, Some(405));
        assert_eq!(sample.graphics_clock_mhz, Some(28));
    }

    #[test]
    fn disappeared_pid_does_not_panic_or_drop_process() {
        let result = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
            gpu_csv: include_str!("../fixtures/nvidia-smi/gpu_csv_rtx_5090.csv"),
            compute_apps_csv: Some(include_str!(
                "../fixtures/nvidia-smi/compute_apps_disappeared_pid.csv"
            )),
            ps: Some(include_str!(
                "../fixtures/nvidia-smi/ps_disappeared_pid.txt"
            )),
            ..NvidiaSmiOutputs::default()
        })
        .expect("missing ps enrichment should not fail");

        assert_eq!(result.gpus[0].process_count, 1);
        assert_eq!(result.gpus[0].processes[0].pid, 424242);
        assert_eq!(result.gpus[0].processes[0].username, None);
        assert_eq!(
            result.gpus[0].processes[0].command.as_deref(),
            Some("python vanished.py")
        );
    }
}
