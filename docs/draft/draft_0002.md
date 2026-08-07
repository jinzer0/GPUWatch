# GPUWatcher macOS Electron 디자인 리팩토링

`jinzer0/GPUWatch` 저장소의 `main` 브랜치를 기준으로 UI를 리팩토링해라.

이번 작업의 목표는 GPUWatcher를 기존의 웹 대시보드처럼 떠 있는 카드형 레이아웃에서, macOS 네이티브 데스크톱 앱처럼 창 전체가 하나의 인터페이스로 연결되는 구조로 바꾸는 것이다.

디자인 방향은 다음 두 가지를 결합한다.

* Supabase / Vercel 스타일의 절제된 콘솔 UI
* Native Frame + Full-bleed Console

기능 추가나 백엔드 변경이 아니라, Electron 창 chrome과 React 애플리케이션 shell의 시각적·구조적 리팩토링이 핵심이다.

## 먼저 확인할 파일

작업 전에 아래 파일과 각 디렉터리의 `AGENTS.md`를 읽고 기존 규칙을 준수해라.

* `AGENTS.md`
* `src/AGENTS.md`
* `electron/main.ts`
* `src/App.tsx`
* `src/components/Shell.tsx`
* `src/components/Shell.test.tsx`
* `src/styles/tokens.css`
* `src/styles/base.css`
* `src/styles/layout.css`
* `src/styles/components.css`
* `src/styles/screens.css`
* `src/lib/store.ts`

현재 화면별 기능과 데이터 흐름은 유지해야 한다.

## 핵심 디자인 원칙

### 1. Native Frame

macOS 기본 traffic lights는 유지한다.

완전한 frameless window나 직접 만든 close/minimize/maximize 버튼은 사용하지 않는다.

macOS에서는 Electron의 `titleBarStyle: 'hiddenInset'`을 사용해 React 콘텐츠가 타이틀바 영역 아래까지 자연스럽게 이어지도록 한다.

필요하면 traffic lights와 앱 제목이 겹치지 않도록 좌측 여백을 확보하되, 불필요하게 `trafficLightPosition`을 조정하지 않는다.

### 2. Full-bleed Console

현재 `.app-shell`의 바깥쪽 여백과 floating panel 중심 구조를 제거한다.

애플리케이션은 창 전체를 채우는 고정 shell이어야 한다.

전체 구조는 다음과 유사해야 한다.

```text
┌─────────────────────────────────────────────────────────┐
│ ● ● ●  GPUWatcher       Overview              4 online  │
├────────────────┬────────────────────────────────────────┤
│                │                                        │
│ Overview       │ Fleet snapshot              Refresh    │
│ Server Detail  │                                        │
│ Live Monitor   │ Server cards / charts / tables         │
│ Processes      │                                        │
│ Settings       │                                        │
│                │                                        │
│ 5 servers      │                                        │
└────────────────┴────────────────────────────────────────┘
```

* 타이틀바는 창 전체 너비를 사용한다.
* 좌측 사이드바는 타이틀바부터 창 하단까지 하나의 surface처럼 연결되어야 한다.
* 사이드바와 본문은 둥근 floating card가 아니라 얇은 separator로 구분한다.
* 본문만 독립적으로 스크롤되어야 한다.
* shell 자체에는 둥근 모서리, 그림자, glow를 적용하지 않는다.
* 카드, 입력창, 툴바 등 내부 요소에만 제한적으로 border radius를 사용한다.

## 디자인 언어

Supabase와 Vercel의 관리 콘솔처럼 차분하고 정보 밀도가 높은 스타일을 사용한다.

### 색상

* 전체 배경은 거의 검정에 가까운 neutral dark
* sidebar는 본문보다 아주 약간 밝거나 어두운 정도로만 구분
* 영역 구분은 배경색 차이보다 얇은 border를 우선
* 텍스트는 neutral white / gray 계열
* lime 색상은 브랜드 강조와 primary action에만 제한
* cyan은 그래프나 informational metric에만 사용
* green, yellow, red는 상태 표현에만 사용
* 기본 panel glow와 과한 radial gradient는 제거하거나 크게 약화
* 반투명 glassmorphism은 최소화
* macOS vibrancy와 transparent window는 이번 작업 범위에서 제외

