use crate::config::SSH_DIAGNOSTIC_EXCERPT_CHARS;

pub(crate) fn sanitize_diagnostic_excerpt(detail: &str) -> String {
    let without_keys = redact_private_key_blocks(detail);
    let without_controls = strip_ansi_and_controls(&without_keys);
    let without_paths = redact_local_key_paths(&without_controls);
    let without_secrets = redact_secret_values(&without_paths);
    cap_visible_excerpt(&without_secrets)
}

fn redact_private_key_blocks(value: &str) -> String {
    let mut output = Vec::new();
    let mut in_key_block = false;
    for line in value.lines() {
        if line.contains("-----BEGIN ") && line.contains("PRIVATE KEY-----") {
            output.push("[private key redacted]".to_string());
            in_key_block = true;
            continue;
        }
        if in_key_block {
            if line.contains("-----END ") && line.contains("PRIVATE KEY-----") {
                in_key_block = false;
            }
            continue;
        }
        output.push(line.to_string());
    }
    output.join("\n")
}

fn strip_ansi_and_controls(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            while let Some(next) = chars.next() {
                if ('@'..='~').contains(&next) {
                    break;
                }
            }
            continue;
        }
        if ch == '\n' || ch == '\t' || !ch.is_control() {
            output.push(ch);
        }
    }
    output
}

fn redact_local_key_paths(value: &str) -> String {
    value
        .split_whitespace()
        .map(redact_path_token)
        .collect::<Vec<_>>()
        .join(" ")
}

fn redact_path_token(token: &str) -> String {
    let trimmed = token.trim_matches(|ch: char| matches!(ch, ',' | ';' | ':' | ')' | '('));
    let sensitive_path = (trimmed.starts_with('/') || trimmed.starts_with('~'))
        && (trimmed.contains("/.ssh/")
            || trimmed.contains("/.gnupg/")
            || trimmed.ends_with(".pem")
            || trimmed.ends_with(".key"));
    if sensitive_path {
        token.replace(trimmed, "[path redacted]")
    } else {
        token.to_string()
    }
}

fn redact_secret_values(value: &str) -> String {
    let mut redacted = Vec::new();
    let mut skip_next = false;
    for token in value.split_whitespace() {
        if skip_next {
            skip_next = false;
            continue;
        }
        let (replacement, consumes_next) = redact_secret_token(token);
        skip_next = consumes_next;
        redacted.push(replacement);
    }
    redacted
        .join(" ")
        .replace("[private key=[redacted]", "[private key redacted]")
}

fn redact_secret_token(token: &str) -> (String, bool) {
    let trimmed = token.trim_matches(|ch: char| matches!(ch, ',' | ';'));
    for name in [
        "access-token",
        "api-key",
        "password",
        "secret",
        "token",
        "key",
    ] {
        let prefix_eq = format!("{name}=");
        let option_prefix_eq = format!("--{name}=");
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with(&prefix_eq) || lower.starts_with(&option_prefix_eq) {
            return (
                token.replace(trimmed, &format!("{}=[redacted]", token_key(trimmed))),
                false,
            );
        }
        if lower == name || lower == format!("--{name}") || lower == format!("{name}:") {
            return (
                token.replace(trimmed, &format!("{}=[redacted]", token_key(trimmed))),
                true,
            );
        }
    }
    (token.to_string(), false)
}

fn token_key(token: &str) -> &str {
    token.split(['=', ':']).next().unwrap_or(token)
}

fn cap_visible_excerpt(value: &str) -> String {
    let normalized = value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let mut output = String::new();
    for ch in normalized.chars().take(SSH_DIAGNOSTIC_EXCERPT_CHARS) {
        output.push(ch);
    }
    if normalized.chars().count() > SSH_DIAGNOSTIC_EXCERPT_CHARS {
        output.push_str("...");
    }
    output
}
