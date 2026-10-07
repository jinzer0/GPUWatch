# Task #29 구현계획서 — 네이티브 macOS UX/UI 설계 적용

수행계획서: [`task_m001_29.md`](task_m001_29.md)
GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
마일스톤: M001
작성일: 2026-10-05
상태: Stage 1–5 구현·검증·보고 완료, Stage 6 재리뷰 보완의 계획서 단독 커밋·생성 SHA 결박·구현·검증 일괄 승인
브랜치: `local/task29`
기준 커밋: `000dac5f33cefdf8cd2f2f12b7c0fcb6a4bd73b1`
작업 위치: `/Users/kjy/Desktop/Codes/projects/GPUWatch-task29`

수행계획서의 내용과 문서 위치 판단은 승인됐다. 이 문서는 그 범위 안에서 실행 순서·파일·검증·커밋을 구체화한다. 작성 중 제품 소스를 수정하지 않았으며, 아래 검증 명령은 실행 결과가 아닌 향후 단계의 실행 계획이다.

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | 설계 입력·서버 탐색·설정 창·외형 기반 | `docs/ux/task_m001_29/`, Shell·UI store·Electron UI IPC·설정 창 | 입력 해시, 창 수명·테마·sender 경계·현재 서버 조회 |
| 2 | GPU 카드·프로세스·추가 지표 | GPU 카드·미터·테스트, 미사용 탭·History UI 제거 | 지표 경계·null/0/stale·다중 펼침·정보 보존 |
| 3 | 서버 관리 시트·메뉴 통합 | 기존 settings 기능을 연결한 관리 시트·메뉴·테스트 | 대상 서버·입력 보존·삭제 확인·가져오기 부분 결과·포커스 |
| 4 | 가용 관측·알림·통합 인계 | core 가용 read model·조건 보존·알림 UI·smoke·문서 | 300/900초 경계·실패·재준비·전체 회귀·격리 Electron |

새 모듈은 아래 명시한 책임에 한해서 만든다. 기존 기능을 다른 이름의 병렬 구현으로 복제하지 않는다. 각 단계는 작동하는 기존 경로를 새 경로로 연결한 후 불필요한 UI를 제거하며, 다음 단계의 기능을 가짜 값·no-op·비활성화 placeholder로 구현했다고 보고하지 않는다.

## 문서 위치 확인

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| 최종 UX 계약·결정 로그·시안 4개 | `docs/ux/task_m001_29/` | 동일 | OK | Stage 1, 원본 삭제 없이 승인본 사본만 보존 |
| 사용자 개요 | `README.md` 기존 섹션 | 동일 | OK | Stage 4, 기능·탐색의 직접 영향 부분만 |
| UI 검증·데모 | `docs/smoke-checklist.md`, `docs/demo/demo-script.md` | 동일 | OK | Stage 4, historical plan/draft는 변경하지 않음 |
| renderer runtime 인덱스 | 기존 `src/AGENTS.md` | 동일 | OK | Stage 2, App/Shell 탐색·전용 로컬 UI bridge만 정합화. 기존 no-install·보안 규칙 유지 |
| 오늘할일·수행/구현계획 | `mydocs/orders`, `mydocs/plans` | `20261005.md`, `task_m001_29.md`, `task_m001_29_impl.md` | OK | 이번 작성 범위 |
| 단계·최종 보고 | `mydocs/working`, `mydocs/report` | `task_m001_29_stage{N}.md`, `task_m001_29_report.md` | OK | 검증 결과와 한계를 기록 |

### 최종 설계 입력 고정

원본은 기본 worktree의 `_bmad-output/initiative-ux-ui-refactor/ux-gpuwatcher/`이다. Stage 1에서 아래 8개 파일만 상대 구조를 유지해 복사한다. `_bmad` 실행 도구·추가 스킬·빈 작업 폴더는 포함하지 않는다. `.memlog.md`는 기존 결정 이력의 사본이며 수동 수정하지 않는다. 원본이 아래 해시와 다르면 변경을 먼저 확인하고 승인본을 임의 대체하지 않는다.

| 원본 상대 경로 | SHA-256 |
|---|---|
| `DESIGN.md` | `236c68f8bf644ebbcc1bc74516c1daed6c0e25f571f4eca641747fdce8e17832` |
| `EXPERIENCE.md` | `1f39b8b38722ad8d31be90f1749c7ba97c43f368f1a2f1866f89ec6fcbef7208` |
| `ux-gpuwatcher.md` | `33ca886e18ffe39667a9033b63c3b1d3257bea6d90c0c9b104c34419a332e25e` |
| `.memlog.md` | `e8243b7e628d0586b89985aebd5803006e8fc281ecb6500e90388483ac2230f9` |
| `mockups/key-main-light.html` | `c5c82c191bed275cccdd7324a786a71b0056982102885eca0e6a3e0cc4108f05` |
| `mockups/key-main-dark.html` | `991fc9f32c5c08e585221efea687536a2478384e2cc820f85070b5e9fb97baac` |
| `mockups/key-settings.html` | `99273e292b9d4de1e658239c07939ddfe6638b05412905e9b6c17bda41e975ff` |
| `mockups/key-server-management.html` | `896befe5b043e834a39eed31ddd10ba9119df32dfca607dca6aed55887282fa9` |

## Stage 1 — 설계 입력·서버 탐색·설정 창·외형 기반

### 산출물

신규:

- `docs/ux/task_m001_29/`의 위 8개 파일.
- `electron/uiContract.ts`, `electron/uiIpc.ts`, `electron/appearance.ts`와 대응 테스트: 앱 창·외형 조작을 helper 동작과 분리.
- `src/lib/appearance.ts`, `src/lib/store.test.ts`, `src/components/Shell.test.tsx`: 외형 구독·상태·탐색 검증.

수정:

- `electron/main.ts`, `preload.ts`, `preload-runtime.cts`.
- `src/App.tsx`, `components/Shell.tsx`, `index.css`, `lib/store.ts`, `lib/types.ts`, `lib/api.test.ts`, `features/settings/SettingsScreen.tsx`.
- `mydocs/working/task_m001_29_stage1.md`, 오늘할일.

