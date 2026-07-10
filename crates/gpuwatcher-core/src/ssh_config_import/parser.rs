use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::config::{
    SSH_CONFIG_IMPORT_MAX_BYTES, SSH_CONFIG_IMPORT_MAX_DEPTH, SSH_CONFIG_IMPORT_MAX_FILES,
};
use crate::error::AppError;
use crate::models::{ServerInput, SshConfigImportCandidate, SshConfigImportResult};

mod path_utils;

use path_utils::{resolve_include_path, safe_config_name};

pub(super) fn import_from_home(home: &Path) -> Result<SshConfigImportResult, AppError> {
    let ssh_root = home.join(".ssh");
    let root_config = ssh_root.join("config");
    if !root_config.exists() {
        return Ok(SshConfigImportResult {
            candidates: Vec::new(),
            warnings: Vec::new(),
        });
    }

    let mut parser = SshConfigParser::new(home, &ssh_root)?;
    parser.read_config(&root_config, 0);
    Ok(parser.finish())
}

struct SshConfigParser {
    home: PathBuf,
    ssh_root: PathBuf,
    visited: HashSet<PathBuf>,
    files_read: usize,
    candidates: Vec<SshConfigImportCandidate>,
    warnings: Vec<String>,
}

impl SshConfigParser {
    fn new(home: &Path, ssh_root: &Path) -> Result<Self, AppError> {
        let canonical_root = ssh_root.canonicalize().map_err(|err| {
            AppError::new(
                "storage_app",
                "ssh_config_root_unreadable",
                format!("SSH config directory is not readable: {err}"),
            )
        })?;
        Ok(Self {
            home: home.to_path_buf(),
            ssh_root: canonical_root,
            visited: HashSet::new(),
            files_read: 0,
            candidates: Vec::new(),
            warnings: Vec::new(),
        })
    }

    fn finish(self) -> SshConfigImportResult {
        SshConfigImportResult {
            candidates: self.candidates,
            warnings: self.warnings,
        }
    }

    fn read_config(&mut self, path: &Path, depth: usize) {
        if depth > SSH_CONFIG_IMPORT_MAX_DEPTH {
            self.warnings
                .push("Include skipped because maximum depth was reached".to_string());
            return;
        }
        if self.files_read >= SSH_CONFIG_IMPORT_MAX_FILES {
            self.warnings
                .push("Include skipped because maximum file count was reached".to_string());
            return;
        }

        let Some(canonical_path) = self.canonical_config_path(path) else {
            return;
        };
        if !self.visited.insert(canonical_path.clone()) {
            self.push_path_warning(
                "Include skipped because it was already read",
                &canonical_path,
            );
            return;
        }

        let Ok(metadata) = fs::metadata(&canonical_path) else {
            self.push_path_warning("SSH config file could not be read", &canonical_path);
            return;
        };
        if metadata.len() > SSH_CONFIG_IMPORT_MAX_BYTES {
            self.push_path_warning(
                "SSH config file skipped because it exceeds size limit",
                &canonical_path,
            );
            return;
        }

        let Ok(raw) = fs::read_to_string(&canonical_path) else {
            self.push_path_warning("SSH config file could not be read", &canonical_path);
            return;
        };
        self.files_read += 1;
        self.parse_file(&canonical_path, &raw, depth);
    }

    fn canonical_config_path(&mut self, path: &Path) -> Option<PathBuf> {
        let canonical = match path.canonicalize() {
            Ok(path) => path,
            Err(_) => {
                self.push_path_warning(
                    "SSH config include skipped because it does not exist",
                    path,
                );
                return None;
            }
        };
        if !canonical.starts_with(&self.ssh_root) {
            self.push_path_warning(
                "SSH config include skipped because it is outside ~/.ssh",
                &canonical,
            );
            return None;
        }
        Some(canonical)
    }

    fn push_path_warning(&mut self, message: &str, path: &Path) {
        self.warnings
            .push(format!("{message}: {}", safe_config_name(path)));
    }

