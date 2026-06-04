# Troubleshooting

## SSH Auth Failed

`ssh_auth_failed` means system `ssh` couldn't authenticate in noninteractive `BatchMode`. Confirm the key path, username, and ssh-agent or passphrase setup in Terminal.

## Host Unreachable

`ssh_unreachable` means DNS, routing, firewall, port, or host availability failed. Confirm `ssh USER@HOST` works outside the app.

## Host Key Failed

`ssh_host_key_failed` follows your existing `known_hosts` policy. Resolve host-key trust in Terminal; v0.1 has no host-key management UI.

## NVIDIA SMI Missing

`nvidia_smi_missing` means the SSH login user couldn't run `nvidia-smi`. Confirm the NVIDIA driver is installed, `nvidia-smi` is on `PATH` for noninteractive SSH sessions, and this command works:

```bash
ssh -o BatchMode=yes USER@HOST 'command -v nvidia-smi && nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits'
```

The remote host doesn't need GPUWatcher, nvitop, Python, or a collector package installed.

## Base GPU Query Failed

`base_gpu_query_failed` or `remote_command_failed` on the base GPU section means GPUWatcher couldn't collect the required `nvidia-smi --query-gpu` CSV. Check driver health with `nvidia-smi`, confirm the login user can access the GPU devices, and inspect stderr from the failed refresh.

## Optional Section Warning

Warnings for `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, or `ps` mean the base GPU snapshot may still be usable but some richer metric, process, MIG, PCIe, or sampling detail is missing. These optional sections can be unsupported on some drivers, GPU modes, permissions, or MIG configurations. `ps` output can also differ across Linux distributions.

## Unknown Or Null Metrics

`nvidia-smi` can print `N/A`, `-`, blank values, or unsupported markers when a metric isn't exposed by the driver, GPU, or MIG mode. GPUWatcher stores those values as unknown or `null`, never as zero. This can affect memory, power, temperature, utilization, clock, MIG, PCIe, runtime, parent PID, and process fields.

## Process Rows Look Different From nvitop

GPUWatcher combines `nvidia-smi --query-compute-apps`, optional `pmon`, optional `dmon`, optional `dmon_pcie`, and `ps`. It doesn't run nvitop and doesn't have exact nvitop or NVML plus psutil parity. Short-lived processes can disappear between samples, process utilization can be unavailable, and process names can come from either `nvidia-smi` or `ps`. Process tree grouping uses only visible GPU process rows and doesn't invent non-GPU parent rows.

## Malformed Remote Output

`protocol_malformed_output` means the backend couldn't parse the sectioned stdout from its fixed SSH script. This is different from malformed JSON: new no-install collection doesn't expect the remote host to print a protocol JSON envelope.

## Latest Success Still Visible After Failure

This is expected v0.1 behavior. Failed polls update health and error metadata and preserve the latest successful snapshot as stale. They also don't add Server Detail live mini chart samples, because chart history is based on successful snapshots only.

## Live Mini Charts Reset After Restart

Server Detail mini charts are memory-only and session-only. GPUWatcher keeps at most 120 successful samples per server and GPU index, deduplicates by timestamp, and clears the history when the app restarts. Compact or full display mode is also session-only and isn't saved as a preference.