### 변경 내용

1. 해시를 대조한 설계 사본의 frontmatter·토큰·상대 링크를 확인한다. 공식 UX 기준은 두 계약이며 HTML은 예시 데이터 참조라는 경계를 유지한다.
2. 메인 창을 서버 목록·선택한 서버의 기존 detail 화면으로 연결한다. 먼저 실제 데이터 조회가 작동하는 구조를 만들고 GPU 카드 표현은 Stage 2에서 교체한다. 서버 관리 기능은 기존 form/controller 경로로 접근할 수 있게 유지하고 대체 경로를 연결하기 전에 삭제하지 않는다.
3. UI store의 activeTab/activeScreen 중심 탐색을 서버 선택·편집 상태로 전환한다. 마지막 유효 서버는 저장하고 GPU별 펼침 상태는 세션에만 둔다. legacy 탭 선택 alias는 남기지 않으며 해당 callsite·테스트를 함께 갱신한다.
4. macOS native 창 제어를 유지하고 타이틀바·사이드바 배경을 연결한다. drag 영역에서 조작·입력·메뉴를 제외하고 최소 폭은 시안의 잠정 기준을 실제 앱에서 확인한다.
5. Electron main에서 하나의 설정 BrowserWindow를 소유한다. 메뉴·`⌘,`·아이콘은 같은 창을 재사용한다. renderer는 창 역할에 따라 메인 초기화와 외형 설정 UI를 분리한다. 설정 창은 서버 초기화·수집·outbox 소비를 중복 실행하지 않는다.
6. `uiContract`의 전용 메서드는 `openSettings`, `getAppearance`, `setAppearance`, `onAppearanceChanged`로 제한한다. 외형 값은 `system | light | dark`와 현재 적용된 외형으로 표현한다. main은 등록된 창의 webContents와 허용된 프레임/출처를 확인하고 임의 sender·잘못된 payload를 거부한다. 일반 helper action 목록에 로컬 창 조작을 섞지 않는다.
7. `nativeTheme`와 main 소유의 외형 저장을 사용한다. 로컬 `app.getPath('userData')` 아래 외형 JSON에는 테마 값만 저장하고 저장 실패를 숨기지 않는다. 시스템 모드만 OS 변경을 따르며 두 창에 동일한 상태를 전달한다. event 구독에는 해제 함수를 제공한다.
8. 기존 action-specific preload와 `.cts` 런타임의 타입·동작을 일치시킨다. generic invoke·helper 경로 노출·renderer-callable `poll_due_servers`를 만들지 않는다. plain Vite는 읽기 전용 정적 외형을 제공하고 실제 backend 조작 부재는 backend_unavailable로 유지한다.

### 검증

```bash
npm ci
npm run helper:build
npm run test -- --run src/components/Shell.test.tsx src/lib/store.test.ts src/lib/api.test.ts electron/uiIpc.test.ts electron/appearance.test.ts
npm run build
npm run electron:build
git diff --check
```

- 입력 사본 8개 해시·문서 링크·시안 간 링크 일치.
- 메뉴/단축키/아이콘을 반복 호출해도 설정 창 1개. 설정 창 닫기가 메인 창·스케줄러에 영향 없음.
- system→light→dark 전환·OS 외형 변경·저장 실패, 창 재열기에서 선택/실효 외형 일치.
- 외부 sender·잘못된 enum·iframe 요청 거부, 구독 해제, 설정 창에서 서버 helper 호출을 새로 실행하지 않는 경계 확인.

### 커밋

```text
Task #29 Stage 1: 서버 중심 창과 외형 설정 기반 적용
```

## Stage 2 — GPU 카드·프로세스·추가 지표

### 산출물

신규:

- `src/features/detail/GpuMetricMeter.tsx`, `GpuMetricMeter.test.tsx`.

수정 또는 미사용 UI 제거:

- `DetailGpuCard.tsx`, `DetailProcessList.tsx`, `ServerDetailScreen.tsx`, `useServerDetailController.ts`, `detailModel.ts`와 관련 테스트.
- `src/lib/store.ts`, `store.test.ts`, `types.ts`, `index.css`, `App.tsx`의 연결부.
- `src/AGENTS.md`의 App/Shell 탐색·외형 설정·`window.gpuwatcherUi` 인덱스. 기존 위치의 agent runtime guidance이며 보안·no-install 규칙은 변경하지 않음.
- `src/features/overview`, `src/features/processes`, `src/features/history`의 화면 전용 경로와 `DetailGpuHistorySection.tsx`를 import/callsite 대조 후 제거. 공유 포맷·실제 필요한 프로세스 정보는 새 카드로 통합하고 중복 UI를 남기지 않음.
- `mydocs/working/task_m001_29_stage2.md`, 오늘할일.

### 변경 내용

