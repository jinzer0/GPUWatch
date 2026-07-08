mod dmon;
mod gpu;
mod helpers;
mod merge;
mod pcie;
mod processes;
mod types;

use crate::error::AppError;

use dmon::{apply_dmon_samples, parse_dmon};
use gpu::{apply_gpu_extra_csv, apply_mig_list, parse_gpu_csv};
use merge::finalize_result;
use pcie::{apply_pcie_samples, parse_dmon_pcie};
use processes::{
    attach_compute_processes, attach_pmon_processes, enrich_processes, parse_compute_apps_csv,
    parse_pmon,
};

pub use processes::parse_ps_enrichment;
pub use types::{DmonSample, GpuSupplement, NvidiaSmiOutputs, NvidiaSmiParseResult, PsProcessInfo};

pub fn parse_nvidia_smi_outputs(
    outputs: NvidiaSmiOutputs<'_>,
) -> Result<NvidiaSmiParseResult, AppError> {
    let mut warnings = Vec::new();
    let mut rows = parse_gpu_csv(outputs.gpu_csv, &mut warnings)?;
    if let Some(gpu_extra_csv) = outputs.gpu_extra_csv {
        apply_gpu_extra_csv(&mut rows, gpu_extra_csv, &mut warnings);
    }
    if let Some(mig_list) = outputs.mig_list {
        apply_mig_list(&mut rows, mig_list);
    }
    if let Some(dmon_pcie) = outputs.dmon_pcie {
        let pcie_samples = parse_dmon_pcie(dmon_pcie, &mut warnings);
        apply_pcie_samples(&mut rows, &pcie_samples);
    }

    let compute_processes =
        parse_compute_apps_csv(outputs.compute_apps_csv.unwrap_or_default(), &mut warnings);
    attach_compute_processes(&mut rows, compute_processes);

    if let Some(pmon) = outputs.pmon {
        let pmon_processes = parse_pmon(pmon, &mut warnings);
        attach_pmon_processes(&mut rows, pmon_processes);
    }

    if let Some(ps) = outputs.ps {
        let ps_info = parse_ps_enrichment(ps, &mut warnings);
        enrich_processes(&mut rows, &ps_info);
    }

    let dmon_samples = outputs
        .dmon
        .map(|raw| parse_dmon(raw, &mut warnings))
        .unwrap_or_default();
    apply_dmon_samples(&mut rows, &dmon_samples);

    Ok(finalize_result(rows, warnings, dmon_samples))
}
