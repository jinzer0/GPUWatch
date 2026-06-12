# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-02
**Commit:** `7922e94`
**Branch:** `main`

## OVERVIEW

GPUWatcher is a macOS Electron utility for monitoring Linux NVIDIA GPU servers through system `ssh`. The current architecture is no-install remote collection: the Electron main process calls a local Rust helper CLI, the shared core crate runs fixed SSH commands, parses `nvidia-smi` and `ps` output locally, and stores the latest successful protocol v1 snapshot in SQLite.

## STRUCTURE

```text
GPUWatch/
├── electron/    # Electron main, preload bridge, IPC, helper process runner
├── crates/      # Rust helper CLI and shared gpuwatcher-core backend logic
├── src/         # React/TypeScript frontend: screens, API boundary, DTO types
├── docs/        # Active user docs plus historical plan/draft records
├── schemas/     # Protocol JSON schema artifact
├── fixtures/    # Protocol fixtures used by Rust protocol tests
├── smoke/       # Local smoke scripts for Electron first-run checks
└── README.md    # Korean utility app README
```

## WHERE TO LOOK

| Task | Start here | Notes |
|---|---|---|
| Run or build app | `package.json`, `electron/`, `crates/gpuwatcher-helper/` | Normal runtime is Electron plus local helper. |
| Frontend routing | `src/App.tsx` | Overview, detail, process table, settings. |
| Electron bridge API | `src/lib/api.ts`, `electron/preload.ts`, `electron/helperContract.ts` | Renderer uses action-specific `window.gpuwatcher` methods. |
| DTO types | `src/lib/types.ts`, `crates/gpuwatcher-core/src/models.rs` | TS mirrors Rust serde camelCase DTOs. |
| SSH collection | `crates/gpuwatcher-core/src/no_install_collector.rs` | Fixed script only; no remote package. |
| SSH transport | `crates/gpuwatcher-core/src/command_runner.rs` | System `ssh` argv/script wrapper. |
| Parse `nvidia-smi` | `crates/gpuwatcher-core/src/nvidia_smi.rs` | Preserve unknown values as `None`/`null`. |
| Polling and services | `electron/scheduler.ts`, `crates/gpuwatcher-core/src/service.rs` | Electron main owns scheduling; core stores synthesized snapshots. |
| SQLite and migrations | `crates/gpuwatcher-core/src/repository.rs` | Canonical DB plus legacy migration backup logic. |
| Active docs | `README.md`, `docs/setup/`, `docs/protocol/`, `docs/troubleshooting.md`, `docs/smoke-checklist.md` | Do not treat historical docs as current setup. |

## COMMANDS

```bash
npm run dev
npm run electron:dev
npm run electron:pack
npm run test
npm run build
npm run electron:build
npm run helper:build
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml live_tml_server -- --ignored --nocapture
```

## PROJECT CONVENTIONS

- Remote hosts need only an NVIDIA driver with `nvidia-smi`, a POSIX shell, `ps`, and key-based SSH from macOS.
- Remote hosts do not need GPUWatcher, nvitop, Python, collector packages, or repository files installed.
- Backend synthesizes protocol v1 JSON locally from sectioned command output; remote stdout is not protocol JSON.
- Store only the latest successful snapshot; failed polls update health/error metadata and preserve stale success.
- Unknown or unavailable GPU/process metrics are `null`/`unknown`, never fabricated zeroes.
- Optional `compute-apps`, `pmon`, `dmon`, and `ps` failures degrade to warnings if the base GPU CSV succeeds.
- Local production data uses the macOS data dir at `GPUWatcher/gpuwatcher.sqlite3`; `GPUWATCHER_TEST_DATA_DIR` is only for isolated tests and smoke runs.
- Migration backups are local SQLite copies made before destructive legacy schema changes; restore by closing the app and replacing the DB with the backup copy.
- `docs/plan/` and `docs/draft/` are historical records; active instructions live in README/setup/protocol/troubleshooting/smoke docs.
- `.sisyphus/`, `.playwright-mcp/`, `dist/`, `dist-electron/`, `release/`, `node_modules/`, and `crates/**/target/` are local artifacts, not product source.
- Every future commit attribution must use exactly:
  `Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)`
  `Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>`

## ANTI-PATTERNS

- Do not reintroduce `gpuwatcher --json` as a runtime path.
- Do not add `collectorCommand` / `collector_command` to runtime API, UI, DB schema, or saved settings.
- Do not add a user-configurable remote shell command or fallback collector mode.
- Do not document remote GPUWatcher/nvitop/Python installs as required.
- Do not convert `N/A`, `-`, missing pmon/dmon, or disappeared PIDs to zero.
- Do not make normal tests depend on `tml-server`; live tests must stay ignored and env-gated.
- Do not weaken tests that protect the no-install SSH pivot.
- Do not claim unsigned local packages are signed, notarized, DMG releases, or uploaded releases.

## NOTES

- Rust LSP may be unavailable in this environment because `rust-analyzer` is missing; use `cargo fmt` and `cargo test` for Rust verification.
- Plain Vite browser runs lack the Electron preload bridge; screens must still show static identity instead of being fully obscured by backend-unavailable errors.
- GUI-launched Electron apps can miss Terminal SSH state such as `SSH_AUTH_SOCK`, first-use `known_hosts` prompts, passphrase prompts, and shell `PATH` customizations. Reproduce SSH checks from the same launch context when possible.
- Current branch has initial project commits; do not commit unless explicitly requested.
