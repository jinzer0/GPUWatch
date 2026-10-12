# Task #29 Stage 1 보고서 — 서버 탐색·별도 설정 창·외형 기반

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
마일스톤: M001
Stage: 1
상태: 구현·자동 검증 및 Stage 1 산출물·단계 커밋 승인 완료, Stage 2 진입은 별도 승인 대기
작업 위치: `/Users/kjy/Desktop/Codes/projects/GPUWatch-task29`
브랜치: `local/task29`

## 단계 목적

승인된 최종 설계 입력을 보존하고, 실제 서버를 선택하는 메인 창과 별도 외형 설정 창을 연결한다. 이번 단계는 네이티브 창·탐색 기반이다. GPU 카드의 새 시각 구조·미터·펼침 UI, 서버별 메뉴·시트, 가용 관측·알림 수정까지 구현했다고 보고하지 않는다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `docs/ux/task_m001_29/`의 계약·결정 로그·HTML 4개, 총 8개 파일 | 원본 최종 승인본의 해시와 byte-for-byte 일치. 기존 상대 구조 유지 |
| `electron/main.ts` | 메인/설정 창 역할별 로딩, singleton 설정 창, GPUWatcher → 설정…·`CmdOrCtrl+,`, 창 수명·외형 적용. 메뉴에서 창 로딩 실패 시 native 오류 표시 |
| `electron/uiContract.ts`, `uiIpc.ts` | 로컬 창/외형 전용 action-specific IPC. 등록된 webContents·main frame·정확한 앱 URL과 payload 검증 |
| `electron/appearance.ts` | main 소유 nativeTheme, 외형 JSON의 원자적 저장·직렬화·변경 구독. 잘못된 저장값을 성공으로 숨기지 않고 명시적 선택으로 복구 |
| `electron/preload.ts`, `preload-runtime.cts` | 전용 `window.gpuwatcherUi` bridge와 동일한 TS/CJS 계약 |
| `src/App.tsx`, `components/Shell.tsx`, `index.css` | 서버 중심 sidebar·기존 서버 detail 연결, 창 상단·본문 외형 일체감, 메인/설정 역할 분리와 역할별 document/native 제목 |
| `src/features/settings/AppearanceSettings.tsx`, `lib/appearance.ts` | 시스템/라이트/다크, 로딩 미확정·저장 오류·명시적 재선택, 두 창의 구독/해제·외형 동기화 |
| `src/lib/store.ts` | 마지막 유효 서버 선택 복원, 삭제된 서버 상태 정리, GPU/추가 지표의 독립적인 세션 disclosure 저장 인터페이스. 카드 UI 연결은 Stage 2 |
| `src/lib/api.ts`, `types.ts`, `global.d.ts` | 제거된 탭 상태 callsite·타입 정리와 전용 UI bridge 타입 |
| detail/overview/settings의 기존 연결부 | 이전 activeScreen/activeTab 조작을 제거하고 실제 관리 기능·서버 선택을 보존. 미선택 안내를 sidebar 기준으로 변경 |
| `electron/appearance.test.ts`, `main.test.ts`, `preload.test.ts`, `uiIpc.test.ts` | 저장·nativeTheme 변화·창 재사용·오류·sender/frame/URL 거부·preload 노출 회귀 |
| `src/App.test.tsx`, `components/Shell.test.tsx`, `lib/appearance.test.ts`, `lib/store.test.ts`, `features/settings/AppearanceSettings.test.tsx` 및 기존 API/detail/overview 테스트 | 역할별 초기화, 선택·관리 진입, 외형 로딩/실패/구독, 세션 상태·정보 보존 회귀 |
| `mydocs/orders/20261005.md`, 이 보고서 | Stage 1 결과와 다음 승인 경계 기록 |

전용 UI bridge 메서드는 `openSettings`, `getAppearance`, `setAppearance`, `onAppearanceChanged` 네 개다. 로컬 UI 조작을 helper action 목록에 넣지 않았다. generic invoke·runAction·helper 경로·renderer-callable poll_due_servers를 추가하지 않았다.

계획 문서 커밋은 승인 범위에 따라 이미 분리했다.

- `fe1b29c2f24dce72d2035c332c03f7bd958ca08c`: 수행계획서·오늘할일.
- `de0277cd2bb38afdc43a0f0ad4272d7fd58e9916`: 구현계획서 단독.

두 커밋의 부모·파일 집합·staged tree·Sisyphus attribution을 검증했다. 최초 보고 시점에는 Stage 1 제품 변경을 staging·커밋하지 않았다. 같은 스레드의 `stage 1 승인`에 따라 Stage 1 산출물·보고서·오늘할일을 함께 단계 커밋으로 기록한다. push·PR·issue 변경은 하지 않는다.

