# Troubleshooting

## SSH Auth Failed

`ssh_auth_failed` means system `ssh` couldn't authenticate in noninteractive `BatchMode`. Confirm the key path, username, and ssh-agent or passphrase setup in Terminal.

For GUI launches, remember that a packaged app may not inherit the same `SSH_AUTH_SOCK` as your shell. Start the app from a Terminal that has the right agent, or make sure the key is available to the macOS agent before launching from Finder.

## Host Unreachable

`ssh_unreachable` means DNS, routing, firewall, port, or host availability failed. Confirm `ssh USER@HOST` works outside the app.

## Host Key Failed

`ssh_host_key_failed` follows your existing `known_hosts` policy. Resolve host-key trust in Terminal; v0.1 has no host-key management UI. First-use host-key prompts won't work from a noninteractive GUI refresh.

## Passphrase Or Password Prompt Appears In Terminal

GPUWatcher doesn't show password or key passphrase prompts. The SSH command must work with `BatchMode=yes` before the app can refresh a server.

```bash
ssh -o BatchMode=yes USER@HOST true
```

If the key has a passphrase, unlock it in `ssh-agent` before opening the app.

## NVIDIA SMI Missing

`nvidia_smi_missing` means the SSH login user couldn't run `nvidia-smi`. Confirm the NVIDIA driver is installed, `nvidia-smi` is on `PATH` for noninteractive SSH sessions, and this command works:

```bash
ssh -o BatchMode=yes USER@HOST 'command -v nvidia-smi && nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits'
```

GUI launches and noninteractive SSH sessions may not load the same shell startup files as an interactive login. If needed, fix the remote account's noninteractive `PATH` or OpenSSH environment so `nvidia-smi` is visible without a prompt.

The remote host doesn't need GPUWatcher, nvitop, Python, collector packages, or repository files installed.

## Base GPU Query Failed

`base_gpu_query_failed` or `remote_command_failed` on the base GPU section means GPUWatcher couldn't collect the required `nvidia-smi --query-gpu` CSV. Check driver health with `nvidia-smi`, confirm the login user can access the GPU devices, and inspect stderr from the failed refresh.

## Optional Section Warning

Warnings for `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, or `ps` mean the base GPU snapshot may still be usable but some richer metric, process, MIG, PCIe, or sampling detail is missing. These optional sections can be unsupported on some drivers, GPU modes, permissions, or MIG configurations. `ps` output can also differ across Linux distributions.

## Unknown Or Null Metrics

`nvidia-smi` can print `N/A`, `-`, blank values, or unsupported markers when a metric isn't exposed by the driver, GPU, or MIG mode. GPUWatcher stores those values as unknown or `null`, never as zero. This can affect memory, power, temperature, utilization, clock, MIG, PCIe, runtime, parent PID, and process fields. History charts render null metrics as gaps or unknown states instead of zero-valued samples.

## Process Rows Look Different From nvitop

GPUWatcher combines `nvidia-smi --query-compute-apps`, optional `pmon`, optional `dmon`, optional `dmon_pcie`, and `ps`. It doesn't run nvitop and doesn't have exact nvitop or NVML plus psutil parity. Short-lived processes can disappear between samples, process utilization can be unavailable, and process names can come from either `nvidia-smi` or `ps`. Process tree grouping uses only visible GPU process rows and doesn't invent non-GPU parent rows.

## Malformed Remote Output

`protocol_malformed_output` means the backend couldn't parse the sectioned stdout from its fixed SSH script. This is different from malformed JSON: no-install collection doesn't expect the remote host to print a protocol JSON envelope.

## Helper Missing In Electron

`missing_helper` means the Electron main process couldn't find the local Rust helper binary. In development, set `GPUWATCHER_HELPER_PATH` to a built helper or run `npm run helper:build` so the Cargo debug target exists. In a packaged app, confirm the helper was copied outside ASAR under app resources at `gpuwatcher-helper/gpuwatcher-helper`.

This is a local macOS packaging or development setup issue. The remote host still doesn't need GPUWatcher, nvitop, Python, collector packages, or repository files installed.

## Helper Resource Or Path Error In Packaged App

If the packaged app opens but desktop actions fail before reaching the helper, confirm `npm run electron:pack` completed and the app resources include `gpuwatcher-helper/gpuwatcher-helper`. Rebuild with `npm run helper:build` and `npm run electron:pack`. Don't move the helper out of the package resources after packaging unless `GPUWATCHER_HELPER_PATH` points to the replacement binary.

## Helper Timeout In Electron

`helper_timeout` means Electron started the helper but didn't receive a response before the action timeout. Local database and read-model actions use a 10 second timeout class. SSH collection actions use a 60 second timeout class because they wait on network SSH and `nvidia-smi`.

If the timeout happens on an SSH action, first confirm `ssh -o BatchMode=yes USER@HOST true` and the base `nvidia-smi` query work in Terminal. If it happens on a local action, rebuild the helper and check whether the local database path is reachable.

## Invalid Helper JSON In Electron

`malformed_helper_stdout` means the helper process exited successfully but stdout wasn't exactly one helper response JSON envelope, or the JSON shape didn't match the helper contract. Rebuild the helper with `npm run helper:build`, then run Electron again. Extra logging printed to stdout can cause this error; helper diagnostics should go to stderr.

This is different from `protocol_malformed_output`, which refers to parsing fixed SSH command sections from the remote host.

## Backend Unavailable In Plain Vite

`backend_unavailable` means the frontend is running without the Electron preload bridge for that action. A plain Vite browser can still show static app identity and read-only empty states, but save, delete, test connection, refresh, and seed actions need the Electron desktop runtime.

For the desktop app, run `npm run dev` in one terminal and `npm run electron:dev` in another. For a local packaged smoke, run `npm run electron:pack`, discover the generated app with `APP_PATH="$(find release/electron -name 'GPUWatcher.app' -type d -print -quit)"`, then open it with `open "$APP_PATH"` after confirming the variable isn't empty.

## Local Electron Package Is Unsigned

`npm run electron:pack` creates a local package directory for smoke testing with macOS signing skipped. It isn't signed, notarized, distributed as a DMG, uploaded, or release-ready. If macOS blocks opening the app, treat it as a local unsigned package or quarantine issue rather than a remote GPU server setup issue.

Gatekeeper and quarantine behavior depends on how the app directory was created and moved. This project documentation doesn't cover signing, notarization, or release distribution.

## Database Path Or Data Preservation

GPUWatcher keeps the canonical SQLite database at `~/Library/Application Support/GPUWatcher/gpuwatcher.sqlite3`. Tests and smoke runs can redirect the data directory with `GPUWATCHER_TEST_DATA_DIR`, which should point at an isolated temporary directory.

Migration backups are local SQLite copies made before destructive legacy schema changes. To restore one, fully quit GPUWatcher, move the current `gpuwatcher.sqlite3` aside, copy the chosen backup into the same directory, and name it `gpuwatcher.sqlite3`.

If the DB is corrupt, missing, or read-only, quit the app before changing files. Check directory permissions, disk availability, and whether another process owns the file. If needed, restore from a migration backup or move the DB aside so GPUWatcher can create a fresh one.

## Stale Success After Failed Refresh

A failed poll updates health and error metadata but preserves the latest successful snapshot. Overview and detail screens may show stale GPU data with a failed health state. That is expected: GPUWatcher doesn't delete the last known good snapshot just because the newest SSH attempt failed.
