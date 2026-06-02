# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-02
**Commit:** `7922e94`
**Branch:** `main`

## OVERVIEW

GPUWatcher is a macOS Tauri utility for monitoring Linux NVIDIA GPU servers through system `ssh`. The current architecture is no-install remote collection: Rust runs fixed SSH commands, parses `nvidia-smi`/`ps` output locally, and stores the latest successful protocol v1 snapshot in SQLite.

## STRUCTURE

```text
GPUWatch/
├── src-tauri/   # Rust backend: SSH runner, collector, parsers, SQLite, Tauri commands
├── src/         # React/TypeScript frontend: screens, API boundary, DTO types
├── docs/        # Active user docs plus historical plan/draft records
├── schemas/     # Protocol JSON schema artifact
├── fixtures/    # Protocol fixtures used by Rust protocol tests
└── README.md    # Korean utility app README
```

## WHERE TO LOOK

| Task | Start here | Notes |
|---|---|---|
| Run or build app | `package.json`, `src-tauri/tauri.conf.json` | Tauri hooks call frontend commands. |
| Frontend routing | `src/App.tsx` | Overview, detail, process table, settings. |
| Tauri invoke API | `src/lib/api.ts` | Keep command names aligned with Rust commands. |
| DTO types | `src/lib/types.ts`, `src-tauri/src/models.rs` | TS mirrors Rust serde camelCase DTOs. |
| SSH collection | `src-tauri/src/no_install_collector.rs` | Fixed script only; no remote package. |
| SSH transport | `src-tauri/src/command_runner.rs` | System `ssh` argv/script wrapper. |
| Parse `nvidia-smi` | `src-tauri/src/nvidia_smi.rs` | Preserve unknown values as `None`/`null`. |
| Polling and commands | `src-tauri/src/commands.rs` | Production path stores synthesized snapshots. |
| SQLite and migrations | `src-tauri/src/repository.rs` | Drops legacy `collector_command`. |
| Active docs | `README.md`, `docs/setup/`, `docs/protocol/`, `docs/troubleshooting.md`, `docs/smoke-checklist.md` | Do not treat historical docs as current setup. |

## COMMANDS

```bash
npm run dev
npm run tauri dev
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path src-tauri/Cargo.toml live_tml_server -- --ignored --nocapture
```

## PROJECT CONVENTIONS

- Remote hosts do not need GPUWatcher, nvitop, Python, collector packages, or repository files installed.
- Backend synthesizes protocol v1 JSON locally from sectioned command output; remote stdout is not protocol JSON.
- Store only the latest successful snapshot; failed polls update health/error metadata and preserve stale success.
- Unknown or unavailable GPU/process metrics are `null`/`unknown`, never fabricated zeroes.
- Optional `compute-apps`, `pmon`, `dmon`, and `ps` failures degrade to warnings if the base GPU CSV succeeds.
- `docs/plan/` and `docs/draft/` are historical records; active instructions live in README/setup/protocol/troubleshooting/smoke docs.
- `.sisyphus/`, `.playwright-mcp/`, `dist/`, `node_modules/`, and `src-tauri/target/` are local artifacts, not product source.

## ANTI-PATTERNS

- Do not reintroduce `gpuwatcher --json` as a runtime path.
- Do not add `collectorCommand` / `collector_command` to runtime API, UI, DB schema, or saved settings.
- Do not add a user-configurable remote shell command or fallback collector mode.
- Do not document remote GPUWatcher/nvitop/Python installs as required.
- Do not convert `N/A`, `-`, missing pmon/dmon, or disappeared PIDs to zero.
- Do not make normal tests depend on `tml-server`; live tests must stay ignored and env-gated.
- Do not weaken tests that protect the no-install SSH pivot.

## NOTES

- Rust LSP may be unavailable in this environment because `rust-analyzer` is missing; use `cargo fmt` and `cargo test` for Rust verification.
- Plain Vite browser runs lack Tauri `invoke`; screens must still show static identity instead of being fully obscured by backend-unavailable errors.
- Current branch has initial project commits; do not commit unless explicitly requested.
