use std::path::{Path, PathBuf};

pub(super) fn resolve_include_path(home: &Path, current_path: &Path, value: &str) -> PathBuf {
    if let Some(rest) = value.strip_prefix("~/") {
        return home.join(rest);
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return path.to_path_buf();
    }
    current_path
        .parent()
        .map(|parent| parent.join(path))
        .unwrap_or_else(|| path.to_path_buf())
}

pub(super) fn safe_config_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config")
        .to_string()
}
