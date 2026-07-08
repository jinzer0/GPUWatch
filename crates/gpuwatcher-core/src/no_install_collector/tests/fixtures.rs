use crate::command_runner::CommandOutput;
use crate::models::Server;

pub(super) fn server() -> Server {
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

pub(super) fn section(name: &str, status: i32, body: &str) -> String {
    format!("__GPUWATCH_SECTION__:{name}:{status}\n{body}\n__GPUWATCH_END__:{name}\n")
}

pub(super) fn base_gpu_csv() -> &'static str {
    "0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100-SXM4-40GB, 535.129.03, 40960, 1024, 39936, 12, 4, 41, 88.50, 400.00, 30, 1410, 1215"
}

pub(super) fn command_output(stdout: String) -> CommandOutput {
    CommandOutput {
        stdout,
        stderr: String::new(),
    }
}
