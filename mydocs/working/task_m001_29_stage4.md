# Task #29 Stage 4 단계 보고서

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 4 — 가용 관측·알림·통합 인계
상태: 구현·검증 완료, 산출물·단계 커밋 승인 완료

## 단계 목적

알림 opt-in과 독립적인 기본 GPU 가용 관측, 저장된 watch 조건·발송 이력 보존, main lifecycle 초기화 및 새 사용자 여정의 통합 검증을 수행했다.

- 작업 위치: `GPUWatch-task29`, `local/task29`. Stage 4 구현 기준 HEAD는 `57409759a4025cee20386e5e718f4d97a2d77c76`이다.
- 작업지시자의 같은 스레드 `모두 승인`으로 계획 보완 내용과 독립 커밋을 승인받아 `_impl.md`만 `ada896c8bfbc678a572077f1c44538349928b7b3`에 기록했다. 이어 exact SHA 승인 후 추가 구현·검증을 수행했다.
- 승인 계획 commit은 검증 기준 HEAD의 ancestor이며 승인본·HEAD·index·working tree blob `ccbbad2fb66c9e51bb9bc41875e18612187638b9`, mode `100644`가 일치한다. 커밋 preflight의 원 index는 clean이다. 검증·보고서 작성 시점에는 Stage 4 소스 커밋·push·PR·merge·이슈 close를 하지 않았다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| core `repository/availability.rs`, `repository.rs`, `repository/schema.rs`, `snapshots.rs`, `models.rs` | opt-in 독립 관측·required DTO·additive v4·snapshot과 원자적 갱신, read-before-write immediate transaction |
| core `repository/watches.rs`, `servers.rs`, service 및 read-model 연결 | 저장값·armed·last-triggered 보존, 실제 성공 관측·최소 실효 cooldown 900초, detail metadata 투영 |
| core `tests/gpu_availability.rs`, storage watch/outbox/migration 테스트 | 299/300초·공백 경계·실패·unknown·UUID/index·중복/역행·reset·v3 보존·rollback·실제 watch MiB JSON 회귀 |
| helper contract/action names/dispatch 및 CLI 테스트 | 정확히 `{serverId: string 또는 null}`만 허용하는 main-only reset, malformed payload는 storage 열기 전 거부 |
| Electron contract/payload validation/scheduler/main 및 테스트 | startup/suspend/resume 직렬화·generation fence·실패 시 수집 차단·과거 outbox 무배너 소비·테스트 userData 격리 |
| detail card/controller/types 및 화면·DTO fixture | backend available만 강조, stale/off/실패에는 새 강조 금지, 기존 watch id·조건 보존·권한 unknown |
| `useSettingsController.ts`, `ServerManagerSheet.test.tsx` | target 준비 후 취소 가능한 microtask에서 자동 test 1회 실행, StrictMode 지연 성공·실패·unmount 취소 회귀 |
| smoke first-run/packaged·bridge/DOM/evidence | 서버 중심 여정·실제 로컬 helper·SSH 차단·격리 app 복사·진실한 증거, 폐기 탭 전용 시나리오 제거 |
| `README.md`, `docs/smoke-checklist.md`, `docs/demo/demo-script.md` | 현 UX·관측/알림·no-install·검증 한계 정합화 |

## 본문 변경 정도 / 본문 무손실 여부

기존 snapshot/history/watch 설정을 제거·변환하지 않는 additive v4다. failed/unknown/off/reset에서는 관측 구간만 무효화하고 armed·이전 발송 시각을 재준비시키지 않는다. 과거 pending outbox는 lifecycle 경계에서 표시 없이 소비하여 재시작 뒤 새 가용 알림으로 전달하지 않는다. reset helper 자체는 outbox를 삭제하지 않는다.

동일 timestamp success는 metadata만 유지하며 다른 telemetry로 덮지 않도록 snapshot/history도 무변경 처리한다. 기본 가용 판단과 custom 알림을 분리하고 작은 저장 cooldown은 덮어쓰지 않는다. watch JSON memory 필드는 기존 TS/IPC의 `memoryThresholdMiB`에 Rust serde를 명시적으로 맞췄으며 obsolete `memoryThresholdMib` alias/fallback은 추가하지 않았다.

History renderer UI는 복원하지 않았고 backend 저장/API는 유지했다. Tauri·원격 collector 설치·generic bridge·renderer reset/poll 호출은 추가하지 않았다. 제품 문서는 승인된 기존 위치에서 수정했으며 historical 문서·설계 사본·원 worktree는 보존했다.

## 검증 결과

```bash
npm run test -- --run src/features/settings/ServerManagerSheet.test.tsx
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml --all -- --check
cargo fmt --manifest-path crates/gpuwatcher-helper/Cargo.toml --all -- --check
npm run test -- --run
npm run build
npm run electron:build
npm run helper:build
npm run smoke:electron:first-run
npm run electron:pack
node smoke/electron-packaged-app-smoke.mjs
git diff --check
```