### 타이포그래피

기본 UI 폰트는 macOS system font stack을 우선한다.

```css
-apple-system,
BlinkMacSystemFont,
"SF Pro Text",
"Helvetica Neue",
sans-serif
```

기존 display font는 큰 metric 숫자나 제한된 강조 요소에서만 사용한다.

현재처럼 큰 heading에 지나치게 압축된 글꼴과 강한 negative letter spacing을 반복하지 않는다.

### 모서리와 그림자

* shell: radius 없음
* sidebar: radius 없음
* titlebar: radius 없음
* page header: 일반적으로 별도 카드로 감싸지 않음
* 내부 card: 약 8px에서 12px
* 버튼과 input: 약 6px에서 8px
* shadow는 드물게 사용
* border는 `1px solid`의 낮은 대비로 사용

## Electron 창 작업

`electron/main.ts`를 수정한다.

macOS에서 다음 동작을 구현해라.

* `titleBarStyle: 'hiddenInset'`
* 앱 배경과 동일한 `backgroundColor`
* `show: false`
* `ready-to-show` 이후 창 표시
* 기존 창 크기와 최소 크기는 유지
* `contextIsolation: true` 유지
* `nodeIntegration: false` 유지
* preload 경로와 IPC 구조 변경 금지
* scheduler와 helper lifecycle 변경 금지

macOS 이외 플랫폼에 불필요한 frameless 동작을 강제하지 않는다.

예상 구조는 다음과 비슷할 수 있지만, 저장소 코드에 맞게 구현해라.

```ts
const isMac = process.platform === 'darwin';

mainWindow = new BrowserWindow({
  width: 1280,
  height: 860,
  minWidth: 1024,
  minHeight: 720,
  show: false,
  backgroundColor: '#0b0d10',
  ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
  webPreferences: {
    preload: path.join(__dirname, 'preload-runtime.cjs'),
    nodeIntegration: false,
    contextIsolation: true
  }
});

mainWindow.once('ready-to-show', () => {
  mainWindow?.show();
});
```

## React Shell 작업

`src/components/Shell.tsx`를 창 전체를 담당하는 application shell로 리팩토링해라.

권장 구조:

```tsx
<div className="app-window" data-density={densityMode}>
  <header className="window-titlebar">
    <div className="titlebar-sidebar">
      <div className="traffic-light-space" aria-hidden="true" />
      <span className="app-name">GPUWatcher</span>
    </div>

    <div className="titlebar-main">
      <span className="titlebar-page-title">{activeTabLabel}</span>
      <span className="titlebar-status">{onlineCount} online</span>
    </div>
  </header>

  <aside className="app-sidebar">
    <nav>{/* navigation */}</nav>
    <footer>{/* status and density controls */}</footer>
  </aside>

  <main className="app-content">
    <div className="page-container">{children}</div>
  </main>
</div>
```

정확한 JSX는 기존 기능과 테스트에 맞게 조정한다.

### 타이틀바

* 높이는 약 48px에서 56px 사이
* Electron draggable region으로 동작
* `-webkit-app-region: drag` 사용
* 버튼, select, input 등 상호작용 요소에는 반드시 `-webkit-app-region: no-drag`
* 좌측에는 traffic lights가 들어갈 충분한 공간 확보
* 앱 이름은 작고 절제되게 표시
* 현재 활성 화면 이름 표시
* 우측에는 online 서버 수처럼 짧고 유용한 상태 표시 가능
* 장식적인 hero 문구를 넣지 않는다

### 사이드바

