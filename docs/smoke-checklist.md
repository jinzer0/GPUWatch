# v0.1 Smoke Checklist

Run these before internal handoff.

## Local Verification

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run test
npm run build
```

Expected result: all commands exit 0.

## Documentation Checks

Confirm active docs describe no-install SSH collection and don't direct users to install or run a remote GPUWatcher collector.

Expected result: active docs have no legacy remote collector command, install instruction, arbitrary collector, Prometheus or exporter claim, exact parity claim, or long-term audit history claim. They do list `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, `ps`, `MIG`, `PCIe`, `N/A`, `unknown`, fixed 24h stored GPU history, successful-poll-only samples, failed-poll gaps, null metric gaps, and nvitop caveats.

## Desktop Mock Smoke

1. Run `npm run tauri dev`.
2. Click `Seed demo data`.
3. Confirm Overview shows GPU total, busy/free counts, utilization, memory, temperature, last success, and status.
4. Toggle Full and Compact display mode. Confirm the layout changes for the current session and doesn't present the setting as persisted.
5. Open Server Detail and confirm hostname, driver/CUDA, GPU cards, process list, and history charts for utilization or optional metrics.
6. Confirm Server Detail prefers stored 1h history and labels `Stored history` when stored samples exist.
7. Confirm Server Detail uses `Session live fallback` only while stored history is loading or empty.
8. Open Live Monitor and confirm server, GPU, range, and metric controls read stored local history.
9. Confirm Live Monitor offers ranges within fixed 24h retention, including `1h`, `6h`, and `24h`.
10. Confirm charts use successful polls only, show gaps or empty states for `unknown` or `null` values, and don't imply exact nvitop parity.
11. Open Process Table and confirm rows sort by GPU memory descending.
12. Use keyboard navigation on the process table or tree controls, then expand and collapse process parent grouping. Confirm grouping uses visible GPU process rows only.
13. Open Settings and confirm add/edit/delete/enable/disable forms are visible and no collector command field appears.

## Live SSH Smoke

Don't install GPUWatcher, nvitop, Python, or a collector package on the remote host.

1. Choose a GPU host such as `tml-server`, or use a generic `USER@HOST` target with an NVIDIA driver and key-based SSH.
2. From macOS Terminal, run `ssh -o BatchMode=yes USER@HOST true` and confirm it exits 0.
3. Run `ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'`.
4. Add the server in GPUWatcher with host, port, username, key path, polling interval, and enabled state.
5. Run Test Connection.
6. Run Refresh.
7. Confirm system `ssh` runs the no-install collection script, the backend stores a synthesized protocol v1 snapshot in SQLite, and Overview/Detail/Process screens update.
8. Confirm a successful poll appends stored GPU history samples for visible GPUs and keeps retention fixed at 24h.
9. Open Live Monitor and confirm stored history appears for the refreshed server, with server, GPU, range, and metric controls.
10. Open Server Detail and confirm it uses `Stored history` when stored 1h history exists, or `Session live fallback` only while stored history is loading or empty.
11. Confirm warnings are acceptable if optional `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, compute-apps, or `ps` sections are unavailable.
12. Confirm MIG, PCIe, process utilization, runtime, and any null history metrics can show `unknown`, `null`, or chart gaps without becoming zero.
13. Temporarily break SSH connectivity and refresh again.
14. Confirm the latest success remains visible as stale, latest error metadata is shown, and no failed-poll history sample is appended.
15. Confirm Live Monitor and Server Detail show a gap or unchanged stored history for the failed poll rather than a durable failed sample.
