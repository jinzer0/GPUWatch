# DOCS AGENTS

## OVERVIEW

Docs must describe the current no-install SSH architecture while preserving historical plan/draft files as history only.

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| User-facing overview | `../README.md` | Korean portfolio/GitHub README with required section anchors. |
| Remote setup | `setup/server-setup.md` | Active server requirements and SSH checks. |
| Protocol contract | `protocol/gpuwatcher-json-v1.md` | Backend-synthesized snapshot contract. |
| Troubleshooting | `troubleshooting.md` | Error taxonomy and null metric behavior. |
| Smoke QA | `smoke-checklist.md` | Local, browser, and live SSH checks. |
| Demo script | `demo/demo-script.md` | Current v0.1 manual demo. |
| Historical records | `plan/`, `draft/` | Do not rewrite as active setup unless explicitly asked. |

## CONVENTIONS

- Active docs say remote hosts need NVIDIA driver/`nvidia-smi`, POSIX shell, `ps`, and key-based SSH.
- Active docs say remote hosts do not need GPUWatcher, nvitop, Python collectors, collector packages, or repo files installed.
- README must stay concise and use this section order: `Contents`, `Overview`, `Getting Started`, `Features`, `Prerequisites`.
- README command blocks must contain executable commands only; put unknown repository URLs or placeholders in prose, not code blocks.
- Protocol docs describe stored backend-synthesized JSON; remote stdout is sectioned command output, not protocol JSON.
- Limitations must mention `N/A`/`-`, MIG/driver variation, optional `pmon`/`dmon` degradation, process fidelity limits, and no exact nvitop parity.
- Historical `docs/plan/` and `docs/draft/` may contain old `gpuwatcher --json` language; label or treat it as historical context.

## ANTI-PATTERNS

- Do not add active setup instructions for `gpuwatcher --json`.
- Do not tell users to install GPUWatcher, nvitop, Python, or collector packages on GPU servers.
- Do not claim exact nvitop/NVML+psutil parity.
- Do not remove historical docs just to eliminate old terms.
- Do not describe unknown metrics as zero values.

## VERIFY

```bash
rg -n -i 'gpuwatcher --json|collector command path|collectorCommand|collector_command' README.md docs --glob '*.md' --glob '!**/AGENTS.md' --glob '!docs/plan/**' --glob '!docs/draft/**'
rg -n -i 'nvidia-smi|pmon|dmon|MIG|N/A|nvitop' README.md docs --glob '*.md' --glob '!**/AGENTS.md' --glob '!docs/plan/**' --glob '!docs/draft/**'
```
