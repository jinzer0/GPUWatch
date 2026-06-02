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

Expected result: active docs have no legacy remote collector command, install instruction, or exact parity claim. They do list `nvidia-smi`, `pmon`, `dmon`, `MIG`, `N/A`, and `ps` guidance.

## Desktop Mock Smoke

1. Run `npm run tauri dev`.
2. Click `Seed demo data`.
3. Confirm Overview shows GPU total, busy/free counts, utilization, memory, temperature, last success, and status.
4. Open Server Detail and confirm hostname, driver/CUDA, GPU cards, and process list.
5. Open Process Table and confirm rows sort by GPU memory descending.
6. Open Settings and confirm add/edit/delete/enable/disable forms are visible and no collector command field appears.

## Live SSH Smoke

Don't install GPUWatcher, nvitop, Python, or a collector package on the remote host.

1. Choose a GPU host such as `tml-server`, or use a generic `USER@HOST` target with an NVIDIA driver and key-based SSH.
2. From macOS Terminal, run `ssh -o BatchMode=yes USER@HOST true` and confirm it exits 0.
3. Run `ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'`.
4. Add the server in GPUWatcher with host, port, username, key path, polling interval, and enabled state.
5. Run Test Connection.
6. Run Refresh.
7. Confirm system `ssh` runs the no-install collection script, the backend stores a synthesized protocol v1 snapshot in SQLite, and Overview/Detail/Process screens update.
8. Confirm warnings are acceptable if optional `pmon`, `dmon`, compute-apps, or `ps` sections are unavailable.
9. Temporarily break SSH connectivity and refresh again.
10. Confirm the latest success remains visible as stale and latest error metadata is shown.
