# GPUWatcher Server Setup

GPUWatcher v0.1 uses no-install SSH collection. The remote host doesn't need GPUWatcher, nvitop, Python, a Python collector, or project files installed.

The macOS app connects with system `ssh`, runs a fixed POSIX shell script, collects `nvidia-smi` and `ps` output, and parses the result locally.

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

Optional sampling commands may work on some systems and fail on others:

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi pmon -c 1; nvidia-smi dmon -c 1'
```

A failure from `pmon` or `dmon` doesn't always mean the server is unusable. GPUWatcher can still collect the base GPU snapshot and report warnings for unavailable optional sections.

## What GPUWatcher Collects

GPUWatcher supports these command outputs:

- GPU CSV from `nvidia-smi --query-gpu`
- Compute applications from `nvidia-smi --query-compute-apps`
- Optional `nvidia-smi pmon` samples for process utilization hints
- Optional `nvidia-smi dmon` samples for device monitor hints
- `ps` output for user, command, and argument enrichment

The app stores the latest successful synthesized protocol v1 snapshot locally. Remote stdout is sectioned command output, not a protocol JSON document.

## Known Limitations

Official `nvidia-smi` output varies across driver versions, MIG modes, and GPU families. Some fields can be `N/A` or `-`; GPUWatcher records those as unknown or `null`, never as zero.

Process fidelity depends on what `nvidia-smi` and `ps` report at poll time. Short-lived processes can be missed, process names can differ from nvitop, and GPUWatcher doesn't claim an exact nvitop match. `pmon` and `dmon` are optional because driver or permission differences can make them unavailable.

## Stored Credentials

GPUWatcher stores only server connection settings such as host, port, username, key path, polling interval, and enabled state. It doesn't store passwords, passphrases, private key material, or host-key policy.