1. 카드 요약에 VRAM 사용량/총량·정확한 점유율, UTIL·온도 숫자/단위/구간을 표시한다. 20칸 미터의 마지막 부분 채움을 허용하며 구간 판정은 원값 기준이다. 온도는 길이만 clamp한다.
2. 실제 0은 빈 분절과 정확한 0, unknown은 숫자·fill 없는 중립 점선이다. VRAM 총량 누락/0·범위 밖 백분율을 unknown으로 처리한다. stale에는 마지막 성공 시각을 유지한다.
3. GPU 식별은 서버+UUID를 우선하고 UUID가 없을 때 index를 사용한다. 여러 카드와 내부 추가 지표를 독립 토글하고 polling·서버 이동으로 임의 접힘/스크롤 이동을 만들지 않는다.
4. 프로세스의 PID·사용자·명령·VRAM을 보존한다. command 전체 값에 접근 가능하게 하고 kill 조작은 추가하지 않는다. 성공한 빈 목록과 수집 불가를 구분한다.
5. 추가 지표는 기본 접힘 텍스트 목록으로 구현한다. 기존 memory utilization/free memory, power/limit/fan, encoder/decoder/JPEG/OFA, UUID/PCI/driver/clocks, PCIe RX/TX/gen/width, MIG current/pending/count/가용성 안내를 모두 보존한다.
6. `useServerDetailController`의 historyQuery·live chart sample 축적 및 UI history invalidation을 제거한다. `list_gpu_history` 등 helper/API와 DB history 저장·retention은 유지한다. 삭제된 화면만 검증하던 테스트는 새 동등 행동 검증으로 교체하고 backend 계약 테스트는 없애지 않는다.
7. Stage 4의 실제 가용 DTO 연결 전에는 기존 busy/free 수치나 프로세스 수로 `사용 가능`을 만들어내지 않는다. 이 단계 완료 보고는 카드·정보 구조에 한정한다.
8. `src/AGENTS.md`에서 없어진 탭 탐색·sidebar counts 설명을 서버 선택·GPU detail 경로로 정정하고, 별도 외형 설정 창과 action-specific `window.gpuwatcherUi`를 backend `window.gpuwatcher`와 구분한다. generic IPC 금지·renderer-callable poll_due_servers 금지·원격 no-install 규칙을 유지한다.

### 검증

```bash
npm run test -- --run src/features/detail/GpuMetricMeter.test.tsx src/features/detail/ServerDetailScreen.test.tsx src/features/detail/DetailProcessList.test.tsx src/lib/store.test.ts src/lib/api.test.ts
npm run build
npm run electron:build
git diff --check
```

- UTIL/VRAM 0·30·30 초과·60·60 초과·100·범위 밖, 온도 60·60 초과·80·80 초과·100 초과·null.
- 여러 GPU와 중첩 추가 지표의 키보드 토글, 서버별 세션 펼침, stale/unknown·긴 명령·표 내부 스크롤.
- 전체 소스의 제거 화면 import/callsite·사용하지 않는 UI 타입 확인. history helper 계약·정상 저장의 회귀는 Stage 4 통합 Rust/CLI 테스트에서 재확인.

### 커밋

```text
Task #29 Stage 2: GPU 카드와 추가 지표를 통합하고 History UI 제거
```

## Stage 3 — 서버 관리 시트·메뉴 통합

### 산출물

신규:

- `src/features/settings/ServerManagerSheet.tsx`, `ServerManagerSheet.test.tsx`.

수정:

- `SettingsServerForm.tsx`, `ConfiguredServersPanel.tsx`, `SettingsImportPanel.tsx`, `useSettingsController.ts`, `settingsModel.ts`와 관련 테스트.
- `src/components/Shell.tsx`, `src/lib/store.ts`, `src/index.css`의 관리 진입·focus 연결.
- `mydocs/working/task_m001_29_stage3.md`, 오늘할일.

### 변경 내용

1. 서버별 `…`는 메뉴 대상 서버에 정확히 결박한다. 선택한 서버와 다르게 메뉴를 연 경우에도 올바른 대상을 편집·삭제·enable/disable·테스트한다.
2. `+`에서 직접 추가 또는 SSH config 가져오기 표면을 연다. 기존 server 필드·validation·bulk import·개별 양식 넣기 경로를 재사용한다. 원격 명령 필드는 추가하지 않는다.
3. 저장 성공은 로컬 서버 설정 저장이며 연결 성공과 다르다. test_connection은 저장된 서버를 대상으로 실행하고 인증·timeout·원인별 실패를 표시한다.
4. 삭제 확인에는 서버명을 명시하고 취소가 안전한 기본 행동이다. 저장/삭제/모니터링 전환 실패에는 입력·목록·마지막 저장 상태를 유지한다.
5. SSH import는 읽기/저장 중·빈 결과·후보 경고·사용자 누락·기존/후보 중복·부분 저장 결과를 구분한다. preview 제외 수를 실제 요청의 skipped 수에 섞지 않는다. 성공한 항목을 재시도 때 중복 추가하지 않는다.
6. 미저장 변경 닫기는 계속 편집/변경 버리기로 보호한다. 키보드·포커스 트랩·Esc·호출 버튼 복귀를 실제 조작에 연결한다. 메뉴 항목은 화살표 이동과 닫힘 동작을 검증한다.
7. 앱 설정 창은 외형 설정 역할만 유지한다. 서버 관리가 새 sidebar/sheet 경로에 연결된 뒤 기존 SettingsScreen의 중복 관리 진입을 제거한다.

### 검증

```bash
npm run test -- --run src/features/settings/ServerManagerSheet.test.tsx src/features/settings/SettingsScreen.test.tsx src/features/settings/SettingsAccessibility.test.tsx src/features/settings/settingsModel.test.ts electron/ipc.test.ts
npm run build
npm run electron:build
git diff --check
```

- 서로 다른 선택 서버/메뉴 서버의 조작 대상, 신규 빈 양식·수정 취소·삭제 실패·모니터링 실패.
- SSH 테스트 성공/실패의 정적/fake 응답, import 경고·제외·부분 저장·재시도. 실제 SSH는 일반 테스트에서 실행하지 않음.
- VoiceOver 레이블·Tab/Esc·미저장 보호·focus 복귀·시트 스크롤 확인.

### 커밋

```text
Task #29 Stage 3: 서버 관리 메뉴와 편집 시트 통합
```

## Stage 4 — 가용 관측·알림·통합 인계

### 산출물

신규:

- `crates/gpuwatcher-core/src/repository/availability.rs`: 알림 opt-in과 독립적인 기본 가용 관측.
- `crates/gpuwatcher-core/tests/gpu_availability.rs`: 관측·실패·규칙 보존·cooldown 회귀.

수정:

