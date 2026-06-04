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

Expected result: active docs have no legacy remote collector command, install instruction, or exact parity claim. They do list `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, `ps`, `MIG`, `PCIe`, `N/A`, `unknown`, memory-only chart history, and nvitop caveats.

## Desktop Mock Smoke

1. Run `npm run tauri dev`.
2. Click `Seed demo data`.
3. Confirm Overview shows GPU total, busy/free counts, utilization, memory, temperature, last success, and status.
4. Toggle Full and Compact display mode. Confirm the layout changes for the current session and doesn't present the setting as persisted.
5. Open Server Detail and confirm hostname, driver/CUDA, GPU cards, process list, and live mini charts for utilization or optional metrics.
6. Confirm charts use successful snapshots only, show gaps or empty states for `unknown` values, and don't imply exact nvitop parity.
7. Open Process Table and confirm rows sort by GPU memory descending.
8. Use keyboard navigation on the process table or tree controls, then expand and collapse process parent grouping. Confirm grouping uses visible GPU process rows only.
9. Open Settings and confirm add/edit/delete/enable/disable forms are visible and no collector command field appears.

## Live SSH Smoke

Don't install GPUWatcher, nvitop, Python, or a collector package on the remote host.

1. Choose a GPU host such as `tml-server`, or use a generic `USER@HOST` target with an NVIDIA driver and key-based SSH.
2. From macOS Terminal, run `ssh -o BatchMode=yes USER@HOST true` and confirm it exits 0.
3. Run `ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'`.
4. Add the server in GPUWatcher with host, port, username, key path, polling interval, and enabled state.
5. Run Test Connection.
6. Run Refresh.
7. Confirm system `ssh` runs the no-install collection script, the backend stores a synthesized protocol v1 snapshot in SQLite, and Overview/Detail/Process screens update.
8. Confirm warnings are acceptable if optional `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, compute-apps, or `ps` sections are unavailable.
9. Confirm MIG, PCIe, process utilization, and runtime values can show `unknown` or `null` without becoming zero.
10. Temporarily break SSH connectivity and refresh again.
11. Confirm the latest success remains visible as stale, latest error metadata is shown, and Server Detail charts don't append failed-poll samples.
12. Restart the app and confirm live mini chart history is cleared because it is memory-only session data.
