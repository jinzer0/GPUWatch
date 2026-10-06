# Task #29 최종 보고서 — 네이티브 macOS UX/UI 설계 적용

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
마일스톤: M001
작성일: 2026-10-06
상태: Stage 1–5 승인·커밋 완료, Stage 5 포함 최종 보고서 갱신·통합 재검증 완료 — 보고서/오늘할일 전용 커밋 승인 대기
수행계획서: [`task_m001_29.md`](../plans/task_m001_29.md)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)

## 작업 요약

- 대상 이슈: #29, 단계 수: 5. 웹 대시보드형 탭을 서버 선택 → GPU 상태 확인 → 같은 카드에서 프로세스 비교하는 절제된 macOS UX로 전환했다.
- 서버 sidebar, 독립 GPU 카드와 분절 미터, 프로세스·추가 지표, 서버별 관리 메뉴/시트, singleton 외형 설정 창을 연결했다. 저장은 SSH 연결 성공과 구분하고 실패·미저장 입력·부분 가져오기·focus 복귀를 보존한다.
- 알림 opt-in과 독립적인 backend 가용 관측을 추가했다. 알려진 UTIL ≤5%와 VRAM ≤1024MiB의 연속 성공 관측 300초가 기본 조건이다. 알림은 저장된 조건·rule ID·armed·발송 이력을 보존하고 최소 실효 cooldown 900초를 적용한다.
- 런타임은 macOS Electron + React + 로컬 Rust helper + system SSH다. 원격에는 NVIDIA driver/`nvidia-smi`, POSIX shell, `ps`, key-based SSH만 요구한다. Tauri·원격 collector 설치·임의 원격 명령·generic bridge를 도입하지 않았다.
- Renderer History UI만 제거했다. backend History API·DTO·DB는 유지한다. unknown/null/invalid 지표는 0으로 바꾸지 않고 VRAM 점유율과 memory activity를 구분한다.
- PR #30의 Codex P2 두 건을 Stage 5에서 수정했다. 정규화 동등·이름만 변경한 서버 저장은 관측/watch sustain/health와 collection revision을 보존하고 실제 연결 설정 변경만 초기화·stale-poll 차단한다. 새 SSH config 검색 성공 시 이전 선택/결과를 초기화하고 이미 저장된 서버의 중복 방지는 유지한다. 직접 영향 stale-poll 테스트를 정합화하고 오래된 focus callback의 새 요청 간섭을 차단했다.

### 작업·승인 기준

작업은 `/Users/kjy/Desktop/Codes/projects/GPUWatch-task29`, `local/task29`에서 수행했다. 원 worktree·사용자 BMad/설계 자료는 변경하지 않았다.

| 기준 | exact OID |
|---|---|
| 승인된 origin/devel 시작점 | `000dac5f33cefdf8cd2f2f12b7c0fcb6a4bd73b1` |
| 최초 구현계획 독립 커밋 | `de0277cd2bb38afdc43a0f0ad4272d7fd58e9916` |
| Stage 2–3 승인 구현계획 | `6a4f059a5961c86b398bfeeab285d7835a8632a3` |
| Stage 4 승인 보완 구현계획 | `ada896c8bfbc678a572077f1c44538349928b7b3` |
| Stage 5 최초 승인 계획 | `fdc1aa7da3d097c75e5db0234bbaddb4c5e7015c` |
| 최신 승인 보완 구현계획 | `fa573629f0db4d81f13e4b51c0e34380b75a2596` |
| 최신 계획 blob, mode | `36c839be6d02f27b9fa79214fa7c4cecdac59934`, `100644` |
| 최종 제품 검증 HEAD / Stage 5 | `a0cd358ad184a7de615dd1c0a549bc1670b8fc6e` |
| Stage 5 tree | `24b2980e118a9e5183dbe7789c1b407f3f6d6b0e` |

최종 재검증 전에 clean worktree/index, branch/HEAD, replace ref 없음, 승인 계획 커밋의 단일 변경 경로·ancestor·mode를 확인했다. 승인본·HEAD·index·working-tree 계획 blob이 모두 일치했다. 계획서 본문에 남은 과거 승인 대기 표시는 과거 기록이며 최신 승인 근거는 위 exact SHA와 Stage 5 기록이다. 이번 보고서에서 승인 계획을 다시 수정하지 않았다.