* 기존 17rem보다 약간 좁은 15rem에서 16rem 정도 권장
* 전체 높이를 사용
* `position: sticky`와 viewport 계산식 제거
* 상단 소개 문구와 “Remote GPU console” hero copy 제거
* 내비게이션을 주요 콘텐츠로 사용
* 각 메뉴는 compact한 row 형태
* 선택 상태는 미세한 배경색, 왼쪽 indicator 또는 명확한 텍스트 대비로 표현
* hover에서 버튼 전체가 위로 움직이지 않게 한다
* 서버 수와 online 수는 작은 footer status 형태로 이동
* density control은 footer에 compact한 segmented control 또는 작은 버튼으로 유지
* 기존 `full`, `compact` 기능과 Zustand 상태는 유지

### 본문

* 창 안에서 `min-height: 0`
* 본문만 `overflow: auto`
* 콘텐츠 최대 너비는 유지할 수 있지만 창 전체를 과도하게 비우지 않는다
* 기본 page padding은 약 24px에서 32px
* compact 모드는 약 16px에서 20px
* 페이지 헤더는 기본적으로 별도 `.panel` 카드로 감싸지 않는다

## CSS 구조

`html`, `body`, `#root`가 전체 높이를 사용하도록 수정한다.

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
}

body {
  overflow: hidden;
}
```

shell은 CSS grid를 사용해도 좋다.

```css
.app-window {
  --sidebar-width: 15.5rem;
  --titlebar-height: 52px;

  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
  width: 100%;
  height: 100vh;
}

.window-titlebar {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  -webkit-app-region: drag;
}

.titlebar-sidebar,
.app-sidebar {
  border-right: 1px solid var(--color-line);
  background: var(--color-sidebar);
}

.window-titlebar {
  border-bottom: 1px solid var(--color-line);
}

.app-sidebar,
.app-content {
  min-height: 0;
}

.app-sidebar {
  overflow: hidden;
}

.app-content {
  overflow: auto;
}
```

## 디자인 토큰 리팩토링

`src/styles/tokens.css`를 정리한다.

의미 중심 토큰을 도입해라.

예:

```css
:root {
  color-scheme: dark;

  --color-window: #0b0c0e;
  --color-sidebar: #0e1013;
  --color-surface: #111419;
  --color-surface-hover: #15191f;
  --color-surface-raised: #181c22;

  --color-text: #f2f4f7;
  --color-text-secondary: #a1a7b0;
  --color-text-tertiary: #6f7680;

  --color-line: rgba(255, 255, 255, 0.08);
  --color-line-strong: rgba(255, 255, 255, 0.14);

  --color-brand: #b8e986;
  --color-brand-soft: rgba(184, 233, 134, 0.1);

  --radius-control: 0.45rem;
  --radius-card: 0.65rem;
}
```

색상 값은 현재 UI와 조화를 보면서 조정하되, neon dashboard처럼 보이지 않게 한다.

기존 변수에 의존하는 화면이 많다면 한 번에 제거하지 말고 새 토큰에 alias해서 호환성을 유지한다.

## Density mode 개선

현재 compact mode가 `.mt-8`, `.mt-6`, `.mt-4` 같은 Tailwind utility class를 전역으로 덮어쓰는 방식은 제거하거나 최소화해라.

밀도 차이는 component-level CSS 변수로 제어한다.

```css
.app-window {
  --page-padding-x: 28px;
  --page-padding-y: 24px;
  --section-gap: 24px;
  --card-padding: 20px;
  --control-height: 36px;
}