- core `models.rs`, `repository.rs`, `repository/schema.rs`, `snapshots.rs`, `servers.rs`, `watches.rs`, `read_model/detail.rs`, `read_model/mappers.rs`, `service/watches.rs`와 필요한 service 연결.
- helper `request.rs`, `dispatch.rs`, `contract.rs`, `tests/helper_cli.rs`.
- `electron/helperContract.ts`, `helperContract/actions.ts`, `ipc/payloadValidation.ts`, `scheduler.ts`, `main.ts`, `notifications.ts`와 관련 테스트. main-only action은 preload에 노출하지 않음.
- `src/lib/types.ts`, `DetailGpuCard.tsx`, `useServerDetailController.ts`와 관련 API/화면 테스트.
- `src/features/settings/useSettingsController.ts`, `src/features/settings/ServerManagerSheet.test.tsx`: 자동 saved-target 연결 테스트의 StrictMode effect replay 및 지연 응답 회귀 보완.
- `smoke/electron-first-run-ui-parity.mjs`, `electron-packaged-app-smoke.mjs`, 새 탐색에 종속된 기존 smoke의 직접 영향 부분.
- `README.md`, `docs/smoke-checklist.md`, `docs/demo/demo-script.md`.
- `mydocs/working/task_m001_29_stage4.md`, `mydocs/report/task_m001_29_report.md`, 오늘할일.

### 변경 내용

1. 기본 가용 관측은 모든 수집 대상 GPU를 대상으로 한다. opt-in된 watch rule 유무에 의존하지 않으며 최신 성공 snapshot 저장과 같은 transaction에서 갱신한다.
2. 가용 관측용 metadata table을 additive schema version 4로 추가한다. server+UUID/index identity, 조건 시작·마지막 성공 관측을 저장하고 서버 삭제 때 정리한다. 기존 v3 migration의 early return 때문에 v4가 생략되지 않게 하며 snapshot/history/저장된 watch를 삭제·변환하지 않는다.
3. read model에 `availability`를 추가한다: `state: in_use | candidate | available | unknown`, `conditionStartedAt: string | null`. 판단은 core가 하며 renderer는 available만 강조한다. polling 중에는 이전 성공의 신선도와 건강 상태를 구분한다. failed/stale/unknown·모니터링 off에서는 현재 available을 반환하지 않는다.
4. 기본 조건은 두 알려진 값이 UTIL ≤5%·VRAM ≤1024MiB인 성공 관측에서 300초 지속이다. 실패·unknown·조건 이탈·사라진 GPU·서버 설정 변경/disable에 조건 구간을 초기화한다. 오래된 값으로 renderer 타이머를 진행하지 않는다.
5. 앱 재시작·절전 동안의 시간을 지속 관측으로 계산하지 않는다. `reset_availability_observations`를 main-only helper action으로 추가한다. payload는 `{serverId: string | null}`로 한 서버/전체의 관측 구간만 무효화하며 notification cooldown·armed 이력은 삭제하지 않는다. main 시작과 suspend/resume 경계에서 collection과 직렬화하고 초기 reset 완료 전 scheduler 수집을 시작하지 않는다. renderer/preload 호출·임의 payload는 거부한다.
6. 성공 관측 간 실제 갱신이 끊긴 경우도 연속 구간으로 단정하지 않는다. 잠정 허용 공백은 `2 × pollingIntervalSeconds + 60초`로 고정한다(예약 수집 여유와 기존 SSH action timeout). 초과한 관측 간격은 구간을 다시 시작하고 read model에서도 마지막 성공 관측이 이 공백보다 오래됐으면 unknown을 반환한다. 중복 timestamp는 지속시간을 늘리지 않으며 시간 역행·잘못된 timestamp는 확인 불가로 처리한다. 경계와 read-time 만료를 테스트한다. 이 잠정 상수 변경은 계획 변경으로 기록한다.
7. 기존 watch 재활성화는 저장된 rule id·threshold·duration·cooldown을 그대로 보낸다. 신규 rule에만 기본값을 적용한다. off/on·저장·실패가 이전 알림 시각을 삭제하여 반복 방지를 우회하지 않게 한다. disabled 중에는 발송하지 않되 관측된 조건 이탈에 따른 재준비 의미를 유지한다.
8. 기존 사용자 지정 조건과 카드의 기본 가용 조건을 분리한다. 기본 알림 내용은 GPU 사용 가능, 다른 저장 조건으로 발송되는 알림은 설정한 조건 충족을 명시하여 카드와 상충하는 가용 주장을 하지 않는다. 저장된 cooldown이 900초보다 작으면 저장값을 덮어쓰지 않고 최소 900초의 발송 제한을 적용하며 UI의 저장값/실효 제한을 구분해 안내한다.
9. rule/outbox 기본 구조를 보존한다. 계속 유휴인 동안 반복하지 않고 관측된 사용 상태 후 다시 sustain 조건과 cooldown을 함께 만족해야 재알림한다. failed/unknown 관측은 지속 구간을 끊지만 알림 발송 이력·재준비를 임의 초기화하지 않는다.
10. 카드 안 on/off·저장 조건·권한 확인 불가·저장/읽기 실패를 실제 결과에 연결한다. 실제 OS 허용 상태를 모르면 확인 불가를 유지한다. 새 임계값 편집기·자동 권한 허용·배너 노출 보장은 추가하지 않는다.
11. 실제 관측과 무관한 HTML 예시·fake helper는 테스트에만 둔다. 전체 사용자 여정·문서·smoke를 새 구조로 맞추고 최종 검증 한계를 기록한다.
12. 관리 시트의 명시적 연결 테스트는 저장 대상이 준비된 뒤 StrictMode effect replay에도 정확히 한 번만 시작한다. 취소된 effect에서 자동 요청을 시작하지 않고 기존 management request/version fence를 유지한다. StrictMode와 deferred helper 응답 회귀로 정확한 대상·1회 호출·pending 종료와 실패 표시를 검증한다. 이 보완은 통합 first-run smoke에서 발견한 자동 테스트 pending 문제의 직접 영향 두 파일에 한정하며 관리 UX·저장/삭제/import 계약을 바꾸지 않는다.

### 검증

```bash
npm run helper:build
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
npm run build
npm run electron:build
npm run smoke:electron:first-run
git diff --check
```