## 본문 변경 정도 / 본문 무손실 여부

- 최종 UX 입력 8개는 구현계획서에 고정한 SHA-256과 원본/사본 모두 일치한다. final 상태·날짜·링크·시안은 재작성하지 않았다. 원본 `_bmad-output`과 `.memlog.md`도 변경하지 않았다.
- Rust core/helper 소스·fixtures·package.json·lockfile·DB 저장 정책·helper action 계약은 변경하지 않았다. SSH 수집·nullable DTO·기존 서버 관리 기능을 유지했다.
- activeScreen/activeTab/TabId의 옛 UI 탐색 alias는 제거했다. 기존 detail·프로세스·History 표현과 실데이터 API는 Stage 2 전까지 유지한다. History backend/API 삭제는 하지 않았다.
- README·제품 smoke/demo 문서는 승인된 Stage 4의 통합 정리 대상으로 남겼다. `src/AGENTS.md`의 이전 탭 탐색 인덱스도 이번 승인 파일 목록에 없어 변경하지 않았다. 해당 인덱스의 후속 위치 판단은 아래 다음 단계 영향에 명시한다. 보안·no-install 규칙은 유지한다.

## 검증 결과

### 실행 명령

```bash
npm ci
npm run helper:build
cargo build --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
npm run build
npm run electron:build
git diff --check
```

- **OK — Vitest: 31 files, 407 tests passed.**
- **OK — renderer TypeScript + Vite build**, Electron TypeScript/CJS preload build.
- **OK — helper release/debug build.** Rust 소스가 없어 전체 Cargo test·cargo fmt는 이번 단계에 실행하지 않았다.
- **OK — 변경 whitespace, 계획 기준 HEAD/브랜치, staging 없음, Rust·의존성·fixtures 변경 없음 확인.**
- **OK — 원본/사본 8개 해시, 세 계약의 상대 링크, final 상태, offline HTML의 script/외부 리소스 부재 확인.**
- 초기 회귀에서 옛 Overview 안내를 기대하던 detail 테스트, 중복 브랜드 문구를 단일 요소로 조회하던 Shell 테스트, unsubscribe mock의 TypeScript 타입 문제를 발견해 정확한 새 행동 검증으로 고쳤다. source의 native 제목이 HTML title로 덮이는 문제도 실제 창 검사에서 발견해 역할별 document.title 설정과 회귀 assertion으로 수정했다. disclosure 기본값 중복 spread의 TypeScript 오류도 수정 후 전체 gates를 재실행했다. 테스트·경고를 억제하지 않았다.
- 프로젝트에 TS/CSS formatter 스크립트·의존성이 없어 새 formatter를 임의 설치하지 않았다. 기존 스타일·whitespace 검사로 확인했다.
- npm ci에는 기존 deprecated 패키지 및 electron-winstaller/esbuild/fsevents install-script 정책 경고가 있었다. 정책·버전을 변경하지 않았고 Electron binary 준비 후 실제 앱 검증을 실행했다. 빌드·테스트는 위 결과대로 통과했다.

### 실제 격리 Electron 확인

개인 temporary directory에 별도 HOME·테스트 SQLite·Electron userData를 만들고 실제 helper에 명시적으로 demo 데이터를 넣었다. 서버 두 개를 monitoring off로 둔 뒤 guard wrapper가 refresh_server/test_connection/poll_due_servers 요청을 차단·기록하게 했다. 실제 앱의 메뉴 handler와 renderer CDP를 사용했다. 따라서 이 결과는 정적 HTML 검증과 다르지만 실제 Linux GPU 관측 결과도 아니다.

임시 `verify.mjs` 시나리오의 확인 결과:

| 항목 | 결과 |
|---|---|
| 서버 선택·마지막 유효 ID·프로세스 재실행 복원 | OK |
| 실제 메뉴 handler와 사이드바 아이콘의 설정 창 재사용 | OK — 반복해도 main/settings 2개 |
| 설정 창의 appearance-only 구성과 initialize_app 중복 없음 | OK |
| light/dark/system 선택·두 창 동기화·appearance.json 저장 | OK |
| 재실행 후 dark 모드 복원 | OK |
| main 880×708, settings 420×280 | OK — sidebar 유지·전체 창 가로 overflow 없음, 설정 내용 잘림 없음 |
| drag/no-drag 영역의 computed style | OK — titlebar drag, 조작 no-drag |
| 설정 창 닫기·재열기·macOS 전체 창 닫기 후 프로세스 유지·activate 재생성 | OK |
| 손상된 외형 JSON을 읽어도 앱 계속 실행, 미확정·오류 표시, 명시적 선택 후 복구 | OK |
| 실제 메뉴의 `CmdOrCtrl+,` binding·같은 handler 연결 | OK — unit test와 실제 메뉴 구조 확인 |
| 물리 `⌘,` 입력·실제 titlebar 드래그·VoiceOver | **미검증** — desktop capture가 COMPUTER_SCREENSHOT_FAILED로 실패. native 입력을 실행하지 않음 |
| 실제 SSH·OS 알림 | 실행 없음 — 금지된 SSH action 요청 0, watch/outbox event 없음 |

라이트·다크 main/settings 네 화면을 renderer screenshot으로 직접 확인했다. 테마 변경 직후 CSS transition 중간 프레임과 안정된 프레임을 구분하여 최종 확인은 transition 완료 후 실시했다. native desktop screenshot이 성공했다고 주장하지 않는다.

기존 `npm run smoke:electron:first-run`은 Fleet/History 등 옛 탐색을 전제로 하므로 이번 단계에 실행하지 않았다. Stage 4에서 새 탐색으로 맞춘 뒤 실행하는 승인된 계획을 유지한다. unsigned packaged smoke, live SSH, 실제 OS 알림·OS 외형 설정 변경도 이번 결과에 포함하지 않는다.

## 잔여 위험

- 물리 단축키·native dragging·VoiceOver는 직접 검증하지 못했다. accelerator·frame 설정과 UI 동작의 자동 검증을 실제 OS 입력 검증으로 확대하지 않는다.
- native QA는 dev Electron과 격리 예시 데이터다. packaged app·실제 GUI SSH 환경·실제 알림 배너 노출은 증명하지 않는다.
- 현재 본문은 기존 detail이다. 새 GPU 요약/미터/동시 펼침·추가 지표는 Stage 2, per-server `…`·관리 시트는 Stage 3, 가용 상태·watch 조건/cooldown 보존은 Stage 4다.
- 소유한 임시 QA 프로세스가 0개임을 확인하고 임시 데이터·스크립트를 정리했다. 수행 절차·관측 결과와 영구 unit tests는 이 보고서와 소스에 남겼다. 임시 smoke 경로는 배포용 검증 스크립트가 아니다.

## 다음 단계 영향

- Stage 2는 `gpuDisclosures[serverId][gpuKey]`와 `setGpuDisclosure(serverId, gpuKey, partial)`를 실제 카드·추가 지표 토글에 연결한다. UUID 우선/index 대체의 안정적인 key를 사용하고 서버 이동·부모 접힘으로 독립 상태를 지우지 않는다. 이 상태는 재실행 때 복원하지 않는다.
- 기존 detail의 historyQuery/liveSamples/UI History 코드는 Stage 2에서 정리한다. helper/API·DB 저장 정책을 함께 삭제하지 않는다.
- 서버 관리는 임시 sidebar 관리 진입에서 실제 기존 form/controller로 연결되어 있다. 대체 메뉴·시트가 연결되기 전 기능을 지우지 않는다.
- runtime guidance 정합성 보완 제안: 기존 `src/AGENTS.md`의 App/Shell 탐색 인덱스와 로컬 `window.gpuwatcherUi` 설명을 Stage 2 시작 때 갱신한다. 분류는 agent runtime 인덱스, 독자는 후속 구현자, 위치는 기존 `src/AGENTS.md`이며 새로운 제품 문서 루트나 `mydocs/manual`로 옮기지 않는다. no-install/보안 규칙은 바꾸지 않는다. 승인 후 수행/구현계획에도 이 직접 영향 파일을 명시하고 진행한다.

## 승인 요청

같은 스레드의 `stage 1 승인`으로 Stage 1 산출물·검증 결과·명시한 미검증 항목과 `Task #29 Stage 1: 서버 중심 창과 외형 설정 기반 적용` 단계 커밋을 승인받았다. Stage 2 진입이나 runtime 인덱스·계획 변경 승인으로 확대하지 않는다.

- 위 runtime 인덱스 위치 판단을 반영할 계획 보완과 Stage 2 진입을 별도로 승인 요청한다. 구현계획서 변경은 내용 승인·독립 커밋·exact SHA 확인 절차를 따른다.

Stage 2 이후 작업, push·PR·merge·issue close는 Stage 1 승인으로 승인된 것으로 간주하지 않는다.
