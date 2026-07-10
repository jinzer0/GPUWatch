use crate::models::{CollectorGpu, CollectorProcess};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct NvidiaSmiOutputs<'a> {
    pub gpu_csv: &'a str,
    pub compute_apps_csv: Option<&'a str>,
    pub gpu_extra_csv: Option<&'a str>,
    pub mig_list: Option<&'a str>,
    pub pmon: Option<&'a str>,
    pub dmon: Option<&'a str>,
    pub dmon_pcie: Option<&'a str>,
    pub ps: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NvidiaSmiParseResult {
    pub gpus: Vec<CollectorGpu>,
    pub warnings: Vec<String>,
    pub gpu_supplements: Vec<GpuSupplement>,
    pub dmon_samples: Vec<DmonSample>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GpuSupplement {
    pub index: i64,
    pub uuid: String,
    pub pci_bus_id: Option<String>,
    pub driver_version: Option<String>,
    pub graphics_clock_mhz: Option<i64>,
    pub memory_clock_mhz: Option<i64>,
    pub pcie_link_gen_current: Option<i64>,
    pub pcie_link_width_current: Option<i64>,
    pub mig_mode_current: Option<String>,
    pub mig_mode_pending: Option<String>,
    pub mig_instance_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DmonSample {
    pub gpu_index: i64,
    pub power_draw_watt: Option<f64>,
    pub temperature_celsius: Option<f64>,
    pub gpu_utilization_percent: Option<f64>,
    pub memory_utilization_percent: Option<f64>,
    pub graphics_clock_mhz: Option<i64>,
    pub memory_clock_mhz: Option<i64>,
    pub encoder_utilization_percent: Option<f64>,
    pub decoder_utilization_percent: Option<f64>,
    pub jpeg_utilization_percent: Option<f64>,
    pub ofa_utilization_percent: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PsProcessInfo {
    pub pid: i64,
    pub ppid: Option<i64>,
    pub user: Option<String>,
    pub comm: Option<String>,
    pub args: Option<String>,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
    pub runtime_seconds: Option<i64>,
    pub elapsed: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct GpuRow {
    pub(super) gpu: CollectorGpu,
    pub(super) driver_version: Option<String>,
    pub(super) pci_bus_id: Option<String>,
    pub(super) graphics_clock_mhz: Option<i64>,
    pub(super) memory_clock_mhz: Option<i64>,
}

#[derive(Debug, Clone)]
pub(super) struct ProcessRow {
    pub(super) gpu_uuid: Option<String>,
    pub(super) gpu_index: Option<i64>,
    pub(super) process: CollectorProcess,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct PmonHeader {
    pub(super) gpu_index: usize,
    pub(super) pid: usize,
    pub(super) process_type: Option<usize>,
    pub(super) fb: Option<usize>,
    pub(super) sm: Option<usize>,
    pub(super) memory: Option<usize>,
    pub(super) encoder: Option<usize>,
    pub(super) decoder: Option<usize>,
    pub(super) command: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct DmonHeader {
    pub(super) gpu_index: usize,
    pub(super) power: Option<usize>,
    pub(super) gpu_temperature: Option<usize>,
    pub(super) sm: Option<usize>,
    pub(super) memory: Option<usize>,
    pub(super) encoder: Option<usize>,
    pub(super) decoder: Option<usize>,
    pub(super) jpeg: Option<usize>,
    pub(super) ofa: Option<usize>,
    pub(super) memory_clock: Option<usize>,
    pub(super) graphics_clock: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct PcieSample {
    pub(super) gpu_index: i64,
    pub(super) rx_kib_per_sec: Option<i64>,
    pub(super) tx_kib_per_sec: Option<i64>,
}