2026-10-06 같은 스레드의 `최종보고서 승인`은 직전에 요청한 **최종 보고서 착수 및 오늘할일 완료 처리** 승인으로 접수했다. 전용 커밋·final report/evidence 수용·publication·merge·issue close로 확대하지 않는다. read-only GitHub 조회에서 canonical repository ID `1256824919`, `jinzer0/GPUWatch`, 이슈 OPEN/M001을 확인했다.

최초 최종 보고서/오늘할일은 별도 커밋 `a3bc6e72294efa486f3bb55cb343cd91ae20e8bb`과 수용 승인을 거쳐 PR #30으로 게시됐다. Stage 5 산출물·단계 커밋은 같은 스레드의 `stage5 커밋 승인 단계 승인`에 따라 exact10경로·blob/mode·parent/tree·전체 index·attribution·clean 상태를 검증해 기록했다. 이후 **최종 보고서 갱신 단계 착수 승인** 요청에 대한 `승인`을 받아 이번 갱신·재검증만 수행했다. 이전 수용/publication 승인을 새 최종 OID에 재사용하지 않으며, 이번 착수 승인을 커밋·게시·merge·issue close 승인으로 확대하지 않는다.

## 변경 파일 목록과 영향 범위

최종 제품 HEAD `a0cd358ad184a7de615dd1c0a549bc1670b8fc6e`와 시작점 사이 diff는 **138개 파일, 10,866줄 추가 / 6,739줄 삭제**다. 계획·단계 기록·이전 최종 보고·설계 사본을 포함한 값이며 제품 코드만의 크기나 성능 지표가 아니다. 이번 미커밋 보고 갱신분은 이 비교에서 제외했다. 아래는 책임별 경로 요약이다. 개별 산출물 목록은 단계 보고서와 해당 exact commit diff로 추적한다.

| 경로 | 변경 요약 | 영향 범위 |
|---|---|---|
| `docs/ux/task_m001_29/`의 8개 파일 | 최종 UX 계약·결정 이력·HTML 시안 사본 | 승인 입력 보존; 원본/역사 문서 변경 없음 |
| `electron/main.ts`, `appearance.ts`, `uiContract.ts`, `uiIpc.ts`, `preload.ts`, `preload-runtime.cts` 및 테스트 | 창 역할·singleton 설정·main 소유 외형·전용 UI IPC | 두 창 동기화, sender/frame/URL 보안, helper 오류 시 static shell 유지 |
| `src/App.tsx`, `components/Shell.tsx`, `lib/store.ts`, `lib/appearance.ts`, `features/settings/AppearanceSettings.tsx` 및 테스트 | 서버 탐색·마지막 선택·외형·세션 disclosure | 옛 화면 종류별 탐색 제거; 외형 창은 서버 수집 초기화 없음 |
| `src/features/detail/`의 카드·미터·프로세스·controller 및 테스트, `src/lib/types.ts`, fixture | 20분절 미터·전체 명령 표·추가 지표·backend availability | unknown/0 구분, 정보 보존, 독립 펼침, backend 상태만 강조 |
| `src/features/settings/`의 메뉴·시트·form·import·controller 및 테스트 | 명시적 관리 target와 request/version fence | Cancel-first 삭제, dirty 보호, 실패 회복, partial import 중복 방지, StrictMode 자동 test 1회 |
| Stage 5의 `repository/servers.rs`, `service.rs` 테스트, availability/server contract 테스트 및 settings controller/시트/테스트 | 동등·이름 저장 보존, 새 검색 재동의, request-bound 지연 focus | 실제 설정 변경만 observation reset/revision 증가; 기존 stale-poll·Cancel/fallback 회귀 유지 |
| `src/index.css`, `src/lib/api.ts`, `global.d.ts`, `visibility.ts`, `src/AGENTS.md` 및 관련 테스트 | 새 표면·타입·공유 식별·runtime 인덱스 | 라이트/다크, 내부 스크롤, plain-Vite backend 오류 및 보안 규칙 유지 |
| `src/features/overview/`, `processes/`, `history/`의 폐기 화면, `DetailGpuHistorySection.tsx`, `src/lib/liveHistory.ts`와 전용 테스트 | UI 전용 코드·탭·chart/live samples 제거 | backend History와 그 API 검증 유지; density 상태 제거 |
| `crates/gpuwatcher-core/src/`의 models/read-model/repository/service 및 availability/storage 테스트 | additive schema v4·성공 snapshot/가용/watch 원자 저장 | 실패 시 stale 성공 보존, lifecycle/gap/unknown/중복 관측 회귀, immediate write transaction |
| `crates/gpuwatcher-helper/`의 contract/dispatch와 CLI 테스트 | strict main-only reset, `memoryThresholdMiB` 계약 | payload storage 초기화 전 검증; alias/fallback 없음 |
| `electron/helperContract.ts`, actions, payload validation, scheduler 및 테스트 | readiness·startup/suspend/resume 직렬화·generation fence | reset 실패 시 수집/detail 차단, 과거 outbox 무배너 소비, renderer reset/poll 노출 금지 |
| `smoke/scenarios/`, `smoke/shared/` 및 폐기 process-ledger smoke | 새 여정·격리 helper/SQLite·disposable app 검증 | 실제 SSH 차단, source app/helper 미변경, obsolete 탭 시나리오 제거 |
| `README.md`, `docs/smoke-checklist.md`, `docs/demo/demo-script.md` | 현 UX·관측/알림·no-install·검증 한계 | 승인된 기존 사용자 문서 위치 유지 |
| `mydocs/plans/`, `working/`, `orders/`, 이 최종 보고서 | 승인·검증·커밋 추적 | 제품 문서와 내부 작업 기록 분리 |

