# FRONTEND AGENTS

## OVERVIEW

React/TypeScript frontend renders backend DTOs from the Electron preload bridge through React Query and Zustand UI state. Desktop runtime calls must go through action-specific `window.gpuwatcher` methods exposed by preload. Plain Vite browser runs are allowed as a fallback surface for static identity and read-only empty states, but they don't have a desktop backend.

창 열기·외형 설정은 backend helper와 분리된 action-specific `window.gpuwatcherUi`를 사용한다. 설정 창은 외형 설정만 초기화하며 서버 조회·수집 스케줄러를 중복 실행하지 않는다.

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| 창 역할·서버 탐색 | `App.tsx` | 메인은 서버 선택·GPU detail·서버 관리, 별도 설정 창은 외형 설정만 표시. 화면 종류별 탭 없음. |
| 서버 sidebar | `components/Shell.tsx` | 실제 overview DTO의 서버 목록·상태와 선택/관리 진입. busy/free 개수를 가용 상태로 추정하지 않음. |
| GPU 카드·미터 | `features/detail/DetailGpuCard.tsx`, `GpuMetricMeter.tsx` | GPU/추가 지표 독립 펼침, UTIL/VRAM/온도 분절형 미터. History UI·renderer 샘플 축적 없음. |
| 세션 펼침 상태 | `lib/store.ts` | 서버+UUID 우선/index 대체 식별. 마지막 서버 ID만 저장하며 펼침은 세션에만 유지. |
| Shared UI states | `components/ui.tsx` | Loading, error, empty, status badge. |
| Electron API boundary | `lib/api.ts` | Calls action-specific `window.gpuwatcher` methods and defines browser fallback behavior. |
| Bridge contract | `../electron/helperContract.ts`, `../electron/preload.ts` | Keep action names and renderer-visible methods aligned. |
| 로컬 UI 경계·외형 | `../electron/uiContract.ts`, `lib/appearance.ts`, `features/settings/AppearanceSettings.tsx` | `window.gpuwatcherUi`의 openSettings/getAppearance/setAppearance/onAppearanceChanged. backend 경계와 분리. |
| DTO contracts | `lib/types.ts` | No `collectorCommand` field. |
| Formatting nulls | `lib/format.ts` | Unknown/null values render as `unknown`. |
| Settings | `features/settings/` | Server form and no-install requirements copy. |
| GPU 프로세스 표 | `features/detail/DetailProcessList.tsx` | PID·사용자·전체 명령·VRAM 보존. 성공한 빈 목록과 수집 불가/부분 수집 구분. 종료 조작 없음. |

## CONVENTIONS

- Keep frontend DTO names camelCase and aligned with Rust serde output.
- Use React Query for command-backed data and tests with mocked API or mocked `window.gpuwatcher` methods.
- Settings payload contains only server connection settings: id/name/host/port/username/key path/polling/enabled.
- Error states should show the problem without hiding the screen's static identity panel when practical.
- Unknown metrics display as `unknown`; zero is shown only when backend sends numeric zero.
- Browser fallback in `src/lib/api.ts` may return read-only empty states and explicit `backend_unavailable` errors for actions that need the desktop backend.

## ANTI-PATTERNS

- Do not add a collector command field, placeholder, default, or validation.
- Do not mention `gpuwatcher --json` in active UI copy.
- Do not add mode selectors for installed collector vs no-install; no-install SSH is the only mode.
- Do not fabricate demo rows to hide missing Electron bridge failures in plain Vite.
- Do not convert null GPU/process values into zero in formatters or JSX.
- Do not add generic IPC calls from renderer code; keep preload methods action-specific.
- `poll_due_servers`는 Electron main 전용이며 renderer/preload에 호출 경로를 추가하지 않는다. 로컬 UI bridge로 helper 경로·임의 action dispatch를 노출하지 않는다.

## VERIFY

```bash
npm run test
npm run build
npm run electron:build
```

Use browser QA for visible changes. Plain Vite may show backend-unavailable text; that is acceptable only if navigation and static screen context remain visible. Electron desktop QA should launch through `npm run electron:dev` or the unsigned package from `npm run electron:pack`.
