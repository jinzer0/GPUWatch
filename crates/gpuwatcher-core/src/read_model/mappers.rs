use crate::config::BUSY_MEMORY_THRESHOLD_MIB;
use crate::models::{CollectorGpu, GpuCardDto, ServerHealth, ServerHealthDto};

pub fn health_dto(health: Option<&ServerHealth>) -> ServerHealthDto {
    ServerHealthDto {
        status: health
            .map(|value| value.status.clone())
            .unwrap_or_else(|| "idle".to_string()),
        last_error_type: health.and_then(|value| value.last_error_type.clone()),
        last_error_message: health.and_then(|value| value.last_error_message.clone()),
        last_poll_started_at: health.and_then(|value| value.last_poll_started_at.clone()),
        last_poll_finished_at: health.and_then(|value| value.last_poll_finished_at.clone()),
        last_success_at: health.and_then(|value| value.last_success_at.clone()),
    }
}

pub fn gpu_is_busy(gpu: &CollectorGpu) -> bool {
    gpu.process_count > 0
        || gpu
            .memory_used_mib
            .is_some_and(|value| value > BUSY_MEMORY_THRESHOLD_MIB)
}

pub(super) fn gpu_card(gpu: &CollectorGpu) -> GpuCardDto {
    GpuCardDto {
        index: gpu.index,
        uuid: gpu.uuid.clone(),
        pci_bus_id: gpu.pci_bus_id.clone(),
        name: gpu.name.clone(),
        driver_version: gpu.driver_version.clone(),
        busy: gpu_is_busy(gpu),
        memory_total_mib: gpu.memory_total_mib,
        memory_used_mib: gpu.memory_used_mib,
        memory_free_mib: gpu.memory_free_mib,
        gpu_utilization_percent: gpu.gpu_utilization_percent,
        memory_utilization_percent: gpu.memory_utilization_percent,
        encoder_utilization_percent: gpu.encoder_utilization_percent,
        decoder_utilization_percent: gpu.decoder_utilization_percent,
        jpeg_utilization_percent: gpu.jpeg_utilization_percent,
        ofa_utilization_percent: gpu.ofa_utilization_percent,
        pcie_rx_kib_per_sec: gpu.pcie_rx_kib_per_sec,
        pcie_tx_kib_per_sec: gpu.pcie_tx_kib_per_sec,
        pcie_link_gen_current: gpu.pcie_link_gen_current,
        pcie_link_width_current: gpu.pcie_link_width_current,
        mig_mode_current: gpu.mig_mode_current.clone(),
        mig_mode_pending: gpu.mig_mode_pending.clone(),
        mig_instance_count: gpu.mig_instance_count,
        temperature_celsius: gpu.temperature_celsius,
        power_draw_watt: gpu.power_draw_watt,
        power_limit_watt: gpu.power_limit_watt,
        fan_speed_percent: gpu.fan_speed_percent,
        graphics_clock_mhz: gpu.graphics_clock_mhz,
        memory_clock_mhz: gpu.memory_clock_mhz,
        process_count: gpu.process_count,
        processes: gpu.processes.clone(),
    }
}