## 문서 위치 검증

수행계획서의 문서 위치 판단과 구현계획서의 위치 확인 표를 실제 diff와 대조했다. 새로운 제품 문서 루트는 만들지 않았다.

| 파일 | 계획된 위치 | 실제 위치 | 결과 | 근거 |
|---|---|---|---|---|
| UX 입력 사본 8개 | `docs/ux/task_m001_29/` | 동일 | OK | Stage 1 고정 해시, 상대 구조 보존 |
| 사용자 개요 | 기존 `README.md` | 동일 | OK | Stage 4 직접 영향 섹션 갱신 |
| UI 검증·데모 | `docs/smoke-checklist.md`, `docs/demo/demo-script.md` | 동일 | OK | Stage 4 새 사용자 여정 정합화 |
| renderer runtime 인덱스 | 기존 `src/AGENTS.md` | 동일 | OK | 승인된 Stage 2 계획 보완, no-install/보안 유지 |
| 단계 보고 | `mydocs/working/task_m001_29_stage{N}.md` | 동일 | OK | Stage 1–5 각 보고서 |
| 최종 보고·오늘할일 | `mydocs/report/task_m001_29_report.md`, `mydocs/orders/20261005.md` | 동일 | OK | 승인된 내부 기록 위치; 날짜별 새 orders 중복 생성 없음 |

`docs/plan/`, `docs/draft/`, 승인 설계 사본 및 원본 `.memlog.md`는 구현 중 수정하지 않았다. `mydocs/manual/`에 제품 계약을 복제하지 않았다.

## 변경 전·후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| schema version | v3 | additive v4; snapshot/history/watch/outbox 보존 |
| renderer History 화면 | 있음 | 없음; backend History 유지 |
| GPU 공통 요약 미터 | 기존 표시 | UTIL/VRAM/온도 각 20분절 |
| opt-in 독립 지속 가용 read model | 없음 | 4개 상태: in_use/candidate/available/unknown |
| 최종 Vitest | Stage 1 시점 31 files / 407 tests | 27 files / 420 tests |

테스트 수 차이는 폐기 화면 전용 검증과 새 행동 회귀의 교체를 포함한다. 실행 속도·메모리 사용·실호스트 수집 성능 비교는 수행하지 않아 개선 수치를 주장하지 않는다.

## 검증 결과

### 수용 기준 대조

