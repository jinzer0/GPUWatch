# GPUWatcher Agent Notes

## Current Shape
- GPUWatcher is a macOS Electron desktop app for monitoring Linux NVIDIA GPU hosts over system `ssh`; Tauri has been removed from the active runtime.
- Runtime flow: React renderer -> action-specific Electron preload/IPC -> local Rust helper CLI -> `gpuwatcher-core` -> fixed no-install SSH commands -> local SQLite read model.
- Remote hosts need only an NVIDIA driver with `nvidia-smi`, a POSIX shell, `ps`, and key-based SSH from macOS. Do not document or add remote GPUWatcher/nvitop/Python/collector installs.

## High-Value Paths
- `package.json`: npm scripts and Electron Builder config; packaged output goes to `release/electron/` with `identity: null`.
- `electron/main.ts`: BrowserWindow security settings and scheduler startup; keep `contextIsolation: true` and `nodeIntegration: false`.
- `electron/helperContract.ts`: canonical TS action contract. `poll_due_servers` is `main-only`; renderer/preload must not expose it.
- `electron/preload.ts` and `electron/preload-runtime.cts`: action-specific `window.gpuwatcher` bridge. No generic `invoke`, `runAction`, or helper path exposure.
- `electron/helperRunner.ts`: helper discovery. Dev uses Cargo target or `GPUWATCHER_HELPER_PATH`; packaged app uses `process.resourcesPath/gpuwatcher-helper/gpuwatcher-helper` outside ASAR.
- `electron/scheduler.ts`: Electron main owns polling/overlap/concurrency by calling `list_servers`, `get_server_detail`, and `refresh_server`; do not move scheduling into renderer.
- `crates/gpuwatcher-core/`: no-install SSH collector, parsers, service logic, repository/migrations, DTO models.
- `crates/gpuwatcher-helper/`: stdin/stdout JSON helper CLI. stdout must be exactly one helper response envelope; diagnostics belong on stderr.
- `src/lib/api.ts`: renderer API boundary and plain-Vite fallback behavior.
- `fixtures/`: protocol and `nvidia-smi` parser fixtures used by Rust tests.
- `smoke/`: Electron UI smoke scripts; they use isolated temp data and CDP, not production DB.
- `docs/plan/` and `docs/draft/`: historical records only; do not treat old runtime claims there as current setup.

## Commands
```bash
npm run dev                         # Vite renderer at 127.0.0.1:5173
npm run electron:dev                # builds Electron TS, then starts Electron against Vite
npm run build                       # tsc + vite build
npm run test -- --run               # Vitest once; add a test file path for focused runs
npm run electron:build              # tsc -p tsconfig.electron.json, includes .cts preload runtime
npm run helper:build                # cargo build for helper binary
npm run electron:pack               # build + helper build + unsigned electron-builder dir package
npm run electron:dist:unsigned      # internal/test unsigned DMG+ZIP artifacts, no publish
npm run smoke:electron:first-run    # Electron dev-surface UI smoke; requires built helper
node smoke/electron-packaged-app-smoke.mjs  # packaged .app smoke after electron:pack
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml live_tml_server -- --ignored --nocapture
```

## Verification Gotchas
- Normal tests must not require live SSH or `tml-server`; live checks stay ignored and env-gated with the exact command above.
- `npm run electron:pack` creates an unsigned local `.app` directory, not a signed/notarized/DMG/uploaded release. Discover the app path with `find release/electron -name GPUWatcher.app -type d` instead of hardcoding `mac` vs `mac-arm64`.
- `npm run electron:dist:unsigned` creates internal/test unsigned DMG+ZIP artifacts only. They are not signed, notarized, uploaded, auto-updated, production release-ready, or external distribution-ready.
- Plain Vite browser runs lack the Electron preload bridge; screens should keep static identity/read-only empty states and explicit `backend_unavailable` errors for backend actions.
- Use `GPUWATCHER_TEST_DATA_DIR` only for tests/smoke isolation. Production data lives under the macOS data dir as `GPUWatcher/gpuwatcher.sqlite3`.
- Rust LSP may be unavailable because `rust-analyzer` is not installed here; use `cargo fmt`, focused Cargo tests, and crate tests for Rust verification.
- GUI-launched Electron may not inherit Terminal SSH state (`SSH_AUTH_SOCK`, first-use `known_hosts`, passphrases, remote `PATH`). Reproduce SSH failures from the same launch context.

## Product Invariants
- Backend synthesizes protocol v1 JSON locally from sectioned command output; remote stdout is not protocol JSON.
- Store only the latest successful snapshot. Failed polls update health/error metadata and preserve stale success without adding history samples.
- Unknown/unavailable GPU or process metrics stay `null`/`unknown`; never convert `N/A`, `-`, missing pmon/dmon, or disappeared PIDs to zero.
- Optional `compute-apps`, `pmon`, `dmon`, `mig`, PCIe, and `ps` sections may degrade to warnings if the required base GPU CSV succeeds.
- Migration backups are local SQLite copies made only before destructive legacy schema changes; restore by closing the app and replacing the DB with the backup copy.

## Do Not Reintroduce
- Tauri runtime, `@tauri-apps/*`, `src-tauri/`, Tauri docs as active setup, or `TAURI_` config.
- `gpuwatcher --json` as a runtime path.
- `collectorCommand` / `collector_command` in runtime API, UI, DB saved settings, or docs except legacy migration tests/negative guardrails.
- User-configurable remote shell commands or alternate installed-collector modes.
- Generic renderer bridge methods such as `invoke`, `runAction`, arbitrary helper action dispatch, helper path exposure, or renderer-callable `pollDueServers`.
- Claims that unsigned local packages or internal/test DMG+ZIP artifacts are signed, notarized, uploaded, auto-updated, production release-ready, or suitable for external distribution.

## Commit Convention
- Do not commit unless explicitly requested.
- Existing history uses English conventional commits such as `feat(electron): ...`, `refactor(core): ...`, `docs(electron): ...`.
- Every future commit attribution must include exactly:
  `Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)`
  `Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>`
