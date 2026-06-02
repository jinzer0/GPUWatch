use std::collections::HashMap;

use crate::command_runner::{CommandOutput, SystemSshRunner};
use crate::config::{PROTOCOL_VERSION, SCHEMA_VERSION};
use crate::error::AppError;
use crate::models::{CollectorServerInfo, Server, SuccessEnvelope};
use crate::nvidia_smi::{parse_nvidia_smi_outputs, NvidiaSmiOutputs};
use crate::repository::now_string;

const SECTION_PREFIX: &str = "__GPUWATCH_SECTION__:";
const SECTION_END_PREFIX: &str = "__GPUWATCH_END__:";

pub async fn collect_no_install_snapshot(
    runner: &SystemSshRunner,
    server: &Server,
) -> Result<(String, SuccessEnvelope), AppError> {
    let output = runner
        .run_remote_script(server, NO_INSTALL_COLLECTOR_SCRIPT)
        .await?;
    build_no_install_snapshot_from_output(server, &output)
}

pub fn build_no_install_snapshot_from_output(
    _server: &Server,
    output: &CommandOutput,
) -> Result<(String, SuccessEnvelope), AppError> {
    let sections = parse_sections(&output.stdout)?;
    let hostname = optional_success_section(&sections, "hostname", &mut Vec::new())
        .and_then(first_non_empty_line);
    let mut warnings = Vec::new();
    let gpu_csv = required_gpu_csv(&sections)?;
    let compute_apps_csv = optional_success_section(&sections, "compute_apps_csv", &mut warnings);
    let pmon = optional_success_section(&sections, "pmon", &mut warnings);
    let dmon = optional_success_section(&sections, "dmon", &mut warnings);
    let ps = optional_success_section(&sections, "ps", &mut warnings);

    let parsed = parse_nvidia_smi_outputs(NvidiaSmiOutputs {
        gpu_csv,
        compute_apps_csv,
        pmon,
        dmon,
        ps,
    })?;
    warnings.extend(parsed.warnings);
    if !output.stderr.trim().is_empty() {
        warnings.push(format!(
            "remote script stderr: {}",
            output.stderr.trim().lines().next().unwrap_or_default()
        ));
    }

    let driver_version = parsed
        .gpu_supplements
        .iter()
        .find_map(|supplement| supplement.driver_version.clone());
    let envelope = SuccessEnvelope {
        protocol_version: PROTOCOL_VERSION,
        schema_version: SCHEMA_VERSION,
        ok: true,
        timestamp: now_string(),
        server: CollectorServerInfo {
            hostname,
            driver_version,
            cuda_version: None,
        },
        gpus: parsed.gpus,
        warnings,
    };
    let raw_json = serde_json::to_string(&envelope)?;
    Ok((raw_json, envelope))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ScriptSection {
    status: i32,
    body: String,
}

fn parse_sections(stdout: &str) -> Result<HashMap<String, ScriptSection>, AppError> {
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

fn required_gpu_csv(sections: &HashMap<String, ScriptSection>) -> Result<&str, AppError> {
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

fn optional_success_section<'a>(
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

fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn section_message(section: &ScriptSection, fallback: &str) -> String {
    section
        .body
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn contains_command_missing(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("nvidia-smi")
        && (lower.contains("not found") || lower.contains("command not found"))
}

const NO_INSTALL_COLLECTOR_SCRIPT: &str = r#"LC_ALL=C
export LC_ALL

emit_section() {
  name="$1"
  status="$2"
  body="$3"
  printf '__GPUWATCH_SECTION__:%s:%s\n' "$name" "$status"
  if [ -n "$body" ]; then
    printf '%s\n' "$body"
  fi
  printf '__GPUWATCH_END__:%s\n' "$name"
}

run_capture() {
  output="$($@ 2>&1)"
  status=$?
}

run_capture hostname
emit_section hostname "$status" "$output"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  emit_section gpu_csv 127 'nvidia-smi not found'
  emit_section compute_apps_csv 127 'nvidia-smi not found'
  emit_section pmon 127 'nvidia-smi not found'
  emit_section dmon 127 'nvidia-smi not found'
  emit_section ps 0 ''
  exit 0
fi

run_capture nvidia-smi --query-gpu=index,uuid,pci.bus_id,name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits
gpu_csv_output="$output"
emit_section gpu_csv "$status" "$gpu_csv_output"

run_capture nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_gpu_memory --format=csv,noheader,nounits
compute_apps_output="$output"
compute_apps_status="$status"
emit_section compute_apps_csv "$compute_apps_status" "$compute_apps_output"

run_capture nvidia-smi pmon -s um -c 1
pmon_output="$output"
pmon_status="$status"
emit_section pmon "$pmon_status" "$pmon_output"

run_capture nvidia-smi dmon -s pucm -c 1 --format=csv,noheader,nounit
emit_section dmon "$status" "$output"

pids=$(
  {
    if [ "$compute_apps_status" -eq 0 ]; then
      printf '%s\n' "$compute_apps_output" | awk -F, '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); if ($2 ~ /^[0-9]+$/) print $2 }'
    fi
    if [ "$pmon_status" -eq 0 ]; then
      printf '%s\n' "$pmon_output" | awk '!/^#/ && $2 ~ /^[0-9]+$/ { print $2 }'
    fi
  } | sort -n | uniq | paste -sd, -
)

case "$pids" in
  *[!0-9,]*|'')
    emit_section ps 0 ''
    ;;
  *)
    output=$(ps -p "$pids" -o pid= -o ppid= -o user= -o comm= -o pcpu= -o pmem= -o etime= -o args= 2>&1 | awk '{ args=""; for (i = 8; i <= NF; i++) { args = args (i == 8 ? "" : " ") $i } print $1 "|" $2 "|" $3 "|" $4 "|" args "|" $5 "|" $6 "|" $7 }')
    status=$?
    emit_section ps "$status" "$output"
    ;;
esac
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> Server {
        Server {
            id: "server-1".to_string(),
            name: "GPU Server".to_string(),
            host: "gpu.example.test".to_string(),
            port: 22,
            username: "gpuwatch".to_string(),
            ssh_key_path: None,
            polling_interval_seconds: 30,
            enabled: true,
            config_revision: 1,
            created_at: "2026-06-02T00:00:00Z".to_string(),
            updated_at: "2026-06-02T00:00:00Z".to_string(),
        }
    }

    fn section(name: &str, status: i32, body: &str) -> String {
        format!("__GPUWATCH_SECTION__:{name}:{status}\n{body}\n__GPUWATCH_END__:{name}\n")
    }

    fn base_gpu_csv() -> &'static str {
        "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100-SXM4-40GB, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, 1410, 1215"
    }

    fn command_output(stdout: String) -> CommandOutput {
        CommandOutput {
            stdout,
            stderr: String::new(),
        }
    }

    #[test]
    fn builds_success_envelope_from_sections() {
        let stdout = [
            section("hostname", 0, "gpu-host"),
            section("gpu_csv", 0, base_gpu_csv()),
            section("compute_apps_csv", 0, "GPU-aaaa, 1234, python, 512"),
            section("pmon", 0, "# gpu        pid  type    sm   mem   enc   dec   jpg   ofa   fb  ccpm command\n    0       1234     C    25     8     -     -     -     -  512     - python"),
            section("dmon", 0, "0, 90, 42, 0, 30, 12, 0, 0, 0, 0, 1215, 1410, 0, 0, 0"),
            section("ps", 0, "1234|1|alice|python|python train.py|10.5|2.0|01:02"),
        ]
        .concat();

        let (raw, envelope) =
            build_no_install_snapshot_from_output(&server(), &command_output(stdout))
                .expect("snapshot should build");

        assert!(raw.contains("\"ok\":true"));
        assert_eq!(envelope.protocol_version, 1);
        assert_eq!(envelope.schema_version, 1);
        assert_eq!(envelope.server.hostname.as_deref(), Some("gpu-host"));
        assert_eq!(
            envelope.server.driver_version.as_deref(),
            Some("535.129.03")
        );
        assert_eq!(envelope.gpus.len(), 1);
        assert_eq!(envelope.gpus[0].process_count, 1);
        assert_eq!(envelope.gpus[0].processes[0].pid, 1234);
        assert_eq!(
            envelope.gpus[0].processes[0].username.as_deref(),
            Some("alice")
        );
        assert!(envelope.warnings.is_empty());
    }

    #[test]
    fn optional_collection_failures_become_warnings() {
        let stdout = [
            section("hostname", 0, "gpu-host"),
            section("gpu_csv", 0, base_gpu_csv()),
            section("compute_apps_csv", 9, "compute-apps not supported"),
            section("pmon", 9, "pmon not supported"),
            section("dmon", 9, "dmon not supported"),
            section("ps", 0, ""),
        ]
        .concat();

        let (_, envelope) =
            build_no_install_snapshot_from_output(&server(), &command_output(stdout))
                .expect("base GPU success should be enough");

        assert_eq!(envelope.gpus.len(), 1);
        assert!(envelope
            .warnings
            .iter()
            .any(|warning| warning.contains("compute_apps_csv collection failed")));
        assert!(envelope
            .warnings
            .iter()
            .any(|warning| warning.contains("pmon collection failed")));
        assert!(envelope
            .warnings
            .iter()
            .any(|warning| warning.contains("dmon collection failed")));
    }

    #[test]
    fn missing_nvidia_smi_returns_app_error() {
        let stdout = [
            section("hostname", 0, "gpu-host"),
            section("gpu_csv", 127, "nvidia-smi not found"),
            section("compute_apps_csv", 127, "nvidia-smi not found"),
            section("pmon", 127, "nvidia-smi not found"),
            section("dmon", 127, "nvidia-smi not found"),
            section("ps", 0, ""),
        ]
        .concat();

        let err = build_no_install_snapshot_from_output(&server(), &command_output(stdout))
            .expect_err("missing nvidia-smi should fail base collection");

        assert_eq!(err.layer, "collector");
        assert_eq!(err.error_type, "nvidia_smi_missing");
    }

    #[test]
    fn remote_script_filters_pid_candidates_before_ps() {
        assert!(NO_INSTALL_COLLECTOR_SCRIPT.contains("$2 ~ /^[0-9]+$/"));
        assert!(NO_INSTALL_COLLECTOR_SCRIPT.contains("*[!0-9,]*|''"));
        assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("ps -p \"$compute_apps_output\""));
    }

    fn live_tml_server_config() -> Option<Server> {
        let raw_target = std::env::var("GPUWATCHER_LIVE_SSH_TARGET").ok()?;
        let target = raw_target.trim();
        if target != "tml-server" {
            return None;
        }

        let (configured_user, host) = target
            .split_once('@')
            .map(|(user, host)| (Some(user.to_string()), host.to_string()))
            .unwrap_or((None, target.to_string()));
        let ssh_config = std::process::Command::new("ssh")
            .args(["-G", &host])
            .output()
            .expect("ssh -G should run for live target");
        assert!(
            ssh_config.status.success(),
            "ssh -G failed for {host}: {}",
            String::from_utf8_lossy(&ssh_config.stderr)
        );
        let config = String::from_utf8_lossy(&ssh_config.stdout);
        let username = configured_user
            .or_else(|| ssh_config_value(&config, "user"))
            .expect("live SSH target must resolve a user");
        let port = ssh_config_value(&config, "port")
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(22);

        Some(Server {
            id: "live-tml-server".to_string(),
            name: "Live tml-server".to_string(),
            host,
            port,
            username,
            ssh_key_path: None,
            polling_interval_seconds: 30,
            enabled: true,
            config_revision: 1,
            created_at: "2026-06-02T00:00:00Z".to_string(),
            updated_at: "2026-06-02T00:00:00Z".to_string(),
        })
    }

    fn ssh_config_value(config: &str, key: &str) -> Option<String> {
        config.lines().find_map(|line| {
            let (line_key, value) = line.split_once(' ')?;
            (line_key == key).then(|| value.trim().to_string())
        })
    }

    #[tokio::test]
    #[ignore]
    async fn live_tml_server() {
        let Some(server) = live_tml_server_config() else {
            eprintln!("skipping: GPUWATCHER_LIVE_SSH_TARGET must be exactly tml-server");
            return;
        };
        assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("gpuwatcher"));
        assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("nvitop"));
        assert!(!NO_INSTALL_COLLECTOR_SCRIPT.contains("python"));

        let runner = SystemSshRunner;
        let (raw_json, envelope) = collect_no_install_snapshot(&runner, &server)
            .await
            .expect("live no-install collection should succeed");
        let gpu = envelope
            .gpus
            .iter()
            .find(|gpu| gpu.uuid == "GPU-4ce68a8b-2e61-7620-a3d0-ed8714a21d30")
            .expect("live tml-server should expose the expected RTX 5090 UUID");

        assert_eq!(gpu.name, "NVIDIA GeForce RTX 5090");
        assert_eq!(
            envelope.server.driver_version.as_deref(),
            Some("570.211.01")
        );
        assert!(!envelope.gpus.is_empty());
        println!(
            "live_tml_server host={} user={} port={} hostname={:?} gpu_count={} gpu_name={} uuid={} driver={:?} warnings={:?}",
            server.host,
            server.username,
            server.port,
            envelope.server.hostname,
            envelope.gpus.len(),
            gpu.name,
            gpu.uuid,
            envelope.server.driver_version,
            envelope.warnings
        );
        println!("live_tml_server raw_json={raw_json}");
    }

    #[tokio::test]
    #[ignore]
    async fn live_tml_server_processes() {
        let Some(server) = live_tml_server_config() else {
            eprintln!("skipping: GPUWATCHER_LIVE_SSH_TARGET must be exactly tml-server");
            return;
        };

        let runner = SystemSshRunner;
        let (_, envelope) = collect_no_install_snapshot(&runner, &server)
            .await
            .expect("live process collection should degrade without snapshot failure");
        let process_count: i64 = envelope.gpus.iter().map(|gpu| gpu.process_count).sum();
        let process_rows: usize = envelope.gpus.iter().map(|gpu| gpu.processes.len()).sum();

        assert!(!envelope.gpus.is_empty());
        assert!(envelope.gpus.iter().all(|gpu| gpu.process_count >= 0));
        assert_eq!(process_count as usize, process_rows);
        println!(
            "live_tml_server_processes gpu_count={} process_count={} warnings={:?}",
            envelope.gpus.len(),
            process_count,
            envelope.warnings
        );
        for gpu in &envelope.gpus {
            println!(
                "live_tml_server_processes gpu={} uuid={} processes={:?}",
                gpu.index, gpu.uuid, gpu.processes
            );
        }
    }
}