| 수용 기준 | 결과 |
|---|---|
| 서버 중심 탐색·마지막 선택 복원·설정 singleton/외형 동기화 | OK — Stage 1 자동/격리 QA 및 최종 first-run |
| 다중 GPU/추가 지표 독립 펼침·전체 명령·지표 보존 | OK — Stage 2 경계 회귀·격리 renderer QA, 최종 disclosure/relaunch |
| unknown/null/invalid와 실제 0, VRAM 점유율과 memory activity 구분 | OK — 미터/detail/parser/read-model 회귀 |
| 관리 대상≠상세 선택, 저장≠SSH 성공, dirty·삭제 취소·실패·partial import | OK — Stage 3 실패 주입 QA와 회귀, 최종 실제 로컬 저장/import/삭제 |
| StrictMode 자동 saved-target test 1회·pending 종료·unmount 취소 | OK — management 28 tests 포함 focused59 및 최종 first-run |
| 기본 가용과 opt-in 독립, 성공 관측300초·gap 경계·중복/역행/실패/unknown/off/reset | OK — availability18·core148, wall-clock-only promotion 없음 |
| 동등·정규화·이름 저장 관측/watch/health 보존과 in-flight poll 수용, 실제 설정 변경 폐기 | OK — availability18/storage46/service poll5 및 전체 core |
| SSH 재검색 선택·이전 요약 초기화와 stale query 중복 저장 방지 | OK — settings31 회귀, 기존 partial 실패 재시도 유지 |
| 과거 focus frame이 새 시트/retarget의 safe Cancel을 가로채지 않음 | OK — frame 순서 제어 red/green 회귀·management28·전체420; 실제 OS 입력과 구분 |
| 기존 rule ID·조건·armed·last-triggered·저장 cooldown 보존, 실효900초 | OK — watch/storage/helper 회귀; UI custom3/512/420/저장120 off/on/relaunch 확인 |
| lifecycle fail-closed·과거 outbox 무배너 소비·main-only strict reset | OK — scheduler/IPC/helper 회귀 및 packaged nonexec fault; reset 자체는 outbox/history 삭제 없음 |
| History UI만 제거, backend 데이터/API·no-install·action-specific 보안 유지 | OK — API 회귀·first-run backend History 읽기·bridge guard |
| unsigned packaged startup·ASAR 밖 helper·오류 후 관리 탐색 | OK — 최종 disposable app smoke, source helper executable 유지 |
| 실제 OS mouse/⌘,/native drag/VoiceOver·실제 SSH·OS 알림/Focus | 미검증 — 아래 한계. 자동 검증 성공으로 대체하지 않음 |

### 단계별 검증 결과와 승인 커밋

| Stage | 요약·증거 | 승인된 exact commit |
|---|---|---|
| 1 | [서버 탐색·설정 창·외형](../working/task_m001_29_stage1.md), 당시 전체407 tests·격리 Electron | `ae85f42f60e52a31c99679428d96fab17a0b822f` |
| 2 | [GPU 카드·정보 보존·History UI 제거](../working/task_m001_29_stage2.md), focused82/전체349·격리 QA | `5f463b5ed434fa2dcba8ee9f628e7438e5356c22` |
| 3 | [서버 관리·실패 회복](../working/task_m001_29_stage3.md), focused129/전체379·guard 실패 회복 QA | `57409759a4025cee20386e5e718f4d97a2d77c76` |
| 4 | [가용 관측·알림·통합 인계](../working/task_m001_29_stage4.md), core142/helper25/Vitest415·first-run/packaged | `b841f8eed2028ae4f59f2f2e5c4dbc0f94f77702` |
| 5 | [Codex 리뷰·통합 회귀 보완](../working/task_m001_29_stage5.md), core148/helper25/Vitest420·focused59·first-run/packaged | `a0cd358ad184a7de615dd1c0a549bc1670b8fc6e` |

### 최종 보고 단계의 자동 재검증

제품 HEAD `a0cd358ad184a7de615dd1c0a549bc1670b8fc6e`에서 **2026-10-06 22:56:20–22:57:09 (+09:00)**에 아래15개 명령을 순서대로 실제 재실행했다. 모든 명령 exit status는 **0**, 이 재검증에서는 retry/skip/timeout 변경 없이 통과했다.

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

- settings/management **59 passed** (31/28), availability **18 passed**, storage **46 passed**, service poll **5 passed**. core 전체 **148 passed / 기존 live SSH 2 ignored**, helper CLI **25 passed**, Vitest **27 files / 420 passed**. focused 필터 제외 테스트는 전체 gate에서 실행했다.
- renderer/Electron/release helper build, Rust format check, whitespace check 성공. JS/TS formatter 설정·의존성이 없어 임의 formatter 설치나 대규모 재포맷은 하지 않았다.
- package 출력의 **default Electron icon** 및 **macOS code signing skipped (`identity: null`)** 경고를 보존했다. packaged receipt의 별도 기존 package-log 경로에 경고가 없다는 문구는 이번 빌드 stdout에 경고가 없다는 뜻이 아니다. 이번 acceptance 원문에 실제 경고가 포함되어 있다.