- 299/300초·899/900초 양쪽 경계, 기본 조건 두 지표 AND·threshold equality, opt-in off인 카드 가용 표시.
- 연속 유휴 1회, 사용 재개 후 재준비, failed/unknown/stale·GPU 사라짐·서버 disable/config change·재시작/절전·관측 공백·중복 관측.
- 사용자 지정 임계값과 기본 카드의 차이, off/on 값·last notification·armed 보존, 작은 기존 cooldown의 실효 제한, outbox 소비가 기존 테스트와 일치.
- v3 DB에서 v4 additive migration 및 재실행 idempotence. 기존 서버·최신 snapshot·history·watch·outbox 손실 없음.
- reset action이 main-only contract에만 존재하고 renderer/preload 및 generic dispatch로 접근 불가. 재시작·절전 reset과 in-flight poll이 섞이지 않는 scheduler 순서.
- 필요 시 `npm run electron:pack` 후 `node smoke/electron-packaged-app-smoke.mjs`. unsigned 로컬 앱 경로는 실제 출력에서 찾고 배포 완료로 보고하지 않음.
- 실제 OS 알림 테스트는 별도 승인·격리 데이터에서만 진행. 일반 회귀는 fake notifier로 발송 횟수·내용을 확인한다.

### 커밋

```text
Task #29 Stage 4: 가용 관측과 알림 보존 규칙을 연결하고 통합 검증
```

## Stage 5 — PR #30 Codex 리뷰 회귀 수정

### 승인·작업 기준

- 제품 기준 HEAD: `a3bc6e72294efa486f3bb55cb343cd91ae20e8bb`, 작업 위치와 브랜치는 기존 `GPUWatch-task29`, `local/task29`를 유지한다.
- PR #30의 Codex review `5428186807`, comment `4195130711`과 `4195130721`의 P2 두 건만 수정한다. 같은 스레드의 수정 지시 후 보완 내용·계획서 단독 커밋을 요청했고, 작업지시자의 `커밋 승인`으로 해당 단일 gate를 승인받았다.
- 이 `_impl.md`만 독립 커밋한 뒤 출력된 새 exact SHA를 승인받아야 제품 수정·테스트 실행에 진입한다. 이전 계획 OID나 최종 보고/게시 승인을 새 구현 승인으로 재사용하지 않는다.
- 최초 Stage 5 계획 `fdc1aa7da3d097c75e5db0234bbaddb4c5e7015c`의 exact SHA 승인 후 focused 회귀는 통과했으나 core stale-poll fixture와 management Cancel focus의 전체 gate가 실패했다. 추가 직접 영향 파일 범위·계획 보완을 요청했고, 같은 스레드의 `승인`으로 아래 테스트 정합화와 오래된 focus callback 차단의 보완 내용을 승인받았다. 새 계획서 단독 커밋·새 exact SHA 승인 전에는 추가 파일을 수정하거나 재검증하지 않는다. 이미 작성된 Stage 5 제품 변경·실패 증거는 보존한다.

### 직접 영향 파일

제품·회귀:

- `crates/gpuwatcher-core/src/repository/servers.rs`
- `crates/gpuwatcher-core/tests/gpu_availability.rs`
- `crates/gpuwatcher-core/tests/storage/repository_server_contract.rs`
- `crates/gpuwatcher-core/src/service.rs`: 기존 stale-poll 테스트 fixture와 이름 변경 poll 수용 회귀만; 제품 service API 변경 없음.
- `src/features/settings/useSettingsController.ts`
- `src/features/settings/SettingsScreen.test.tsx`
- `src/features/settings/ServerManagerSheet.tsx`: 지연된 focus callback의 요청/대상 수명 경계.
- `src/features/settings/ServerManagerSheet.test.tsx`: 기존 Cancel/invoker assertion 유지 및 이전 시트 callback 회귀.

단계 기록·최종 보고:

- `mydocs/working/task_m001_29_stage5.md`: 기존 단계 기록 위치의 신규 Stage 5 보고서.
- `mydocs/orders/20261005.md`: 리뷰 보완 진행·검증 및 승인 상태 갱신.
- `mydocs/report/task_m001_29_report.md`: Stage 5 승인·커밋 뒤 별도 최종 보고 갱신 단계에서 수정.

제품/사용자 문서와 설계 사본은 변경하지 않는다. 기존 승인 계약을 복구하는 두 리뷰 버그 및 통합 검증에서 확인한 직접 영향 stale-poll fixture·focus callback 보완이며 문서 위치 판단은 기존 수행계획의 내부 기록 `working/orders/report`를 그대로 사용한다. source 수정·Stage 5 산출물 커밋·최종 보고 전용 커밋·원격 PR 업데이트를 한 번에 합치지 않는다.

### 변경 내용과 수용 기준

