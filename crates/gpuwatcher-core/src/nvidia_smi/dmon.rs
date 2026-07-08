use super::helpers::{parse_f64_optional, parse_i64_optional};
use super::types::{DmonHeader, DmonSample, GpuRow};

pub(super) fn parse_dmon(raw: &str, warnings: &mut Vec<String>) -> Vec<DmonSample> {
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
            encoder_utilization_percent: get_dmon_field(&parts, dmon_header.encoder)
                .and_then(|value| parse_f64_optional(value, "dmon.encoder", warnings).flatten()),
            decoder_utilization_percent: get_dmon_field(&parts, dmon_header.decoder)
                .and_then(|value| parse_f64_optional(value, "dmon.decoder", warnings).flatten()),
            jpeg_utilization_percent: get_dmon_field(&parts, dmon_header.jpeg)
                .and_then(|value| parse_f64_optional(value, "dmon.jpeg", warnings).flatten()),
            ofa_utilization_percent: get_dmon_field(&parts, dmon_header.ofa)
                .and_then(|value| parse_f64_optional(value, "dmon.ofa", warnings).flatten()),
        });
    }
    samples
}

pub(super) fn apply_dmon_samples(rows: &mut [GpuRow], samples: &[DmonSample]) {
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
            row.graphics_clock_mhz = row.graphics_clock_mhz.or(sample.graphics_clock_mhz);
            row.memory_clock_mhz = row.memory_clock_mhz.or(sample.memory_clock_mhz);
            row.gpu.graphics_clock_mhz = row.gpu.graphics_clock_mhz.or(sample.graphics_clock_mhz);
            row.gpu.memory_clock_mhz = row.gpu.memory_clock_mhz.or(sample.memory_clock_mhz);
            row.gpu.encoder_utilization_percent = row
                .gpu
                .encoder_utilization_percent
                .or(sample.encoder_utilization_percent);
            row.gpu.decoder_utilization_percent = row
                .gpu
                .decoder_utilization_percent
                .or(sample.decoder_utilization_percent);
            row.gpu.jpeg_utilization_percent = row
                .gpu
                .jpeg_utilization_percent
                .or(sample.jpeg_utilization_percent);
            row.gpu.ofa_utilization_percent = row
                .gpu
                .ofa_utilization_percent
                .or(sample.ofa_utilization_percent);
        }
    }
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
        encoder: columns.iter().position(|column| *column == "enc"),
        decoder: columns.iter().position(|column| *column == "dec"),
        jpeg: columns.iter().position(|column| *column == "jpg"),
        ofa: columns.iter().position(|column| *column == "ofa"),
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
        encoder: Some(6),
        decoder: Some(7),
        jpeg: if field_count >= 15 { Some(8) } else { None },
        ofa: if field_count >= 15 { Some(9) } else { None },
        memory_clock: Some(memory_clock),
        graphics_clock: Some(graphics_clock),
    }
}

fn get_dmon_field<'a>(parts: &'a [&str], index: Option<usize>) -> Option<&'a str> {
    index.and_then(|index| parts.get(index).copied())
}