#### 원문 수용 증거

- 이번 로컬 source/path: `.omo/evidence/task-29-final-stage5-acceptance-20261006T135620Z.txt` (이 worktree의 ignored 증거 파일).
- 이번 SHA-256: `97c366922866bc8e34321e874f073ad034e3612a85f47d35ec3bae6084bdc00b`.
- UTF-8 원문 전체 바이트를 결박한다. 명령·stdout/stderr·exit status·실행 시각·마지막 줄바꿈을 그대로 보존한다. 이후 approval fence의 `ACCEPTANCE_EVIDENCE`도 마지막 줄바꿈을 잘라내지 않은 같은 원문이어야 한다.
- 이 로그에 first-run/packaged receipt 전체가 포함되어 있어 고정 이름의 smoke 증거가 이후 실행으로 덮여도 이번 검증을 식별할 수 있다. 과거 `task-29-smoke-failure*` 등 중간 실패 자료는 성공 증거로 집계하지 않는다.
- Stage 4 당시20:49:36–20:50:26(+09:00)의 최초 보고 acceptance는 `.omo/evidence/task-29-final-acceptance-20261006T114936Z.txt`, SHA-256 `64a5f88c2db4fde470e909dcbbf10d649e08c2dec5f6a1c99805741eaa452475`로 보존했다. 당시14명령/core142/helper25/Vitest415 통과는 역사 기록이며 이번 final report/evidence의 재사용 대상이 아니다.
- Stage 5 보완 후22:18:36–22:19:32(+09:00)의 `.omo/evidence/task-29-stage5-final-20261006T131836Z.txt`/`294fa20d32617c3c79050d18fcf6e6b0cf288fb51af4464c0052e80d2dc465de`도 유지한다. 이번 commit 후 재검증은 별도 위 원문에 결박했다.

### 수동/시나리오 검증과 한계

- Stage 1–3의 라이트/다크 화면 직접 확인·최소 창 880×708·설정 창 420×280·포커스·시트/표 내부 스크롤은 각 보고서의 당시 관측이다. 이번 재실행에서 모든 과거 수동 QA를 다시 수행했다고 주장하지 않는다.
- 최종 first-run은 격리 HOME/SQLite/userData의 실제 로컬 helper 저장·편집·import 두 항목·삭제/취소를 검증했다. monitoring-start 메뉴는 확인만 했고 enabled host 수집은 실행하지 않았다. 연결 test는 **SIMULATED guard diagnostic**이며 실제 SSH 이전에 차단된다.
- 실제 disabled fixture의 GPU availability는 `unknown`, `conditionStartedAt:null`이었다. available 값을 조작하지 않았다. 독립 disclosure/세션 reset·마지막 서버 복원·appearance singleton/dark 동기화·backend History 읽기를 확인했다.
- 신규 watch 5%/1024MiB/300초/900초와 custom3%/512MiB/420초/저장120초를 실제 helper JSON으로 확인했다. off/on/relaunch에서 ID·조건이 보존되고 UI에 실효900초·권한unknown이 표시됐다.
- packaged smoke는 재귀 discovery한 unsigned `.app`의 **disposable copy**만 실행/변조했다. framework 상대 symlink를 보존하고 nonrepo cwd·격리 DB에서 ASAR 밖 helper를 확인했다. nonexec helper의 EACCES·수집 readiness 차단·nonblank shell·관리 재진입을 검증했다. 원본 helper는 executable이고 임시 app은 제거됐다.
- CDP keyboard/DOM click/native DOM setter는 renderer automation이다. 실제 OS 물리 입력이나 VoiceOver 검증이 아니다. fake notifier·outbox guard는 OS 배너 노출 증거가 아니다.

### CI/원격 검증

이번 갱신에서 canonical identity `1256824919`/`jinzer0/GPUWatch`, 이슈 #29 OPEN/M001, PR #30 OPEN/ready/base `devel`/head `publish/task29`/OID `a3bc6e72294efa486f3bb55cb343cd91ae20e8bb`를 read-only로 재확인했다. PR은 이전 보고서 OID에 머물러 있어 Stage 5 제품이 아직 게시되지 않았다. `closingIssuesReferences.nodes=[]`도 재확인했다. default branch는 `main`이지만 빈 linkage의 원인을 확정하거나 이번 수정으로 해소했다고 주장하지 않는다.

