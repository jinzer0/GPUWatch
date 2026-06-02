# BACKEND AGENTS

## OVERVIEW

Rust/Tauri backend owns SSH transport, no-install GPU collection, parsing, SQLite persistence, scheduling, and DTO generation.

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| SSH argv/script transport | `src/command_runner.rs` | Builds system `ssh` argv; no legacy collector wrapper. |
| No-install collection | `src/no_install_collector.rs` | Emits/reads delimited sections from fixed shell script. |
| `nvidia-smi` parsing | `src/nvidia_smi.rs` | GPU CSV is required; optional sections warn. |
| Tauri commands/polling | `src/commands.rs` | Production polling calls `collect_no_install_snapshot`. |
| Persistence/migrations | `src/repository.rs` | Preserves server settings; drops legacy command column. |
| Read DTOs | `src/read_model.rs` | Busy/free/process rows; null metrics preserved. |
| Shared types | `src/models.rs` | Serde camelCase contract for frontend. |
| Tests/fixtures | `fixtures/nvidia-smi/`, `fixtures/protocol/v1/` | Add live-like fixtures for parser edge cases. |

## CONVENTIONS

- Keep SSH commands fixed in Rust code; remote users configure host, port, username, key path only.
- Use `run_remote_script` for multi-section collector script and `run_remote_argv` for fixed argument vectors.
- Missing `nvidia-smi` is a typed app error; optional section failures become warnings when base GPU data parses.
- Parse by headers where possible; support live pmon/dmon column order drift with fixtures.
- Rust DTO fields stay snake_case internally and serialize camelCase to TypeScript.
- Repository tests may contain legacy `collector_command` strings only to prove migration removal.
- Live `tml-server` tests must remain `#[ignore]` and require `GPUWATCHER_LIVE_SSH_TARGET=tml-server`.

## ANTI-PATTERNS

- Do not add `run_collector` or any hard-coded `gpuwatcher --json` runtime helper.
- Do not pass user-provided shell strings to SSH.
- Do not store a remote command path in SQLite.
- Do not fail the whole snapshot for unavailable `pmon`, `dmon`, `compute-apps`, or `ps` when base GPU CSV succeeds.
- Do not treat missing numeric metrics as `0.0`.
- Do not make default `cargo test` contact a live host.

## VERIFY

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path src-tauri/Cargo.toml live_tml_server -- --ignored --nocapture
```