1. 서버 저장은 입력 정규화 후 현재 값과 비교한다. 동일 설정 저장 및 관측과 무관한 이름 변경만으로 가용 observation·watch sustain·health를 초기화하지 않는다. host/port/username/key path/polling interval/enabled 등 관측 관련 설정이 실제 변경된 경우에만 기존 초기화 정책을 적용한다. 무변경 저장이 불필요하게 collection revision을 바꾸어 in-flight 결과를 무효화하지 않는지 확인하고, 실제 설정 변경의 stale-poll 차단은 유지한다.
2. backend 회귀는 가용 상태에 도달한 GPU·지속 조건 누적 중 watch의 무변경 저장, 정규화 후 동일값, 이름만 변경, 실제 연결/주기/enabled 변경을 구분한다. 관측 구간·health·armed/last-triggered/cooldown 보존 및 기존 실제 변경 reset을 검증한다. 테스트를 약화하거나 skip하여 revision 계약을 맞추지 않는다.
3. SSH config의 새 검색 결과를 성공적으로 수용할 때 `selectedImportHostAliases`와 이전 bulk 결과 요약을 초기화한다. 같은 alias가 다른 host/user로 재해석되더라도 새 검색에서 사용자 재선택 없이 저장하지 않는다. 성공적으로 이미 저장한 `importedServers`/ref는 보존해 stale query에서도 중복 저장을 막는다.
4. frontend 회귀는 동일 alias의 대상 변경 재검색, 이전 선택/실패 요약 초기화, 재선택 전 저장 불가, 재선택 후 새 target의 정확한 저장, 기존 partial import 실패 항목만 재시도와 성공 항목 중복 방지를 함께 검증한다. request/version fence와 StrictMode 자동 test는 변경 범위에 포함하지 않고 기존 검증을 유지한다.
5. 제품 변경 뒤 아래 focused·통합 gate를 실행하고 결과·명시적인 검증 한계를 Stage 5 보고서에 기록한다. 구현 완료를 source commit·push 완료로 보고하지 않는다.
6. `service.rs`의 `poll_server_discards_success_when_config_revision_changes`는 실제 host/port 등 관측 관련 설정 변경을 mock collector에서 수행하도록 고친다. `stale_discarded`와 snapshot/history 무저장 assertion은 유지하고 이름만 변경했을 때 진행 중 성공 poll을 정상 수용하는 분기를 별도로 검증한다. 테스트 약화·skip·강제 실패 응답으로 통과시키지 않는다.
7. 관리 시트의 지연 focus callback은 해당 management request와 유효한 대상에 결박한다. unmount 뒤 이전 시트의 fallback callback이 이후 시트/새 invoker의 focus를 가로채지 않게 하고, 실제 삭제로 invoker가 사라진 경우의 `+` fallback은 유지한다. dirty 계속 편집의 지연 focus도 이후 요청에 적용하지 않는다. shared `RightDrawer`는 기존 연결된 invoker 복귀 동작을 유지하고 변경하지 않는다.
8. `ServerManagerSheet.test.tsx`에서 callback 실행 순서를 제어하여 이전 시트가 끝난 뒤 새 요청을 열고 닫아도 이전 callback이 새 invoker를 덮지 않는 것을 검증한다. Cancel-first·삭제 미호출·정확한 invoker 복귀 assertion을 유지한다. 단일 필터 실행만으로 전체 성공을 주장하지 않고 file 전체 및 전체 Vitest를 재실행한다.

### 검증 명령

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

Rust 구현 변경 후 기존 formatter를 사용하고 최종 합쳐진 변경에 대해 format check를 한 번 수행한다. JS/TS formatter를 새로 도입하지 않는다. normal gate는 운영 DB/live SSH/실제 OS 알림을 사용하지 않는다. unsigned·CDP/guard 한계와 기존 helper timeout PID 소멸 간헐성을 최종 보고에 계속 보존한다.

### 커밋·게시 경계

- 계획서 단독 커밋 및 새 exact SHA 승인 → Stage 5 구현·검증·단계 보고 → 산출물·단계 커밋 승인 → 별도 최종 보고/오늘할일 갱신 및 수용 승인 순서를 지킨다.
- Stage 5 예정 커밋 제목: `Task #29 Stage 5: Codex 리뷰의 서버 관측과 SSH 재검색 회귀 수정`.
- PR #30에는 기존 제품 OID가 게시되어 있다. 새 제품·최종 보고 OID에 대해 기존 publication tuple을 재사용하거나 현재 publish ref를 임의 overwrite하지 않는다. 원격 업데이트의 별도 승인된 절차를 확인한 뒤 진행한다.
- GraphQL `closingIssuesReferences`가 빈 목록인 게시 검증 문제, default branch/main/devel 정책, framework/manual 수정, PR merge·issue close는 이번 리뷰 수정 범위 밖이다.

## Stage 6 — 반복 서버 enabled 쓰기의 멱등성

### 승인·작업 기준

- 기준 HEAD는 `4321fa1afe2d9fcf2dfeeb54f4e02c4a2ec9cbc6`, 기존 `GPUWatch-task29` worktree와 `local/task29`를 유지한다.
- PR #30 Codex review `5437422548`, comment `4202873637`의 P2 한 건만 대응한다. 현재 값과 같은 enabled 요청이 revision·관측·watch 지속 구간·health를 초기화하는 문제다.
- 같은 스레드에서 보완안을 제시한 뒤 작업지시자가 `계획서 단독 커밋 승인 → 새 exact SHA 승인 → 구현·검증 까지 모두 일괄 승인할게`라고 명시했다. 이번 Stage 6에 한해 생성되는 계획서 단독 커밋의 exact SHA를 기록·결박하고 구현·검증까지 진행하는 승인으로 적용한다. 미래 SHA를 이미 조회·확인받았다고 표현하지 않는다. 일반 manual/skill의 승인 규칙은 변경하지 않는다.
- 계획서만 독립 커밋하고, 해당 commit의 parent·변경 경로·mode·blob·attribution을 검증한다. 구현·검증 전 그 exact SHA의 ancestor 여부와 HEAD/index/working tree 계획 blob 일치를 확인한다.
- 제품/단계 산출물 커밋, 최종 보고 갱신·커밋·수용, 원격 게시, 리뷰 답변·resolution, merge·issue close·정리는 이번 일괄 승인에 포함하지 않는다.

### 직접 영향 파일과 문서 위치

- `crates/gpuwatcher-core/src/repository/servers.rs`: `set_server_enabled`만 최신 상태를 Immediate transaction 안에서 비교하고 동등 요청은 no-op 반환한다.
- `crates/gpuwatcher-core/tests/storage/repository_server_contract.rs`: 반복 true/false의 record·health·revision 보존, in-flight poll 보존·완료, WAL writer 이후 최신 상태 비교, 실제 전환을 검증한다.
- `crates/gpuwatcher-core/tests/gpu_availability.rs`: 반복 요청의 GPU 관측·watch sustain·cooldown·armed·snapshot 보존과 실제 전환 reset을 검증한다.
- 기존 `crates/gpuwatcher-core/tests/storage/repository_watches.rs`의 실제 전환 저장 실패 rollback 테스트를 실행한다. 직접 영향 회귀 보완이 필요한 경우 이 파일 안에서만 수행한다.
- 내부 계획은 이 `_impl.md`, 단계 보고는 `mydocs/working/task_m001_29_stage6.md`, 진행 기록은 기존 `mydocs/orders/20261005.md`를 사용한다. 기존 내부 기록 독자·공식화 수준·위치를 유지하며 제품 문서/API/DTO/schema/UI/manual/skill은 변경하지 않는다. 최종 보고서는 별도 승인 후 기존 위치에서 갱신한다.

