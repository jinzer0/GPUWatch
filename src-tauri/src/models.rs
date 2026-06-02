use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub ssh_key_path: Option<String>,
    pub polling_interval_seconds: i64,
    pub enabled: bool,
    pub config_revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInput {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub ssh_key_path: Option<String>,
    pub polling_interval_seconds: Option<i64>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerHealth {
    pub server_id: String,
    pub status: String,
    pub last_error_type: Option<String>,
    pub last_error_message: Option<String>,
    pub last_poll_started_at: Option<String>,
    pub last_poll_finished_at: Option<String>,
    pub last_success_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LatestSnapshot {
    pub server_id: String,
    pub protocol_version: i64,
    pub schema_version: i64,
    pub received_at: String,
    pub raw_json: String,
    pub parsed_summary_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CollectorServerInfo {
    pub hostname: Option<String>,
    pub driver_version: Option<String>,
    pub cuda_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CollectorProcess {
    pub pid: i64,
    pub username: Option<String>,
    pub command: Option<String>,
    #[serde(rename = "gpuMemoryUsedMiB")]
    pub gpu_memory_used_mib: Option<i64>,
    pub gpu_utilization_percent: Option<f64>,
    pub cpu_percent: Option<f64>,
    #[serde(rename = "hostMemoryUsedMiB")]
    pub host_memory_used_mib: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CollectorGpu {
    pub index: i64,
    pub uuid: String,
    pub name: String,
    #[serde(rename = "memoryTotalMiB")]
    pub memory_total_mib: Option<i64>,
    #[serde(rename = "memoryUsedMiB")]
    pub memory_used_mib: Option<i64>,
    #[serde(rename = "memoryFreeMiB")]
    pub memory_free_mib: Option<i64>,
    pub gpu_utilization_percent: Option<f64>,
    pub memory_utilization_percent: Option<f64>,
    pub temperature_celsius: Option<f64>,
    pub power_draw_watt: Option<f64>,
    pub power_limit_watt: Option<f64>,
    pub fan_speed_percent: Option<f64>,
    pub process_count: i64,
    pub processes: Vec<CollectorProcess>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SuccessEnvelope {
    pub protocol_version: i64,
    pub schema_version: i64,
    pub ok: bool,
    pub timestamp: String,
    pub server: CollectorServerInfo,
    pub gpus: Vec<CollectorGpu>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CollectorErrorInfo {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollectorErrorEnvelope {
    pub protocol_version: i64,
    pub schema_version: i64,
    pub ok: bool,
    pub timestamp: String,
    pub error: CollectorErrorInfo,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParsedCollectorPayload {
    Success(SuccessEnvelope),
    CollectorError(CollectorErrorEnvelope),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerHealthDto {
    pub status: String,
    pub last_error_type: Option<String>,
    pub last_error_message: Option<String>,
    pub last_poll_started_at: Option<String>,
    pub last_poll_finished_at: Option<String>,
    pub last_success_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerOverviewDto {
    pub id: String,
    pub name: String,
    pub host: String,
    pub status: String,
    pub gpu_total: i64,
    pub busy_gpu_count: i64,
    pub free_gpu_count: i64,
    pub average_gpu_utilization_percent: Option<f64>,
    pub average_memory_usage_percent: Option<f64>,
    pub max_temperature_celsius: Option<f64>,
    pub last_success_at: Option<String>,
    pub last_error_type: Option<String>,
    pub last_error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GpuCardDto {
    pub index: i64,
    pub uuid: String,
    pub name: String,
    pub busy: bool,
    #[serde(rename = "memoryTotalMiB")]
    pub memory_total_mib: Option<i64>,
    #[serde(rename = "memoryUsedMiB")]
    pub memory_used_mib: Option<i64>,
    #[serde(rename = "memoryFreeMiB")]
    pub memory_free_mib: Option<i64>,
    pub gpu_utilization_percent: Option<f64>,
    pub memory_utilization_percent: Option<f64>,
    pub temperature_celsius: Option<f64>,
    pub power_draw_watt: Option<f64>,
    pub power_limit_watt: Option<f64>,
    pub fan_speed_percent: Option<f64>,
    pub process_count: i64,
    pub processes: Vec<CollectorProcess>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerDetailDto {
    pub server: Server,
    pub health: ServerHealthDto,
    pub collector_hostname: Option<String>,
    pub driver_version: Option<String>,
    pub cuda_version: Option<String>,
    pub received_at: Option<String>,
    pub warnings: Vec<String>,
    pub gpus: Vec<GpuCardDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRowDto {
    pub server_id: String,
    pub server_name: String,
    pub stale: bool,
    pub gpu_index: i64,
    pub pid: i64,
    pub username: Option<String>,
    pub command: Option<String>,
    #[serde(rename = "gpuMemoryUsedMiB")]
    pub gpu_memory_used_mib: Option<i64>,
    pub gpu_utilization_percent: Option<f64>,
    pub cpu_percent: Option<f64>,
    #[serde(rename = "hostMemoryUsedMiB")]
    pub host_memory_used_mib: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResultDto {
    pub ok: bool,
    pub status: String,
    pub error_type: Option<String>,
    pub message: Option<String>,
}