- OK: management focused **25 tests**, 전체 Vitest **27 files / 415 tests**. 마지막 전체 시작 출력 `17:56:28`.
- OK: core **142 passed**, 기존 live SSH **2 ignored** 유지. 가용 target **16 passed** 포함. helper CLI **25 passed**. normal gates는 실제 SSH·운영 DB에 의존하지 않는다.
- OK: renderer/Electron TypeScript·Vite 및 Rust format/whitespace check. package 과정에서도 renderer/Electron/release helper를 다시 빌드했다.
- OK: `npm run smoke:electron:first-run`. 격리 HOME/SQLite/userData에서 실제 로컬 저장·편집·import 두 항목·삭제·취소·saved-target 자동 test 결과를 확인했다. test는 SIMULATED guard 진단 1회이며 실제 SSH 이전에 차단된다. monitoring-start는 메뉴 확인만 했다.
- OK: 독립 GPU/추가 지표 펼침·세션 reset·마지막 서버 복원·appearance singleton/dark 동기화. 실제 disabled GPU DTO는 `unknown`, `conditionStartedAt:null`이고 available state를 조작하지 않았다. backend History는 읽히고 renderer History는 없다.
- OK: UI 신규 watch의 실제 기본값 5%/1024MiB/300초/900초, custom 3%/512MiB/420초/저장 cooldown120초를 확인했다. UI off/on·relaunch에서 동일 rule ID와 저장값을 유지하고 실효900초/OS권한unknown을 표시한다. 최종 dark GPU 화면도 직접 확인했다.
- OK: unsigned `.app` startup 및 nonexec helper-error 복구 smoke. 최종 package 실행 완료 UTC `2026-10-06T08:56:50.462Z`. 원본 app/helper는 변경하지 않고 disposable copy에서만 guard/fault를 적용했다. nonrepo cwd의 실제 로컬 저장, ASAR 밖 helper, 구조화된 EACCES, dirty 보호 후 form 재진입, source helper executable 및 복사 cleanup을 확인했다.
- package의 기본 Electron icon·code signing skipped 경고를 보존한다. 생성물은 unsigned 로컬 `.app`이며 signed/notarized/DMG/배포 성공이 아니다.

### 중간 실패와 처리

- StrictMode mount effect에서 자동 mutation을 시작하면 observer replay 후 pending에 머무르던 문제는 target 준비 이후 취소 가능한 microtask로 분리하고 request/version fence 및 한 번 실행 ref를 유지하여 해결했다. deferred 성공·실패와 unmount 취소 회귀, 실제 first-run 결과 종료를 검증했다.
- 실제 helper smoke에서 memory 조건이 `undefined`였던 casing 불일치는 Rust input/DTO에 `memoryThresholdMiB` rename을 적용했다. 비기본값 JSON deserialize·DB 저장·serialize 테스트와 UI custom512MiB roundtrip을 추가했다.
- WAL의 deferred read→write upgrade에 따른 concurrent CLI `database is locked`는 snapshot 성공 및 watch save transaction을 immediate로 고쳐 해결했다. 전체 core/helper concurrency 회귀를 다시 실행했다.
- v4 migration 동시 connection의 lock, 계약 순서·fs mock·custom 알림 제목 기대 불일치도 수정 후 최종 gate로 대체했다.
- packaged copy ICU crash는 상대 framework symlink를 보존하여 해결했다. helper-error 시트 readiness 실패는 실제 modal/focus 및 닫힘 후 invoker 복귀를 기다리도록 smoke를 정정했다. dirty 확인 표면에서 form 본문이 없다는 이유만으로 전체 시트 닫힘을 판정하지 않는다.
- 기존 helper timeout PID 소멸 테스트가 최종 전체 실행 중 **1회 실패**했다. 테스트·timeout·assertion을 변경하거나 skip하지 않았다. 동일 test file의 **11 tests** 및 전체 **415 tests**를 그대로 재실행하여 통과했다. 간헐성은 잔여 위험으로 기록하며 무실패 첫 실행이었다고 주장하지 않는다.

로그·캡처는 worktree의 ignored `.omo/evidence/` Task29 파일에 보존한다. 임시 HOME/DB/userData/app 및 owned processes는 시나리오 `finally`에서 정리한다. 실제 OS 입력·SSH·알림 검증과 CDP/guard 검증을 혼동하지 않는다.

## 잔여 위험

- 실제 OS mouse/shortcut·VoiceOver·native titlebar drag·실제 SSH 인증/GUI SSH 환경·알림 허용/거부/Focus는 검증하지 않았다. simulated guard 및 CDP 성공은 이 항목들의 성공 증거가 아니다.
- helper timeout PID 소멸 assertion의 1회 간헐 실패는 최종 동일 gates에서 재현되지 않았다. helperRunner source/test는 이번 보완에서 변경하지 않았다.
- signed/notarized release·외부 배포·자동 업데이트는 범위 밖이다.

## 다음 단계 영향

Stage 4 산출물·단계 커밋 승인을 받아 exact 변경 파일/blob/mode·parent/tree·attribution fence로 단계를 커밋한다. 최종 Task29 보고서·오늘할일 완료 처리와 이후 게시/PR/merge/close는 해당 단계 승인 경계를 따르며 이번 승인으로 확대하지 않는다.

## 승인 요청

작업지시자가 같은 스레드에서 **Stage 4 산출물·단계 커밋 승인**을 명시했다. 기준은 승인 계획 `ada896c8bfbc678a572077f1c44538349928b7b3`, core142/helper25/Vitest415 및 first-run/unsigned packaged 통합 smoke 성공, 위 미검증·간헐성 한계다. 최종 보고서 착수와 최종 게시 등은 별도 승인 대상이다.