.app-window[data-density="compact"] {
  --page-padding-x: 20px;
  --page-padding-y: 16px;
  --section-gap: 16px;
  --card-padding: 14px;
  --control-height: 30px;
}
```

기존 compact mode 동작과 테스트는 유지한다.

## 기존 화면 조정

이번 작업에서는 모든 화면의 상세 디자인을 완전히 다시 만들지 않는다.

다만 shell 변경 후 어색하지 않도록 각 화면의 최상단 header는 최소한으로 정리한다.

우선순위:

1. `OverviewScreen`
2. `ServerDetailScreen`
3. `HistoryMonitorScreen`
4. `ProcessTableScreen`
5. `SettingsScreen`

각 화면에서 다음을 지킨다.

* 첫 번째 요소가 거대한 floating `.panel` hero가 되지 않게 한다
* eyebrow, 제목, 설명, primary action을 일반 page header로 구성
* 기존 기능과 API 호출은 변경하지 않는다
* loading, error, empty state를 숨기지 않는다
* backend unavailable 상태에서도 화면 identity는 유지한다

## 상호작용

현재 전역 버튼 hover의 `translateY(-1px)`는 sidebar navigation, toolbar button, compact control에는 부적절하다.

관리 콘솔 UI답게 위치 이동보다 background, border, text color 변화로 피드백을 준다.

다음을 고려해라.

* navigation row는 hover 시 이동하지 않음
* reduced motion 지원
* 명확한 `:focus-visible`
* 선택 상태에 색상만 의존하지 않음
* disabled 상태의 대비 유지

## 기능상 절대 변경하지 말 것

* React Query 기반 데이터 흐름
* Zustand의 active tab과 density state
* preload bridge API
* action-specific IPC 구조
* helper contract
* scheduler ownership
* server CRUD 동작
* polling 동작
* renderer에서의 browser fallback
* null 또는 unknown metric 처리
* Rust 코드와 데이터베이스 schema

다음을 새로 만들지 마라.

* generic `invoke`
* generic `runAction`
* renderer-callable `pollDueServers`
* Tauri 관련 코드
* custom window control 버튼
* 사용자 지정 remote command
* 가짜 demo row로 Electron 오류 숨기기

## 테스트

기존 테스트를 유지하고 필요한 테스트를 추가 또는 수정해라.

최소 검증 항목:

* Shell이 full density로 시작함
* density 전환이 계속 동작함
* active tab 전환이 계속 동작함
* 모든 navigation item이 렌더링됨
* titlebar에 앱 이름과 활성 화면 이름이 표시됨
* server count와 online count가 올바르게 표시됨
* shell root에 density attribute가 적용됨
* 기존 screen content가 계속 렌더링됨

가능하면 구현 세부 class name보다 사용자가 보는 role, label, text 기준으로 테스트한다.

## 실행할 검증 명령

작업 완료 후 다음을 실행하고 실패 원인을 해결해라.

```bash
npm run test -- --run
npm run build
npm run electron:build
```

Electron이 실행 가능한 환경이라면 추가로 다음을 확인한다.

```bash
npm run electron:dev
```

수동 확인 항목:

* macOS traffic lights가 정상적으로 보임
* traffic lights와 앱 이름이 겹치지 않음
* 빈 영역을 드래그해 창을 이동할 수 있음
* 버튼과 input을 눌렀을 때 창이 드래그되지 않음
* titlebar와 sidebar의 배경 및 separator가 자연스럽게 연결됨
* 본문만 스크롤됨
* shell 바깥에 불필요한 여백이 없음
* 창 최초 표시 때 흰색 flash가 없음
* full/compact density가 모두 깨지지 않음
* 최소 창 크기에서도 navigation과 콘텐츠를 사용할 수 있음

## 작업 결과 보고 형식

완료 후 아래 형식으로 보고해라.

1. 변경한 디자인 구조 요약
2. 수정한 파일 목록
3. Electron titlebar 처리 방식
4. Shell과 스크롤 구조 설명
5. 기존 기능 보존 여부
6. 실행한 테스트와 결과
7. 직접 확인이 필요한 시각적 항목
8. 남아 있는 리스크 또는 후속 리팩토링 후보

## Git 규칙

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라.

현재 저장소의 기존 변경사항을 되돌리거나 덮어쓰지 마라.

작업 범위와 무관한 파일은 수정하지 마라.

최초 리팩토링은 가능한 한 다음 범위에 집중한다.

```text
electron/main.ts
src/components/Shell.tsx
src/components/Shell.test.tsx
src/styles/tokens.css
src/styles/base.css
src/styles/layout.css
src/styles/components.css
src/styles/screens.css
```

화면별 파일 수정은 새로운 shell과 연결하기 위해 필요한 최소한으로 제한한다.
