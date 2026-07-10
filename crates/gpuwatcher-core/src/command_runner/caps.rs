use crate::error::AppError;

pub(super) fn capped_utf8(bytes: &[u8], cap: usize, stream: &str) -> Result<String, AppError> {
    if bytes.len() > cap {
        return Err(AppError::new(
            "remote_command",
            "remote_command_failed",
            format!("{stream} exceeded {cap} byte capture limit"),
        ));
    }
    Ok(String::from_utf8_lossy(bytes).to_string())
}
