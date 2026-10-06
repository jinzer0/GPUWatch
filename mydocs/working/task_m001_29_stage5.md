# Task #29 Stage 5 단계 보고서 — Codex 리뷰 회귀 수정

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 5
상태: 제품 수정·보완·전체 검증 완료 — 같은 스레드의 `stage5 커밋 승인 단계 승인`으로 Stage 5 산출물·단계 커밋 승인 수령

## 단계 목적

PR #30의 Codex review `5428186807`에 있는 P2 두 건을 수정한다.

- [comment 4195130711](https://github.com/jinzer0/GPUWatch/pull/30#discussion_r4195130711): 무변경 서버 저장이 가용 관측과 watch sustain을 초기화하는 문제.
- [comment 4195130721](https://github.com/jinzer0/GPUWatch/pull/30#discussion_r4195130721): 새 SSH config 검색에서 이전 선택과 결과가 남아 동일 alias의 변경된 대상을 재동의 없이 저장할 수 있는 문제.

작업 위치는 기존 `GPUWatch-task29`, `local/task29`다. 작업지시자가 exact 계획 SHA `fdc1aa7da3d097c75e5db0234bbaddb4c5e7015c approved`를 승인했다. 계획 commit은 `_impl.md` 하나만 변경했고 HEAD ancestor이며, 승인본·HEAD·index·working-tree mode `100644`, blob `d39c7892d0bf314a7398299e0a96690dc2352431`이 일치함을 확인했다. 이번 제품 변경은 아직 staging/커밋/push하지 않았다.

통합 실패 뒤 추가 직접 영향 파일·계획 보완 내용과 계획서 단독 커밋 승인을 받았다. 기존 미커밋 작업은 그대로 보존한 채 owned clean 임시 worktree에서 계획서만 독립 커밋하고 임시 worktree를 제거했다. 이후 같은 스레드의 `fa573629f0db4d81f13e4b51c0e34380b75a2596 승인`으로 보완 구현에 진입했다. 최신 승인 계획은 HEAD ancestor이며 단일 `_impl.md` 변경, mode `100644`, 승인본·HEAD·index·working-tree blob `36c839be6d02f27b9fa79214fa7c4cecdac59934`가 일치한다. 아래 최종 재검증 기준 HEAD는 이 계획 commit이다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `crates/gpuwatcher-core/src/repository/servers.rs` | Immediate transaction에서 최신 레코드와 정규화 값을 비교. 완전 동등 저장은 no-op, 이름만 변경은 observation/watch/health/config_revision 보존. 실제 관측 설정 변경만 revision 증가·reset |
| `crates/gpuwatcher-core/tests/gpu_availability.rs` | 동일/정규화 동등/이름 변경, online/polling, 누적 중 watch·이미 발송한 watch 보존. 실제 host/port/user/key/interval/enabled 변경 reset과 이력 보존 |
| `crates/gpuwatcher-core/tests/storage/repository_server_contract.rs` | 무변경 전체 record/health/revision 보존, 이름 변경 중 poll 완료, WAL writer 대기 뒤 최신 값 비교. 기존 stale-poll 검증은 실제 host 변경으로 유지 |
| `crates/gpuwatcher-core/src/service.rs` | stale-poll 테스트 fixture를 실제 host/port 변경으로 정합화. 이름만 변경한 성공 poll 수용·snapshot/history·online health 회복 회귀 추가; 제품 service API 변경 없음 |
| `src/features/settings/useSettingsController.ts` | 새 검색 성공 시 선택 alias와 이전 bulk 결과 초기화. importedServers/ref는 보존 |
| `src/features/settings/SettingsScreen.test.tsx` | 동일 alias가 다른 host/user로 변경된 재검색에 재선택 요구·정확한 새 target 저장, stale registry에서도 이전 저장 성공 항목의 중복 방지 |
| `src/features/settings/ServerManagerSheet.tsx` | fallback은 닫힘 요청 세대와 당시 연결된 trigger에 결박; 계속 편집은 요청·연결된 해당 modal/control에 결박 |
| `src/features/settings/ServerManagerSheet.test.tsx` | frame 실행 순서를 제어한 이전 fallback/계속 편집 간섭 방지 및 현재 요청의 field focus 성공 회귀; 기존 Cancel/fallback assertion 유지 |
| `mydocs/orders/20261005.md`, 이 보고서 | 진행 재개·중간 실패·최신 승인·최종 통과 및 후속 승인 경계 기록 |

## 본문 변경 정도 / 본문 무손실 여부

schema/API/DTO·원격 SSH 명령·no-install·watch 임계값/쿨다운 이력·원본 설계·제품 문서는 변경하지 않았다. 최종 보고서는 Stage 5 완료 뒤 별도 갱신 단계이므로 이번에 수정하지 않았다.

이름만 변경할 때 revision을 증가시키면서 polling health를 보존하면 `service/polling.rs`의 stale 결과 폐기 경로가 health를 정리하지 않아 polling이 남을 수 있다. 따라서 이름 변경도 collection revision을 보존한다. 실제 연결/주기/enabled 변경에 대한 이전 poll rejection assertion은 삭제하지 않고 실제 host 변경으로 검증한다. 무변경 저장의 불필요한 revision churn도 없다.

재검색은 새로운 동의를 요구하지만 이미 로컬에 저장된 서버를 잊지 않는다. 기존 부분 성공/실패 재시도·StrictMode 자동 연결 검증은 유지한다. 테스트·timeout·skip/경고를 변경해 실패를 숨기지 않았다.

## 검증 결과

### 재현과 focused 검증

- 새 frontend 재검색 회귀 두 건을 source 수정 전에 실행하여 둘 다 실패했다: checkbox checked 값이 유지되고 이전 bulk summary가 남았다. 수정 후 해당 회귀를 포함한 settings/controller와 management **2 files / 56 tests**가 통과했다.
- core availability **18 passed**, storage/read-model **46 passed**. 동등 저장과 이름 변경의 관측·watch·health·in-flight poll 유효성을 검증한다.
- 부모가 합쳐진 Rust 변경에 `cargo fmt --all`을 한 번 적용했고 format check 및 whitespace가 통과했다. JS/TS formatter를 추가하지 않았다.

### 중간 전체 검증 실패 이력 — 최종 결과와 구분

2026-10-06 21:40:59 (+09:00)부터 아래 승인된 명령을 실행했다.

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state
npm run test -- --run src/features/settings/SettingsScreen.test.tsx src/features/settings/ServerManagerSheet.test.tsx
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml --all -- --check
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
```

앞의 네 명령 exit0, 마지막 core 전체 명령 exit101이다. lib 결과는 **57 passed / 1 failed / 기존 live SSH 2 ignored**.

- 실패: `service::tests::poll_server_discards_success_when_config_revision_changes`, `crates/gpuwatcher-core/src/service.rs:298`, `assert!(!result.ok)`.
- fixture가 `server_input(..., "Renamed GPU")`로 **이름만 변경**하면서 결과가 폐기돼야 한다고 기대한다. 이번 관측 보존 동작과 맞지 않는다.
- 당시 수정 방향: 실제 host/port 등 관측 설정을 변경하도록 fixture를 바꾸고 기존 stale_discarded·snapshot/history 무저장 assertion을 유지하는 것. `service.rs`는 당시 승인 파일 밖이므로 먼저 추가 계획 보완·단독 커밋·exact SHA 승인을 받았다.

남은 승인된 명령도 실행해 다른 실패와 정상 결과를 구분했다.

```bash
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
npm run build
npm run electron:build
npm run helper:build
npm run smoke:electron:first-run
npm run electron:pack
node smoke/electron-packaged-app-smoke.mjs
git diff --check
```

- helper CLI **25 passed**. build·Electron/release helper·first-run·unsigned packaged startup/helper-error·whitespace exit0.
- 전체 Vitest는 **416 passed / 1 failed**, 총27 files/417 tests. 기존 `ServerManagerSheet.test.tsx`의 `does not delete when the safe default cancel is activated`에서 기대 invoker `Open manager` 대신 `Add fallback`에 focus가 있었다.
- 같은 test file 전체25 재실행도 **24 passed / 1 failed**. 해당 test만 분리하면 **1 passed / 나머지24 필터 제외**였다. 이 분리 실행을 전체 통과로 대체하지 않았고 다음 보완에서 callback 실행 순서를 제어한 회귀로 원인을 검증했다.
- 이 실패 시점에는 ServerManagerSheet source/test를 변경하지 않았었다. 추가 범위 승인 후 이전 시트의 지연 callback이 이후 focus를 가로채는 경로를 아래처럼 재현·수정했다.
- package의 default Electron icon·code signing skipped 경고는 유지한다. smoke는 격리된 실제 로컬 helper/SQLite와 CDP/guard이며 실제 SSH/OS 알림/물리 입력 성공을 뜻하지 않는다.

### 원문 증거

- `.omo/evidence/task-29-stage5-acceptance-20261006T124059Z.txt`: SHA-256 `9883475dcb288e9ccd9bfc051528a26613bb5fcb203e2173189b4785681fd540`. focused 성공 및 core 전체 실패.
- `.omo/evidence/task-29-stage5-remaining-20261006T124211Z.txt`: SHA-256 `95423809a5bd9f0dc8caea1000e80e39782d92b6e232993698d06f1b5ff68a13`. helper/build/smoke 성공 및 전체 Vitest 실패.
- 도구 artifact는 새 frontend red 회귀 `artifact://41`, 수정 후focused `artifact://43`, management file 재실행 실패 `artifact://55`, 단일 test 분리 통과 `artifact://57`. ignored 로컬 원문을 전체 성공 acceptance로 제출하지 않는다.

### 승인된 보완과 최종 재검증

- 이름 변경은 collection revision을 유지하므로 service의 기존 name-only stale fixture를 실제 host/port 변경으로 고쳤다. stale_discarded·snapshot/history 무저장 assertion은 유지하고 실제 revision 증가도 검증한다. 별도 이름 변경 성공 회귀는 이전 오류 뒤 성공한 poll 수용, 변경 이름·동일 revision·snapshot/history·online health 및 오류 해제를 검증한다.
- source 수정 전 지연 focus frame 회귀 **2 failed / 현재 요청 field 복귀 1 passed**를 재현했다. 이전 fallback frame을 새 시트가 닫힌 뒤 실행하면 새 invoker 대신 `Add fallback`으로 이동했고, 이전 계속 편집 frame을 delete retarget 뒤 실행하면 safe Cancel 대신 Close로 이동했다. 이는 단순 assertion timing 보정이 아니라 실제 오래된 callback의 간섭이다.
- fallback callback은 예약 당시 trigger를 캡처하고 닫힘 request ID·managementOpen=false·동일 연결된 trigger·새 modal 없음에만 focus한다. 계속 편집 callback은 해당 요청 ID·managementOpen·연결된 자기 modal·그 modal 내부 control을 확인한다. shared RightDrawer와 store API는 수정하지 않았다.
- 보완 후 settings/controller **31 tests**, management **28 tests**, 합계 **2 files / 59 tests** 통과. 원래의 Cancel delete 미호출·invoker 복귀 및 invoker 삭제 시 `+` fallback 검증을 유지했다.

2026-10-06 **22:18:36–22:19:32 (+09:00)**, 합쳐진 최종 소스로 다음 명령을 순서대로 실제 실행했고 **15개 명령 모두 exit0**이다. 이 최종 전체 실행은 retry/timeout 변경/skip 추가 없이 통과했다.

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml service::tests::poll_server
npm run test -- --run src/features/settings/SettingsScreen.test.tsx src/features/settings/ServerManagerSheet.test.tsx
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml --all -- --check
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
npm run build
npm run electron:build
npm run helper:build
npm run smoke:electron:first-run
npm run electron:pack
node smoke/electron-packaged-app-smoke.mjs
git diff --check
```

- core 전체 **148 passed / 기존 live SSH 2 ignored**: lib59 + availability18 + parser20 + SSH config5 + storage46. service poll focused **5 passed**, 필터 제외 테스트는 전체 core에서 다시 실행했다.
- helper CLI **25 passed**. Vitest **27 files / 420 tests passed**. renderer/Electron/release helper build·Rust format/whitespace 성공.
- first-run 및 unsigned packaged startup/helper-error smoke 성공. 별도 HOME/SQLite/userData 및 disposable `.app` copy만 사용했고 실제 SSH는 guard에서 차단했다. 신규/custom watch 값·off/on/relaunch 보존, backend History 읽기·appearance·disclosure 및 로컬 서버 저장/import/삭제 여정 유지.
- package의 default Electron icon·code signing skipped 경고를 보존한다. 운영 DB·원본 packaged helper는 변경하지 않았다. 과거 실패 원문은 삭제하거나 성공 receipt로 바꾸지 않았다.
- 최종 원문: `.omo/evidence/task-29-stage5-final-20261006T131836Z.txt`, SHA-256 `294fa20d32617c3c79050d18fcf6e6b0cf288fb51af4464c0052e80d2dc465de`. UTF-8 원문 마지막 줄바꿈까지 보존한다. focus red 회귀 `artifact://105`, 보완 후 focused59 `artifact://108`도 구분해 기록한다.

## 잔여 위험

- 중간 core fixture/focus 실패는 승인된 보완과 최종 전체 gate로 해결했다. 모든 OS focus timing을 증명한 것은 아니며 frame 제어 회귀·전체 Vitest·CDP smoke 범위다.
- 이전 helper timeout PID 소멸 간헐성, 실제 OS mouse/shortcut/drag/VoiceOver·GUI SSH·OS 알림/Focus 미검증, unsigned 한계는 유지한다.
- PR #30은 이전 OID `a3bc6e72294efa486f3bb55cb343cd91ae20e8bb`의 Open ready 상태다. closingIssuesReferences 빈 목록의 게시 검증 문제는 이 리뷰 수정과 별개이며 이번 범위로 해소했다고 주장하지 않는다.

## 다음 단계 영향

- Stage 5 산출물·단계 커밋 승인 후에만 승인된 제품8개 경로와 이 단계 보고·오늘할일2개 경로를 묶어 기록한다. 최신 승인 계획은 해당 소스 커밋에 다시 포함하지 않는다.
- 그 이후 최종 보고 전용 갱신·수용과 원격 업데이트는 별도 단계다. 기존 final report/evidence 및 publication tuple은 새 OID에 재사용하지 않는다.
- merge·issue close와 main/devel의 closing linkage 정책 문제는 이번 승인에 포함하지 않는다.

## 승인 요청

최신 계획 `fa573629f0db4d81f13e4b51c0e34380b75a2596`, core148/helper25/Vitest420·focused59 및 두 smoke의 성공, 위 증거·미검증 한계를 기준으로 요청한 **Stage 5 산출물·단계 커밋 승인**을 같은 스레드의 `stage5 커밋 승인 단계 승인`으로 받았다. 제목은 `Task #29 Stage 5: Codex 리뷰의 서버 관측과 SSH 재검색 회귀 수정`이다. 승인된 제품8개 경로와 단계 보고·오늘할일2개 경로만 묶는다. 최종 보고 갱신 착수·수용·전용 커밋·원격 PR 업데이트·merge·issue close는 이 승인에 포함하지 않으며 각각 별도 경계다.