### 변경 내용과 수용 기준

1. `BEGIN IMMEDIATE`로 writer를 확보한 뒤 서버를 읽는다. 없는 서버는 기존 `server_not_found`를 유지한다.
2. 현재 enabled가 요청과 같으면 SQL UPDATE/reset 없이 commit 후 읽은 서버를 그대로 반환한다. revision·updated_at·health·snapshot·availability/watch runtime·outbox를 보존한다.
3. 실제 true/false 전환에서만 revision 증가 및 기존 availability/watch reset·idle/disabled health 처리를 수행하며 전체 rollback 원자성을 유지한다.
4. 동등 true 요청이 진행 중 poll을 stale로 만들거나 polling health를 idle로 바꾸지 않는다. 동등 false도 저장 상태를 변경하지 않는다.
5. 동시 WAL writer가 먼저 바꾼 최신 enabled 값과 비교한다. 저장 실패를 무시하거나 재시도 fallback으로 덮지 않는다.
6. 수정 전 새 회귀의 실패를 기록하고, 수정 후 focused 및 전체 회귀 결과를 단계 보고에 남긴다. 기존 live SSH ignored 테스트를 강제로 실행하거나 실패/경고를 억제하지 않는다.

### 검증 명령

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state server_enabled
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability repeated_enabled
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml --all -- --check
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
git diff --check
```

Rust formatter는 합쳐진 변경에 한 번 적용한다. renderer/Electron 코드는 변경하지 않으므로 별도 빌드·packaging·UI smoke 재실행 대신 core/helper 전체 및 기존 Vitest 회귀를 실행한다. live SSH·실제 OS 알림·운영 DB는 사용하지 않는다. 게시 linkage 실패는 여전히 별도 미해결 경계로 남긴다.

## Stage 6.1 — 전체 프로세스 명령의 비밀정보 가림 복구

- 기준 HEAD `f972a36fbf3ff44b8676251d3173cac9df644111`, Codex review `5449421556`, comment `4212876195`의 P1 한 건. 같은 스레드의 `codex 리뷰 대응 수정 일괄 승인 수정 커밋 푸시까지`는 해당 리뷰 보완의 계획 기록·구현·검증·단계 커밋을 명시 승인한 것으로 접수한다. 일반 승인 규칙을 변경하거나 merge/close/thread resolution 승인으로 확대하지 않는다. 원격 게시의 artifact 및 exact tuple 경계는 별도로 검증한다.
- 계획서를 먼저 단독 커밋하고 생성 SHA·단일 경로·blob·ancestor를 결박한다. 기존 여섯 단계는 유지하고 리뷰 보완을 Stage 6의 하위 단계 6.1로 기록한다.
- 직접 영향 제품 파일: `src/features/detail/DetailProcessList.tsx`, `DetailProcessList.test.tsx`, `ServerDetailScreen.test.tsx`. 기존 `formatDrawerCommand`를 재사용하며 formatter/API/DTO/저장 데이터는 바꾸지 않는다.
- 전체 명령을 truncation 없이 표시하되 토큰·비밀번호·SSH key 경로·private key material은 cell text와 title 모두에서 기존 sanitizer로 가린다. 1000자 이상 안전한 본문과 tail, 개행·줄바꿈·unknown/실제0은 보존한다.
- 기존 raw token 노출을 강제하는 테스트를 비밀정보 가림 및 안전한 명령 보존 회귀로 바꾼다. 토큰/비밀번호/키 경로/키 본문을 각각 DOM text와 title에서 검증하고 detail 화면 통합 경로도 검증한다. 수정 전 실패를 기록한다.
- 내부 기록 위치: 기존 계획서, `mydocs/working/task_m001_29_stage6.1.md`, 기존 `mydocs/orders/20261005.md`, 기존 `mydocs/report/task_m001_29_report.md`. 사용자/제품 문서·src/AGENTS·manual/skill 변경은 없다. 전체 명령 요구의 직접 보안 회귀 복구이므로 설계 사본도 변경하지 않는다.
- 검증: `npm run test -- --run src/features/detail/DetailProcessList.test.tsx src/features/detail/ServerDetailScreen.test.tsx src/lib/format.test.ts`, `npm run test -- --run`, `npm run build`, `npm run electron:build`, `git diff --check`. 테스트 DOM의 text/title을 직접 검사해 browser-visible 출력의 보안 경계를 확인한다. 스타일/레이아웃·Electron bridge·Rust 변경이 없어 packaging/live SSH/실제 OS 알림은 재실행하지 않는다.
- 단계 소스·회귀·하위 단계 보고·orders만 묶어 `Task #29 [Stage 6.1]: 프로세스 전체 명령의 비밀정보 가림 복구`로 기록한다. 최종 보고/orders는 별도 보고 commit으로 분리한다. 게시 시 기존 PR #30과 devel을 유지하고 ancestor·exact lease·기존 title/body drift를 검증하며, 이미 승인된 명시적 #29 참조와 별도 exact-close 정책을 유지한다.

## 검증

