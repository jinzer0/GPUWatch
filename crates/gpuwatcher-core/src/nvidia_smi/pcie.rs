use super::helpers::parse_i64_optional;
use super::types::{GpuRow, PcieSample};

pub(super) fn parse_dmon_pcie(raw: &str, warnings: &mut Vec<String>) -> Vec<PcieSample> {
    let mut samples = Vec::new();
    let mut header: Option<(usize, Option<usize>, Option<usize>)> = None;
    for (line_number, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('#') || trimmed.starts_with("gpu") {
            let normalized = trimmed.trim_start_matches('#').replace(',', " ");
            let columns: Vec<&str> = normalized.split_whitespace().collect();
            let gpu = columns
                .iter()
                .position(|column| *column == "gpu")
                .unwrap_or(0);
            let rx = columns
                .iter()
                .position(|column| matches!(*column, "rxpci" | "rx" | "pcie_rx"));
            let tx = columns
                .iter()
                .position(|column| matches!(*column, "txpci" | "tx" | "pcie_tx"));
            header = Some((gpu, rx, tx));
            continue;
        }
        let normalized = trimmed.replace(',', " ");
        let parts: Vec<&str> = normalized.split_whitespace().collect();
        let (gpu_index_field, rx_field, tx_field) = header.unwrap_or((0, Some(1), Some(2)));
        let Some(gpu_index) = parts
            .get(gpu_index_field)
            .and_then(|value| parse_i64_optional(value, "dmon_pcie.gpu", warnings).flatten())
        else {
            warnings.push(format!(
                "dmon_pcie line {} ignored: missing GPU index",
                line_number + 1
            ));
            continue;
        };
        samples.push(PcieSample {
            gpu_index,
            rx_kib_per_sec: rx_field
                .and_then(|index| parts.get(index))
                .and_then(|value| parse_i64_optional(value, "dmon_pcie.rxpci", warnings).flatten()),
            tx_kib_per_sec: tx_field
                .and_then(|index| parts.get(index))
                .and_then(|value| parse_i64_optional(value, "dmon_pcie.txpci", warnings).flatten()),
        });
    }
    samples
}

pub(super) fn apply_pcie_samples(rows: &mut [GpuRow], samples: &[PcieSample]) {
    for sample in samples {
        if let Some(row) = rows
            .iter_mut()
            .find(|row| row.gpu.index == sample.gpu_index)
        {
            row.gpu.pcie_rx_kib_per_sec = row.gpu.pcie_rx_kib_per_sec.or(sample.rx_kib_per_sec);
            row.gpu.pcie_tx_kib_per_sec = row.gpu.pcie_tx_kib_per_sec.or(sample.tx_kib_per_sec);
        }
    }
}
