# AGENTS.md

본 저장소에서 작업하는 모든 코딩 에이전트(Codex, Claude Code 등)가 따르는 운영 규칙. 매 턴 시스템 프롬프트로 적재되므로 항상 필요한 정책, 제약, 인덱스만 둔다. 절차 상세는 매뉴얼과 SKILL로 분리한다.

## 프로젝트 개요

- GPUWatcher is a macOS Electron desktop app for monitoring Linux NVIDIA GPU hosts over system `ssh`; Tauri has been removed from the active runtime.
- Runtime flow: React renderer -> action-specific Electron preload/IPC -> local Rust helper CLI -> `gpuwatcher-core` -> fixed no-install SSH commands -> local SQLite read model.
- Remote hosts need only an NVIDIA driver with `nvidia-smi`, a POSIX shell, `ps`, and key-based SSH from macOS. Do not document or add remote GPUWatcher/nvitop/Python/collector installs.

## 하이퍼-워터폴 핵심 규칙

이 프로젝트는 **하이퍼-워터폴** 방법론을 적용한다. 에이전트의 기본 동작(빠른 실행, 자율 수정)과 충돌하므로 반드시 숙지한다. 상세: [`agent_code_hyperfall_rule_conflict.md`](mydocs/manual/agent_code_hyperfall_rule_conflict.md).

- 소스 수정 전 반드시 작업지시자 승인 요청
- 작업은 GitHub Issue 기준으로 추적
- 새 기능, 버그 수정, 구조 변경은 `이슈 -> 브랜치 -> 오늘할일 -> 계획서 -> 구현 -> 검증 -> 최종 보고서 -> PR` 순서 절대 생략 금지
- 각 단계 완료 후 승인 없이 다음 단계 진행 금지
- 범위가 불명확하거나 기존 작업과 충돌할 가능성이 있으면 먼저 확인
- 사용자나 다른 작업자가 만든 변경은 되돌리지 않음
- 이슈 close는 작업지시자 승인 후 또는 PR merge 확인 후에만 수행
- 문서 수정은 기존 내용을 먼저 읽고 필요한 부분만 수정하며, 불가피할 때만 내용을 추가
- 제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서를 생성, 이동, 수정할 때는 수행계획서에 문서 위치 판단을 기록하고 승인받음
- `mydocs/manual`은 대상 프로젝트 제품 문서 위치가 아니며, 공식 문서 루트(`docs/`, `specs/`, `site/`, `website/`, `adr/` 등)는 대상 프로젝트가 별도 task에서 명시적으로 선택
- 작업 완료 후 다음 작업에 필요하지 않은 로컬/원격 부산물은 정리
- PR merge와 이슈 close 후에는 `devel`로 돌아오고, 더 이상 필요 없는 `local/task{번호}` 브랜치와 임시 worktree를 정리

**승인 간주 조건**: 작업지시자가 같은 스레드에서 "계속 진행", "다음 단계 진행"처럼 명시 지시한 경우에만 해당 단계 승인으로 간주한다.

## 명명 규칙

- 마일스톤: `M{버전}` (예: M100=v1.0.0, M05x=v0.5.x). 문서 파일명은 `m{숫자}` 소문자 (예: `m100`)
- 브랜치: `local/task{이슈번호}` (작업), `publish/task{이슈번호}` (`devel` 대상 PR 게시용)
- 커밋 메시지:
  - 기존 상태의 이슈 없는 bootstrap 커밋은 기존 영어 Conventional Commit 형식(`feat(electron): ...`, `refactor(core): ...`, `docs(electron): ...`)을 따른다.
  - 향후 Issue 기반 작업의 기본형: `Task #{번호}: 내용`
  - 단계: `Task #{번호} Stage {N}: 내용`
  - 하위 단계: `Task #{번호} [Stage {N.M}]: 내용`
  - 보고서 묶음: `Task #{번호} Stage {N} + 최종 보고서: 내용`
- 문서 파일명: `task_{milestone}_{이슈번호}{_impl|_stage{N}|_report}?.md`. 신규 문서는 마일스톤 포함 형식 강제. 상세: [`document_structure_guide.md`](mydocs/manual/document_structure_guide.md)
- 모든 문서는 이 저장소에 선택된 Hyper-Waterfall locale로 작성한다.

## 핵심 강제 규칙 (변경 전 매뉴얼 확인 필수)

### GPUWatcher 프로젝트 규칙

#### Current Shape

- GPUWatcher is a macOS Electron desktop app for monitoring Linux NVIDIA GPU hosts over system `ssh`; Tauri has been removed from the active runtime.
- Runtime flow: React renderer -> action-specific Electron preload/IPC -> local Rust helper CLI -> `gpuwatcher-core` -> fixed no-install SSH commands -> local SQLite read model.
- Remote hosts need only an NVIDIA driver with `nvidia-smi`, a POSIX shell, `ps`, and key-based SSH from macOS. Do not document or add remote GPUWatcher/nvitop/Python/collector installs.

#### High-Value Paths

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

#### Commands

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

#### Verification Gotchas