- 각 Stage의 검증을 단계 보고 전 실행하고 실패를 숨기거나 tests를 억제하지 않는다. 새 파일을 나열한 명령은 해당 단계에서 테스트를 실제 생성한 뒤 실행한다.
- 단계 검증과 통합 검증은 위 명령에 맞춰 수행한다. 이번 구현계획 작성 단계에서는 문서/입력 검사만 실행한다.
- normal tests·smoke는 live SSH·tml-server·운영 DB에 의존하지 않는다. `GPUWATCHER_TEST_DATA_DIR`는 테스트에서만 사용한다.
- source format은 변경 언어의 프로젝트 formatter를 단계의 합쳐진 변경 파일에 한 번 적용한다. 실제 Rust 변경 후 `cargo fmt --all -- --check`를 검증에 포함한다.
- 파일/기능/문서 위치 변경이 필요하면 먼저 해당 계획을 갱신하고 승인받는다. 제거된 UI의 테스트를 새 행동 테스트로 대체하는 것과 기존 backend 기능의 테스트를 삭제하는 것을 구분한다.
- PR 준비 전 working tree가 clean이어야 한다. 기존 worktree의 사용자/BMad 변경을 stash·삭제·일괄 commit하지 않는다.

## 커밋

계획 문서 커밋과 Stage 1 진입은 같은 스레드에서 명시 승인됐다. 승인본 기록은 다음 순서로 수행하며 제품 변경을 계획 문서 커밋에 함께 묶지 않는다.

1. `mydocs/plans/task_m001_29.md`와 `mydocs/orders/20261005.md`만 묶어 `Task #29: 수행 계획서 작성과 오늘할일 갱신`으로 기록.
2. 이 구현계획서만 `Task #29: 승인된 구현 계획서 확정` 독립 커밋으로 기록. Stage 1 제품 변경을 함께 묶지 않는다.
3. 각 단계 커밋에는 해당 산출물과 `task_m001_29_stage{N}.md`를 포함한다. 작업지시자의 단계·커밋 승인을 확인하고 계획 밖 파일을 staging하지 않는다.
4. 최종보고·오늘할일 완료 처리는 `Task #29: 최종 보고서 작성과 오늘할일 완료 처리`로 구분한다. PR 생성·push는 별도 승인 단계다.

모든 커밋 attribution은 정확히 다음 두 줄을 포함한다.

```text
Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>
```

## 단계 의존성

- 계획 문서 커밋과 Stage 1 진입의 명시 승인 전에는 설계 입력 사본·제품 소스·제품 문서를 변경하지 않는다.
- Stage 2는 Stage 1의 실제 동작·검증·보고 승인 후 진행한다.
- Stage 3는 Stage 2의 검증·보고 승인 후 진행한다.
- Stage 4는 Stage 3의 검증·보고 승인 후 진행한다. backend availability 계약과 lifecycle 순서를 먼저 완성한 뒤 UI 표시를 연결한다.
- main → devel 동기화는 범위 밖이다. 승인된 task 기준을 임의 merge/cherry-pick으로 바꾸지 않는다.

## 위험과 대응

- **설정 창의 중복 초기화**: main/settings 역할을 분리하고 settings에서는 initialize/server query·collection·outbox 처리를 실행하지 않는다.
- **신선도·관측 공백**: 앱 lifecycle과 수집 공백을 core 관측 초기화에 반영하고 오래된 성공값에 wall-clock만 더해 가용으로 만들지 않는다.
- **마이그레이션 영향**: 독립 metadata 추가만 수행한다. schema v3 early return, 재실행, 기존 데이터 보존을 테스트한다. destructive 변경이 필요하면 이 계획으로 승인된 것으로 간주하지 않는다.
- **cooldown 및 사용자 조건**: 저장값 보존·실효 최소 간격·재준비를 각각 테스트한다. custom 알림 내용을 기본 가용 카드와 구별한다.
- **기능 손실·죽은 코드**: 새 흐름이 기존 관리·telemetry를 제공한 뒤 옛 UI를 제거한다. backend 계약을 UI 정리 때문에 삭제하지 않는다.
- **격리 경로·준비물**: 이 worktree는 기본 worktree의 node_modules/debug helper/BMad 파일을 가진다고 가정하지 않는다. 필요한 빌드·입력만 준비한다.
- **승인 확대**: 이번 수행계획 승인에 제품 구현·커밋·게시 권한을 포함하지 않는다. 아래 승인 요청에서 각각의 경계를 명시한다.

## 승인 요청 사항

Stage 1 승인 커밋은 `ae85f42f60e52a31c99679428d96fab17a0b822f`이고, 기존 구현계획서 승인 커밋은 `de0277cd2bb38afdc43a0f0ad4272d7fd58e9916`이다. 같은 스레드의 `stage2 착수 승인`을 접수했으며, 이번 보완은 Stage 1 보고서의 runtime 인덱스 위치 제안을 직접 영향 파일·변경 내용에 명시한 것이다. 설계 입력 8개의 고정 해시와 기존 Stage 2 제품 기능·검증 명령은 변경하지 않았다.

같은 스레드의 `보완 내용과 계획 문서 커밋을 승인`으로 아래 보완 내용과 독립 커밋을 승인받았다. 새 exact SHA 확인은 별도 경계이며 이전 Stage 2 착수 승인으로 대체하지 않는다.

- `src/AGENTS.md`의 기존 위치 유지·탐색/외형/bridge 인덱스 보완 내용과 이를 반영한 두 계획서.
- 수행계획서·오늘할일 보완 기록 이후 `_impl.md`만 독립 커밋하는 것. 새 exact SHA 확인 전에는 제품 소스·runtime 인덱스 수정 및 단계 검증 명령을 실행하지 않음.

아래 항목은 최초 승인 요청 기록이다.

- 네 개 Stage의 파일·변경·검증·의존성과 additive 가용 metadata·main-only lifecycle reset 계약.
- 기존 사용자 조건을 보존하며 기본 카드와 custom 알림을 구분하고 최소 15분 실효 제한을 적용하는 경계 처리.
- 위 순서의 계획 문서 2개 커밋을 명시 승인하고, 구현계획서 독립 커밋 이후 Stage 1에 진입하는 것.

Stage 2 이후 진행, 단계 커밋, 실제 OS 알림·실제 SSH, push·PR 게시·merge·cleanup은 이후 각 경계에서 별도로 승인받는다.
