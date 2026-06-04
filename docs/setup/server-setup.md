# GPUWatcher Server Setup

GPUWatcher v0.1 uses no-install SSH collection. The remote host doesn't need GPUWatcher, nvitop, Python, a Python collector, a collector package, or project files installed.

The macOS app connects with system `ssh`, runs a fixed POSIX shell script, collects `nvidia-smi` and `ps` output, and parses the result locally. Stored GPU history is also local to the macOS app's SQLite database, so it adds no remote service, package, exporter, or background job.

## Remote Requirements

Each Linux NVIDIA GPU server needs:

- NVIDIA driver with `nvidia-smi` on `PATH`
- POSIX shell for the SSH login user
- `ps` for process name and command enrichment
- Key-based SSH from the macOS machine running GPUWatcher

Password prompts aren't supported by the app. If your key uses a passphrase, unlock it in `ssh-agent` before refreshing the server.

## Verify SSH From macOS

Run this from macOS Terminal before adding the server:

```bash
ssh -o BatchMode=yes USER@HOST true
```

If you use a non-default port or key path, include them:

```bash
ssh -o BatchMode=yes -p 2222 -i /path/to/key USER@HOST true
```

Resolve host-key prompts, passphrase prompts, DNS, firewall, and account problems in Terminal first. GPUWatcher follows your existing OpenSSH configuration and `known_hosts` policy.

## Verify Remote Commands

Check the required base GPU query:

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
```

Check process queries and enrichment:

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits; ps -eo pid=,user=,comm=,args='
```

Optional richer metric commands may work on some systems and fail on others:

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,clocks.current.graphics,clocks.current.memory,utilization.encoder,utilization.decoder,pcie.link.gen.current,pcie.link.width.current --format=csv,noheader,nounits; nvidia-smi -L; nvidia-smi pmon -c 1; nvidia-smi dmon -c 1; nvidia-smi dmon -s t -c 1'
```

A failure from `gpu_extra_csv`, `mig_list`, `pmon`, `dmon`, or `dmon_pcie` doesn't always mean the server is unusable. GPUWatcher can still collect the base GPU snapshot and report warnings for unavailable optional sections.

## What GPUWatcher Collects

GPUWatcher supports these command output sections:

- `gpu_csv` from `nvidia-smi --query-gpu`, required for a successful snapshot
- `gpu_extra_csv` from extra `nvidia-smi --query-gpu` fields for clocks, encoder, decoder, JPEG, OFA, PCIe, fan, and throttle hints
- `mig_list` from `nvidia-smi -L` for basic MIG instance counts
- `dmon` from `nvidia-smi dmon` for device monitor hints
- `dmon_pcie` from `nvidia-smi dmon -s t` for PCIe throughput hints in KiB/s
- `pmon` from `nvidia-smi pmon` for process utilization hints
- `ps` output for user, command, runtime, parent PID, and argument enrichment

The app stores the latest successful synthesized protocol v1 snapshot locally. It also stores compact per-GPU history rows for successful polls, with fixed 24h retention. Remote stdout is sectioned command output, not a protocol JSON document. Failed polls update health and error metadata while preserving the latest successful snapshot as stale, and they don't append history rows.

## Known Limitations

Official `nvidia-smi` output varies across driver versions, MIG modes, PCIe reporting, and GPU families. Some fields can be `N/A`, `-`, blank, or unsupported; GPUWatcher records those as unknown or `null`, never as zero. Stored history keeps those null or unknown values so charts show gaps or unknown states instead of false zeroes.

MIG support is basic instance counting only. It doesn't model full GI or CI topology. PCIe throughput and process utilization depend on optional `dmon_pcie` and `pmon` output, so those values can be missing even when the base GPU snapshot is healthy.

Process fidelity depends on what `nvidia-smi` and `ps` report at poll time. Short-lived processes can be missed, tree grouping uses visible GPU process rows only, process names can differ from nvitop, and GPUWatcher doesn't claim an exact nvitop match.

Live Monitor reads the stored 24h local GPU history. Server Detail prefers stored 1h history and uses session live samples only as a fallback while stored history is loading or empty. GPUWatcher doesn't store process timelines, process command history, raw snapshot history, or long-term audit history.

## Stored Credentials

GPUWatcher stores only server connection settings such as host, port, username, key path, polling interval, and enabled state. It doesn't store passwords, passphrases, private key material, or host-key policy.