이전 승인으로 수행한 최초 push·PR 게시와 이번 로컬 보고 갱신을 구분한다. 이번 단계에서 push·PR 변경·CI 실행·merge·issue close는 하지 않았다. 로컬 통합 gate 성공을 원격 CI 성공으로 표현하지 않으며 기존 publication tuple을 새 최종 OID에 재사용하지 않는다.

## 잔여 위험과 후속 작업

### 잔여 위험

- Stage 4의 기존 `electron/helperRunner.test.ts` PID 소멸 assertion(`kills timed-out helper children before resolving the timeout response`)은 전체 실행에서 **1회 간헐 실패**했다. source/test/timeout/skip을 변경하지 않고 동일 file11/전체415 재실행이 통과했다. 이번 최종 전체420에서도 재현되지 않았지만 원인 수정 완료나 전체 이력이 무실패였다고 주장하지 않는다.
- Stage 5 중간 core name-only stale fixture와 management focus 실패는 추가 범위·계획·exact SHA 승인 뒤 실제 연결 설정 stale 회귀와 request-bound focus 보완으로 해결했다. source 수정 전 과거 focus frame 간섭2건을 결정적으로 재현했고 보완 후 focused59/전체420·commit 후 전체 재검증이 통과했다. 과거 실패 원문·당시 분리 실행만 통과한 이력은 단계 보고서에 보존하며 모든 실제 OS focus 타이밍을 증명했다고 주장하지 않는다.
- PR #30의 closing linkage 게시 검증은 여전히 미완료다. main/devel 정책·framework/manual 수정과 원격 replacement publication은 별도 승인 범위이며 이번 로컬 검증 성공이 해당 원격 gate를 대신하지 않는다.
- 실제 OS mouse/shortcut·native titlebar drag·VoiceOver·실제 GUI launch SSH 인증/환경·알림 허용/거부/Focus는 미검증이다. 이전 desktop capture는 `COMPUTER_SCREENSHOT_FAILED`로 실패했으므로 물리 조작 성공을 주장할 수 없다. 해당 항목의 수용은 명시적인 검증 한계와 함께 판단해야 한다.
- 생성물은 unsigned 로컬 `.app`이다. signed/notarized·업로드·DMG/ZIP 외부 배포·production release-ready·자동 업데이트 성공이 아니다.
- 원문 acceptance와 캡처는 ignored 로컬 자료이므로 PR에 Git blob으로 포함되지 않는다. 다음 승인/게시 단계에 필요한 증거를 보존하며 공유가 필요하면 별도 승인된 전달 경로를 사용한다.

### 후속 작업 후보

- 재현 가능한 helper timeout PID 소멸 간헐성 원인 분석.
- 승인된 격리 환경에서 실제 OS 접근성/입력·GUI SSH·알림 권한/Focus 확인. 현재 자동 gate 성공과 구분한다.
- 위 후보의 새 이슈 등록·구현·release 작업은 이번 보고 단계에서 실행하지 않았다.

## 커밋 후 승인 요청

현재 Stage 5 포함 보고서 갱신 착수 승인만 집행했으며 이 문서와 오늘할일 갱신분은 아직 커밋하지 않았다. 새 전용 커밋 승인 후 **정확히 두 경로**의 regular/non-symlink/single-link `0644`, index/commit `100644`, blob/tree 및 repository-wide index를 hooks 비활성 상태에서 검증한다. Stage 5 제품 commit을 다시 묶지 않는다.

```text
mydocs/report/task_m001_29_report.md
mydocs/orders/20261005.md
Task #29: 최종 보고서 작성과 오늘할일 완료 처리
```

커밋 attribution은 지정된 Sisyphus 두 줄을 각각 정확히 1회 포함한다. 커밋 후 final OID·두 blob OID·위 원문 evidence SHA-256을 결박한 `action=approve-final-report-and-evidence` tuple을 제시하고 승인 경계에서 멈춘다. 그 exact 승인 전에는 publication input/title/body를 만들지 않는다. 이후에도 원격 mutation은 별도 publication tuple 승인만 허용한다.

오늘할일의 완료는 승인된 구현·검증·보고 작성에 대한 **로컬 기록**이며 GitHub 이슈 close나 작업지시자의 작업 종료 시각 결정이 아니다. PR merge만으로 OPEN 이슈를 닫지 않고 exact state/updated_at cleanup 승인 절차를 따른다.