- Normal tests must not require live SSH or `tml-server`; live checks stay ignored and env-gated with the exact command above.
- `npm run electron:pack` creates an unsigned local `.app` directory, not a signed/notarized/DMG/uploaded release. Discover the app path with `find release/electron -name GPUWatcher.app -type d` instead of hardcoding `mac` vs `mac-arm64`.
- `npm run electron:dist:unsigned` creates internal/test unsigned DMG+ZIP artifacts only. They are not signed, notarized, uploaded, auto-updated, production release-ready, or external distribution-ready.
- Plain Vite browser runs lack the Electron preload bridge; screens should keep static identity/read-only empty states and explicit `backend_unavailable` errors for backend actions.
- Use `GPUWATCHER_TEST_DATA_DIR` only for tests/smoke isolation. Production data lives under the macOS data dir as `GPUWatcher/gpuwatcher.sqlite3`.
- Rust LSP may be unavailable because `rust-analyzer` is not installed here; use `cargo fmt`, focused Cargo tests, and crate tests for Rust verification.
- GUI-launched Electron may not inherit Terminal SSH state (`SSH_AUTH_SOCK`, first-use `known_hosts`, passphrases, remote `PATH`). Reproduce SSH failures from the same launch context.

#### Product Invariants

- Backend synthesizes protocol v1 JSON locally from sectioned command output; remote stdout is not protocol JSON.
- Store only the latest successful snapshot. Failed polls update health/error metadata and preserve stale success without adding history samples.
- Unknown/unavailable GPU or process metrics stay `null`/`unknown`; never convert `N/A`, `-`, missing pmon/dmon, or disappeared PIDs to zero.
- Optional `compute-apps`, `pmon`, `dmon`, `mig`, PCIe, and `ps` sections may degrade to warnings if the required base GPU CSV succeeds.
- Migration backups are local SQLite copies made only before destructive legacy schema changes; restore by closing the app and replacing the DB with the backup copy.

#### Do Not Reintroduce

- Tauri runtime, `@tauri-apps/*`, `src-tauri/`, Tauri docs as active setup, or `TAURI_` config.
- `gpuwatcher --json` as a runtime path.
- `collectorCommand` / `collector_command` in runtime API, UI, DB saved settings, or docs except legacy migration tests/negative guardrails.
- User-configurable remote shell commands or alternate installed-collector modes.
- Generic renderer bridge methods such as `invoke`, `runAction`, arbitrary helper action dispatch, helper path exposure, or renderer-callable `pollDueServers`.
- Claims that unsigned local packages or internal/test DMG+ZIP artifacts are signed, notarized, uploaded, auto-updated, production release-ready, or suitable for external distribution.

#### Commit Convention

- Do not commit unless explicitly requested.
- Existing history uses English conventional commits such as `feat(electron): ...`, `refactor(core): ...`, `docs(electron): ...`.
- Every future commit attribution must include exactly:
  `Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)`
  `Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>`

## 필수 참조 문서

- [`README.md`](README.md) — 프로젝트 개요, 초기 설정, 빌드
- [`mydocs/manual/document_structure_guide.md`](mydocs/manual/document_structure_guide.md) — `mydocs/` 폴더 역할, 문서 파일명, 외부 PR 폴더 정책, Skills 위치 정책
- [`mydocs/manual/task_workflow_guide.md`](mydocs/manual/task_workflow_guide.md) — 타스크 진행 15단계, 커밋 메시지 규칙, 작업 시간 규칙
- [`mydocs/manual/git_workflow_guide.md`](mydocs/manual/git_workflow_guide.md) — 브랜치 정책, Git 다이어그램, 메인테이너/컨트리뷰터 워크플로우
- [`mydocs/manual/pr_process_guide.md`](mydocs/manual/pr_process_guide.md) — 외부 기여 PR 검토
- [`mydocs/manual/agent_code_hyperfall_rule_conflict.md`](mydocs/manual/agent_code_hyperfall_rule_conflict.md) — 하이퍼-워터폴과 에이전트 기본 동작 충돌 규칙
- [`electron/helperContract.ts`](electron/helperContract.ts), [`electron/scheduler.ts`](electron/scheduler.ts), [`electron/helperRunner.ts`](electron/helperRunner.ts), [`src/lib/api.ts`](src/lib/api.ts), 그리고 `crates/gpuwatcher-core/`와 `crates/gpuwatcher-helper/` — GPUWatcher 런타임, 보안 경계, 검증 계약

## Agent Skills

하이퍼-워터폴 절차의 정형 시점은 SKILL로 분리한다. 진실 원천은 `mydocs/skills/`이며, Codex(`.agents/skills`)와 Claude Code(`.claude/skills`)는 심볼릭 링크로 동일 본문을 인식한다. 상세: [`document_structure_guide.md`](mydocs/manual/document_structure_guide.md)의 "Agent Skills 위치 정책".

## 작업 규칙

- 작업 시간의 시작과 종료는 작업지시자가 결정한다. 에이전트가 임의로 작업 종료를 제안하거나 시간을 한정하지 않는다.