    fn parse_file(&mut self, path: &Path, raw: &str, depth: usize) {
        let mut current = HostBlock::default();
        for line in raw.lines() {
            let Some((keyword, values)) = parse_line(line) else {
                continue;
            };
            match keyword.as_str() {
                "host" => {
                    self.flush_host(&current);
                    current = HostBlock::from_patterns(&values);
                }
                "include" => self.read_includes(path, &values, depth),
                "hostname" => current.hostname = first_value(&values),
                "user" => current.username = first_value(&values),
                "port" => current.port = first_value(&values),
                "identityfile" => current.identity_file = first_value(&values),
                "proxyjump" => current.unsupported.push("ProxyJump"),
                "proxycommand" => current.unsupported.push("ProxyCommand"),
                _ => {}
            }
        }
        self.flush_host(&current);
    }

    fn read_includes(&mut self, current_path: &Path, values: &[String], depth: usize) {
        for value in values {
            if value.contains('*') || value.contains('?') {
                self.warnings
                    .push("Include skipped because glob patterns are unsupported".to_string());
                continue;
            }
            let include_path = resolve_include_path(&self.home, current_path, value);
            self.read_config(&include_path, depth + 1);
        }
    }

    fn flush_host(&mut self, host: &HostBlock) {
        for alias in host.importable_aliases() {
            let mut warnings = host.warnings_for(alias);
            let port = match host.port.as_deref().map(parse_port) {
                Some(Some(port)) => port,
                Some(None) => {
                    warnings.push(format!("Host {alias} has invalid Port; using 22"));
                    22
                }
                None => 22,
            };
            self.candidates.push(SshConfigImportCandidate {
                host_alias: alias.to_string(),
                hostname: host.hostname.clone(),
                draft: ServerInput {
                    id: None,
                    name: alias.to_string(),
                    host: alias.to_string(),
                    port,
                    username: host.username.clone().unwrap_or_default(),
                    ssh_key_path: host.identity_file.clone(),
                    polling_interval_seconds: None,
                    enabled: true,
                },
                warnings,
            });
        }
    }
}

#[derive(Default)]
struct HostBlock {
    aliases: Vec<String>,
    hostname: Option<String>,
    username: Option<String>,
    port: Option<String>,
    identity_file: Option<String>,
    unsupported: Vec<&'static str>,
}

impl HostBlock {
    fn from_patterns(patterns: &[String]) -> Self {
        Self {
            aliases: patterns.to_vec(),
            ..Self::default()
        }
    }

    fn importable_aliases(&self) -> impl Iterator<Item = &str> {
        self.aliases
            .iter()
            .map(String::as_str)
            .filter(|alias| is_importable_alias(alias))
    }

    fn warnings_for(&self, alias: &str) -> Vec<String> {
        self.unsupported
            .iter()
            .map(|directive| {
                format!("Host {alias} uses unsupported {directive}; import ignores it")
            })
            .collect()
    }
}

fn parse_line(line: &str) -> Option<(String, Vec<String>)> {
    let without_comment = line.split('#').next()?.trim();
    if without_comment.is_empty() {
        return None;
    }
    let mut parts = without_comment.split_whitespace();
    let keyword = parts.next()?.to_ascii_lowercase();
    let values = parts.map(unquote).collect::<Vec<_>>();
    Some((keyword, values))
}

fn first_value(values: &[String]) -> Option<String> {
    values.first().filter(|value| !value.is_empty()).cloned()
}

fn unquote(value: &str) -> String {
    value.trim_matches(['\'', '"']).to_string()
}

fn parse_port(value: &str) -> Option<i64> {
    let port = value.parse::<i64>().ok()?;
    (1..=65_535).contains(&port).then_some(port)
}

fn is_importable_alias(alias: &str) -> bool {
    !alias.is_empty()
        && !alias.starts_with(['-', '!'])
        && !alias.contains(['*', '?', '@'])
        && !alias.chars().any(char::is_whitespace)
}
