use crate::diagnostics::sanitize_diagnostic_excerpt;
use crate::error::AppError;

pub fn classify_ssh_failure(exit_code: Option<i32>, stderr: &str) -> AppError {
    let detail = stderr.trim();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("permission denied")
        || lower.contains("publickey")
        || lower.contains("enter passphrase for key")
        || lower.contains("read_passphrase")
    {
        return AppError::new(
            "transport_ssh",
            "ssh_auth_failed",
            safe_message(detail, "SSH authentication failed"),
        );
    }
    if lower.contains("host key verification failed")
        || lower.contains("remote host identification has changed")
    {
        return AppError::new(
            "transport_ssh",
            "ssh_host_key_failed",
            safe_message(detail, "SSH host key check failed"),
        );
    }
    if lower.contains("operation timed out") || lower.contains("connection timed out") {
        return AppError::new(
            "transport_ssh",
            "ssh_timeout",
            safe_message(detail, "SSH connection timed out"),
        );
    }
    if lower.contains("could not resolve hostname")
        || lower.contains("nodename nor servname")
        || lower.contains("name or service not known")
        || lower.contains("temporary failure in name resolution")
        || lower.contains("no route to host")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        return AppError::new(
            "transport_ssh",
            "ssh_unreachable",
            safe_message(detail, "SSH host is unreachable"),
        );
    }
    if exit_code == Some(127)
        || lower.contains("command not found")
        || lower.contains("gpuwatcher: not found")
    {
        return AppError::new(
            "remote_command",
            "collector_missing",
            safe_message(detail, "collector command was not found"),
        );
    }
    AppError::new(
        "remote_command",
        "remote_command_failed",
        safe_message(detail, "remote command failed"),
    )
}

fn safe_message(detail: &str, fallback: &str) -> String {
    let sanitized = sanitize_diagnostic_excerpt(detail);
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_auth_failure() {
        let err = classify_ssh_failure(Some(255), "Permission denied (publickey).");
        assert_eq!(err.layer, "transport_ssh");
        assert_eq!(err.error_type, "ssh_auth_failed");
    }

    #[test]
    fn maps_common_ssh_stderr_variants_to_stable_error_types() {
        let cases = [
            (
                Some(255),
                "Enter passphrase for key '/Users/alice/.ssh/id_ed25519':",
                "ssh_auth_failed",
            ),
            (
                Some(255),
                "read_passphrase: can't open /dev/tty: Device not configured",
                "ssh_auth_failed",
            ),
            (
                Some(255),
                "Permission denied (publickey,password).",
                "ssh_auth_failed",
            ),
            (
                Some(255),
                "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!",
                "ssh_host_key_failed",
            ),
            (
                Some(255),
                "ssh: Could not resolve hostname gpu-missing: nodename nor servname provided, or not known",
                "ssh_unreachable",
            ),
            (
                Some(255),
                "ssh: connect to host gpu.example port 22: Operation timed out",
                "ssh_timeout",
            ),
            (
                Some(255),
                "ssh: connect to host gpu.example port 22: Connection refused",
                "ssh_unreachable",
            ),
        ];

        for (exit_code, stderr, expected_type) in cases {
            let err = classify_ssh_failure(exit_code, stderr);
            assert_eq!(err.error_type, expected_type, "stderr: {stderr}");
        }
    }

    #[test]
    fn classify_ssh_failure_includes_sanitized_multiline_context() {
        let err = classify_ssh_failure(
            Some(255),
            "Permission denied (publickey).\nWARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\nOffending ECDSA key in /Users/alice/.ssh/known_hosts:42\n",
        );

        assert_eq!(err.error_type, "ssh_auth_failed");
        assert!(err.message.contains("Permission denied"));
        assert!(err.message.contains("REMOTE HOST IDENTIFICATION"));
        assert!(err.message.contains("[path redacted]"));
        assert!(!err.message.contains("/Users/alice/.ssh/known_hosts"));
    }

    #[test]
    fn classify_ssh_failure_redacts_unsafe_stderr_content() {
        let err = classify_ssh_failure(
            Some(255),
            "\u{1b}[31mPermission denied\u{1b}[0m\u{7}\n-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----\ntoken=abc123 password hunter2 secret: keepout /Users/alice/.ssh/id_ed25519\n",
        );

        assert!(err.message.contains("Permission denied"));
        assert!(err.message.contains("[private key redacted]"));
        assert!(err.message.contains("token=[redacted]"));
        assert!(err.message.contains("password=[redacted]"));
        assert!(err.message.contains("secret=[redacted]"));
        assert!(err.message.contains("[path redacted]"));
        assert!(!err.message.contains("\u{1b}"));
        assert!(!err.message.contains("\u{7}"));
        assert!(!err.message.contains("abc123"));
        assert!(!err.message.contains("hunter2"));
        assert!(!err.message.contains("keepout"));
        assert!(!err.message.contains("/Users/alice/.ssh/id_ed25519"));
    }

    #[test]
    fn maps_unreachable_failure() {
        let err = classify_ssh_failure(Some(255), "Could not resolve hostname missing-host");
        assert_eq!(err.error_type, "ssh_unreachable");
    }

    #[test]
    fn maps_host_key_failure() {
        let err = classify_ssh_failure(Some(255), "Host key verification failed.");
        assert_eq!(err.layer, "transport_ssh");
        assert_eq!(err.error_type, "ssh_host_key_failed");
    }

    #[test]
    fn maps_collector_missing() {
        let err = classify_ssh_failure(Some(127), "bash: gpuwatcher: command not found");
        assert_eq!(err.layer, "remote_command");
        assert_eq!(err.error_type, "collector_missing");
    }
}
