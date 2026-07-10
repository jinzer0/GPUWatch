use crate::error::AppError;

pub(super) fn parse_required_string(
    value: &str,
    field: &str,
    line_number: usize,
) -> Result<String, AppError> {
    parse_string_optional(value).ok_or_else(|| {
        AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            format!("GPU CSV line {line_number} has missing required field {field}"),
        )
    })
}

pub(super) fn parse_required_i64(
    value: &str,
    field: &str,
    line_number: usize,
) -> Result<i64, AppError> {
    clean_numeric(value).parse::<i64>().map_err(|err| {
        AppError::new(
            "collector",
            "nvidia_smi_gpu_csv_malformed",
            format!("GPU CSV line {line_number} has invalid required field {field}: {err}"),
        )
    })
}

pub(super) fn parse_string_optional(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if is_unknown(trimmed) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn parse_i64_optional(
    value: &str,
    field: &str,
    warnings: &mut Vec<String>,
) -> Option<Option<i64>> {
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

pub(super) fn parse_f64_optional(
    value: &str,
    field: &str,
    warnings: &mut Vec<String>,
) -> Option<Option<f64>> {
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

pub(super) fn parse_elapsed_seconds(value: &str, warnings: &mut Vec<String>) -> Option<i64> {
    let trimmed = value.trim();
    if is_unknown(trimmed) {
        return None;
    }
    let (days, time_part) = if let Some((days, rest)) = trimmed.split_once('-') {
        match days.parse::<i64>() {
            Ok(days) => (days, rest),
            Err(_) => {
                warnings.push(format!("unsupported elapsed value for ps.etime: {trimmed}"));
                return None;
            }
        }
    } else {
        (0, trimmed)
    };
    let parts: Vec<&str> = time_part.split(':').collect();
    let seconds = match parts.as_slice() {
        [minutes, seconds] => {
            parse_time_pair(minutes, seconds).map(|(minutes, seconds)| minutes * 60 + seconds)
        }
        [hours, minutes, seconds] => parse_time_triple(hours, minutes, seconds)
            .map(|(hours, minutes, seconds)| hours * 3600 + minutes * 60 + seconds),
        _ => None,
    };
    match seconds {
        Some(seconds) => Some(days * 86_400 + seconds),
        None => {
            warnings.push(format!("unsupported elapsed value for ps.etime: {trimmed}"));
            None
        }
    }
}

fn parse_time_pair(minutes: &str, seconds: &str) -> Option<(i64, i64)> {
    Some((minutes.parse().ok()?, seconds.parse().ok()?))
}

fn parse_time_triple(hours: &str, minutes: &str, seconds: &str) -> Option<(i64, i64, i64)> {
    Some((
        hours.parse().ok()?,
        minutes.parse().ok()?,
        seconds.parse().ok()?,
    ))
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
