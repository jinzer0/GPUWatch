# v0.1 Smoke Checklist

Run these before internal handoff.

## Local Verification

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run test
npm run build
npm run electron:build
npm run helper:build
```

Expected result: all commands exit 0.

## Dual-run Startup Checks

1. Run `npm run tauri dev` and confirm the Tauri app starts against the local backend.
2. In a separate terminal, run `npm run dev`.
3. Run `npm run electron:dev` and confirm the Electron window opens against `http://127.0.0.1:5173`.
4. In a plain browser at `http://127.0.0.1:5173`, confirm backend-unavailable states don't cover the static app identity.
5. Confirm Settings actions that need a backend still report backend unavailable rather than pretending to save.

Expected result: Tauri remains usable, Electron starts during the migration, and the plain browser fallback degrades clearly.

## Temporary Tauri/Electron Parity Checklist

This checklist is for the temporary dual-run migration stage. Do not remove or disable Tauri while using it: `npm run tauri dev` remains the production-compatible reference path, and `npm run electron:dev` remains the Electron migration smoke path after `npm run dev` starts Vite.

Use `electron/helperContract.ts` as the source of truth for Electron action names and status. Current Electron preload and IPC expose the same action-specific methods, but the Rust helper service dispatch is not fully migrated yet: `health` is implemented, while non-health helper actions return a structured `helper_action_deferred` error until the service-dispatch migration lands. Treat these Electron flows as backend unavailable/deferred, not as production parity.

| Core flow | Tauri status | Electron status for this stage | Graceful handling note |
| --- | --- | --- | --- |
| Initialize app | `initialize_app` is registered in `generate_handler!` and delegates to the core overview service. | `initializeApp` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns an empty overview array so static identity remains visible; Electron must surface the helper error instead of silently loading real data. |
| List overview | `list_overview` is registered and backed by the core read model. | `listOverview` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns an empty list; Electron deferred errors should render a visible backend-unavailable/deferred state. |
| Add/edit/delete server | `save_server` and `delete_server` are registered and mutate the canonical SQLite database. | `saveServer` and `deleteServer` bridge/IPC/helper actions exist, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Frontend save/delete require a backend; without a migrated helper they fail visibly rather than pretending to save. |
| Enable/disable server | `set_server_enabled` is registered and updates enabled state plus health metadata. | `setServerEnabled` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Toggle failures must remain visible in Settings; do not mark the server changed unless the backend succeeds. |
| Test connection | `test_connection` is registered and runs the no-install SSH test path. | `testConnection` bridge/IPC/helper action exists with `ssh-60s` timeout class, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns `errorType: backend_unavailable`; Electron should surface the structured deferred helper error. |
| Refresh/poll server | `refresh_server` is registered and runs the no-install SSH poll path, preserving stale success on failure. | `refreshServer` bridge/IPC/helper action exists with `ssh-60s` timeout class and scheduler overlap key, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns `errorType: backend_unavailable`; Electron should not claim a poll occurred until helper dispatch is migrated. |
| View detail | `get_server_detail` is registered and reads server, health, and latest snapshot. | `getServerDetail` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns `null`; UI should show a normal empty/backend-unavailable path, not missing navigation. |
| View history | `list_gpu_history` is registered and reads stored 1h/6h/24h GPU history. | `listGpuHistory` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns an empty history DTO labeled backend unavailable; Electron should surface deferred helper errors. |
| View processes | `list_processes` is registered and reads current/stale process rows. | `listProcesses` bridge/IPC/helper action exists, but helper dispatch is not migrated yet and returns `helper_action_deferred`. | Plain browser/no-runtime fallback returns an empty process list; Electron deferred errors should render visibly through the table error state. |
| Settings | `list_servers`, `save_server`, `delete_server`, `set_server_enabled`, and `test_connection` are registered Tauri commands. | Matching Electron methods exist, but non-health helper dispatch is not migrated yet and returns `helper_action_deferred`. | Read-only Settings may empty-fallback without a backend; mutations/tests must show backend unavailable/deferred errors and must not silently succeed. |

Expected result: temporary dual-run remains explicit. Tauri stays available as the reference backend, Electron exposes the intended bridge/IPC surface, and every Electron flow that is not migrated yet is visibly deferred or backend unavailable.

## Electron Helper And Package Checks

1. Run `npm run helper:build`.
2. Run `npm run electron:build`.
3. For packaged smoke, run `npm run electron:pack`.
4. Confirm the package output keeps the helper outside ASAR at `gpuwatcher-helper/gpuwatcher-helper` under app resources.
5. Confirm `GPUWATCHER_HELPER_PATH` can point Electron development at a helper binary when needed.
6. Start Electron and run a helper health-backed action if available.
7. Confirm missing helper errors surface as `missing_helper` with the tried paths.
8. Confirm local helper actions use the 10 second timeout class and SSH actions use the 60 second timeout class.
9. Confirm the packaged macOS app is a local unsigned package with signing skipped, not a notarized release.

Expected result: helper lookup follows env path, packaged resources, then development Cargo target fallbacks. Local packaging is smoke-only until release signing work is complete.

## Database Path Checks

1. Confirm the canonical SQLite path is `~/Library/Application Support/GPUWatcher/gpuwatcher.sqlite3`.
2. Confirm Electron migration code doesn't switch storage to Electron `userData`.
3. If an existing database is present, confirm startup preserves that path and creates migration backups beside the database when needed.

Expected result: existing Tauri data remains at the same app data path during the Electron migration.

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

Don't install GPUWatcher, nvitop, Python, collector packages, or repository files on the remote host.

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
