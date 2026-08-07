GPUWatcher의 Phase 2 디자인 리팩토링을 진행해라.

현재 Phase 1에서 macOS Native Frame과 Full-bleed Console shell이 완료되었다. 이번 단계에서는 화면별 레이아웃을 재설계하지 말고, Supabase/Vercel 스타일의 공통 UI 디자인 시스템을 구축하고 기존 공통 컴포넌트에 적용해라.

## 작업 전 확인

다음을 먼저 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `src/components/ui.tsx`
* `src/components/ui/formControls.tsx`
* `src/components/ui/statusFeedback.tsx`
* `src/components/ui/table.tsx`
* `src/components/ui/drawer.tsx`
* `src/styles/tokens.css`
* `src/styles/base.css`
* `src/styles/components.css`
* `src/styles/tables.css`
* 관련 테스트 파일

현재 작업 트리의 Phase 1 변경을 기준으로 작업하고, Native Frame과 shell 구조를 되돌리지 마라.

## 목표

공통 UI를 절제된 dark console 스타일로 통일한다.

* neutral dark surface
* 낮은 대비의 1px border
* 제한적인 radius
* 최소한의 shadow
* 명확한 hover와 focus-visible
* lime은 primary action과 선택 강조에만 사용
* cyan은 informational metric이나 chart에만 사용
* green, yellow, red는 상태 의미에만 사용
* glow, 과도한 gradient, glassmorphism 사용 금지
* interaction 중 요소 위치가 움직이지 않도록 한다

## 공통 컴포넌트

필요한 경우 다음 primitive를 추가하거나 기존 컴포넌트를 확장해라.

### Button

지원할 variant:

* `primary`
* `secondary`
* `ghost`
* `danger`

지원할 size:

* `sm`
* `md`

조건:

* 기본 `type="button"`
* disabled 상태 지원
* `className` 확장 가능
* hover 시 translate 또는 scale 금지
* 명확한 `:focus-visible`
* 기존 버튼 기능과 accessible name 유지

### Surface 또는 Card

다음 시각 계층을 표현할 수 있어야 한다.

* 기본 surface
* raised surface
* interactive surface
* danger 또는 warning 상태

모든 사용처를 억지로 React 컴포넌트로 바꿀 필요는 없다. CSS class가 더 단순하다면 의미 중심 class를 사용해도 된다.

### Form controls

* text input
* select
* label
* helper text
* error text

기존 native input과 select를 유지한다.

label과 input 연결, `aria-describedby`, disabled 상태를 보존한다.

### Toolbar

기존 `InlineToolbar` API와 기능을 가급적 유지하면서 다음을 개선한다.

* compact한 레이아웃
* 지나치게 카드처럼 보이지 않는 surface
* 좁은 창에서 자연스러운 wrapping
* full / compact density 토큰 사용
* label과 summary의 정보 계층 정리

### Status and feedback

다음을 일관된 디자인으로 통일한다.

* `StatusBadge`
* `MetricCard`
* `EmptyState`
* `LoadingState`
* `ErrorState`
* `DiagnosticPanel`
* `ResultFeedback`

조건:

* status badge는 너무 큰 pill이 되지 않게 한다
* 상태는 색상만으로 구분하지 않는다
* ErrorState 안에 중첩 ErrorState나 과도한 border가 생기지 않게 한다
* loading 상태가 실제 데이터처럼 보이지 않게 한다
* 기존 diagnostic 문자열과 sanitize 로직은 변경하지 않는다

## 디자인 토큰

`tokens.css`에 의미 중심 토큰을 정리해라.

최소 범주:

* window / sidebar / surface / raised / hover 배경
* primary / secondary / tertiary text
* default / strong border
* brand / brand soft
* success / warning / danger / informational
* control / card radius
* control height
* component padding
* focus ring
* transition duration

기존 화면이 참조하는 변수는 갑자기 삭제하지 말고 새 토큰으로 alias해 호환성을 유지한다.

## Density

full과 compact 모드를 모두 유지한다.

Tailwind margin utility를 전역으로 덮어쓰지 말고 다음과 같은 component-level variable을 사용한다.

* `--control-height`
* `--component-padding`
* `--toolbar-gap`
* `--card-padding`
* `--section-gap`

## CSS 상호작용

`base.css`의 전역 버튼 hover `transform: translateY(...)`를 제거한다.

다음을 추가하거나 보완한다.

* `:focus-visible`
* `prefers-reduced-motion`
* disabled cursor와 대비
* hover 시 background, border, text 변화
* drag titlebar 내부 interactive element의 no-drag 규칙 보존

## 작업 범위

우선 다음 파일에 집중한다.

* `src/components/ui.tsx`
* `src/components/ui/formControls.tsx`
* `src/components/ui/statusFeedback.tsx`
* 필요한 경우 새로운 `src/components/ui/Button.tsx`
* 필요한 경우 새로운 공통 primitive 파일
* 관련 UI 테스트
* `src/styles/tokens.css`
* `src/styles/base.css`
* `src/styles/components.css`
* 필요한 범위의 `tables.css`, `drawers.css`

화면별 feature component는 공통 API 변경으로 인해 필요한 최소 수정만 허용한다.

Overview, Detail, History, Processes, Settings의 페이지 레이아웃이나 정보 구조를 이번 단계에서 재설계하지 마라.

## 보존할 기능

* React Query 데이터 흐름
* Zustand UI 상태
* Electron preload 및 IPC
* browser fallback
* null과 unknown 표시 규칙
* server CRUD와 polling
* 기존 accessible label
* 기존 테스트가 검증하는 사용자 동작

## 테스트

공통 컴포넌트 테스트에서 최소한 다음을 검증해라.

* Button variant와 disabled 상태
* 기본 button type
* input label과 helper text 연결
* select option 렌더링
* toolbar label과 summary
* status별 badge class 또는 의미
* loading status의 live region
* error feedback의 alert role
* 기존 diagnostic 처리
* density 변경 후 기존 콘텐츠 유지

구현 class의 세부 문자열보다 role, accessible name, text와 사용자 동작을 우선해 테스트한다.

## 검증 명령

```bash
npm run test -- --run
npm run build
npm run electron:build
```

Electron 실행이 가능하면 다음 화면에서 시각 확인한다.

* Overview
* Process Table
* Settings
* full density
* compact density
* 최소 창 크기

## 완료 보고

다음 형식으로 보고해라.

1. 추가하거나 변경한 디자인 토큰
2. 공통 컴포넌트 API 변경
3. 기존 호출부 호환 방식
4. 접근성 개선
5. 수정한 파일
6. 실행한 검증과 결과
7. Phase 3에서 처리할 화면별 문제
8. 남은 시각적 리스크

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라. 작업 범위와 무관한 변경을 되돌리거나 수정하지 마라.
