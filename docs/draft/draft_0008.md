# GPUWatcher Phase 7: Product Polish & Release QA

GPUWatcher의 전체 UI와 macOS Electron runtime을 제품 수준으로 마무리해라.

이전 단계에서 다음 작업이 완료되었다.

* macOS Native Frame과 Full-bleed Console shell
* 공통 디자인 시스템
* Overview fleet console
* Server Detail과 Live Monitor workspace
* Process Table과 Process Detail inspector
* Settings server management console과 SSH import workspace

이번 단계에서는 새로운 제품 기능이나 대규모 화면 재설계를 하지 않는다.

목표는 전체 앱을 감사하고, 화면 간 일관성·접근성·키보드 흐름·스크롤·상태 표현·smoke automation·unsigned packaged macOS QA를 통과시키는 것이다.

## 중요한 범위 규칙

이번 단계에서 허용되는 작업:

* UI 일관성 수정
* 접근성 개선
* focus와 keyboard flow 수정
* responsive와 overflow 문제 수정
* loading/error/empty copy 정리
* reduced motion 지원
* 공통 primitive의 작은 결함 수정
* Electron 창 표시와 macOS titlebar polish
* 테스트와 smoke assertion 업데이트
* QA evidence와 checklist 업데이트
* 실제 발견된 회귀 버그 수정

이번 단계에서 금지되는 작업:

* 새로운 backend feature
* 새로운 DTO field
* 새로운 IPC action
* 새로운 database schema
* 대규모 navigation 변경
* 새로운 chart framework
* 새로운 component library 도입
* 전면적인 색상 테마 재설계
* auto update
* telemetry
* analytics
* cloud sync
* 인증
* 서명 또는 notarization을 완료했다고 주장
* 기존 작업을 핑계 삼아 또 다른 디자인 시스템 구축

# 작업 전 확인

다음을 먼저 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `package.json`
* `electron/main.ts`
* `src/App.tsx`
* `src/components/Shell.tsx`
* `src/components/ui/`
* `src/features/overview/`
* `src/features/detail/`
* `src/features/history/`
* `src/features/processes/`
* `src/features/settings/`
* `src/styles/`
* `smoke/`
* `docs/smoke-checklist.md`
* 관련 unit, integration, smoke tests

작업 시작 전에 현재 working tree와 최근 Phase 1~6 변경을 확인한다.

기존 변경을 되돌리지 말고 실제 문제를 발견한 파일만 수정한다.

# 1. 전체 시각 일관성 감사

모든 화면을 나란히 검토한다.

* Overview
* Server Detail
* Live Monitor
* Process Table
* Settings

다음 요소가 동일한 디자인 언어를 사용하는지 확인한다.

* page header
* section header
* primary/secondary/ghost/danger button
* input/select/checkbox
* toolbar
* summary strip
* card/surface
* table
* status badge
* diagnostic
* loading/error/empty/result feedback
* chart panel
* drawer/dialog
* danger zone
* focus-visible
* full/compact density

## 일관성 기준

* 동일한 의미에는 동일한 component와 token 사용
* page heading 크기와 spacing 일치
* section heading hierarchy 일치
* status 의미별 색상과 text 표현 일치
* primary action이 한 화면에 과도하게 여러 개 존재하지 않음
* glow와 큰 shadow 남용 금지
* panel 안에 panel이 반복되는 중첩 제거
* arbitrary Tailwind class가 같은 패턴을 반복하면 의미 class 또는 공통 primitive 검토
* 단, 단 한 번 쓰이는 스타일을 억지로 추상화하지 않음

## legacy token 감사

현재 compatibility alias는 기존 화면을 위해 유지될 수 있다.

그러나 다음 legacy 표현이 실제로 더 이상 필요하지 않은지 확인한다.

* `--shadow-panel`
* `--shadow-glow`
* 과도한 large radius
* display font 기반 거대 heading
* 오래된 `.panel-strong`
* 이전 dashboard용 utility override

완전히 사용되지 않는 token과 class만 안전하게 제거한다.

검색 결과만 보고 제거하지 말고 build와 모든 테스트로 검증한다.

# 2. Typography와 숫자 표현

전체 앱에서 typography hierarchy를 정리한다.

## 기본 규칙

* UI 본문은 macOS system font stack 유지
* display font는 제한적인 metric 또는 숫자 표현에만 사용
* page title은 일관된 크기와 weight
* section title은 page title보다 명확히 작음
* 긴 server name, hostname, username, UUID, command가 layout을 밀지 않음
* 숫자 비교가 중요한 table과 metric은 tabular numbers 검토
* mono font는 PID, UUID, command, path 등 실제로 적합한 곳에만 사용

## formatter 계약

다음을 유지한다.

* null은 unknown
* 실제 숫자 0은 0
* missing metric을 0으로 변환하지 않음
* percent, temperature, memory, time formatter 유지
* error와 command sanitization 유지
* local path와 token redaction 유지

동일한 값이 화면마다 다른 형식으로 표시되는 문제를 수정한다.

# 3. Spacing과 density 감사

full과 compact density를 모든 화면에서 검증한다.

## Full density

* 읽기 편한 section spacing
* 과도한 빈 공간 없음
* 카드 높이가 불필요하게 크지 않음
* 최소 창 높이에서 주요 action 접근 가능

## Compact density

* 정보를 제거하지 않음
* control과 row 높이만 줄임
* text clipping 없음
* button accessible target이 지나치게 작지 않음
* chart label과 legend 유지
* table header와 row 구분 유지
* Settings form label과 validation 유지

## 금지

* `.mt-4`, `.mt-6` 같은 generic utility를 density selector에서 전역 override
* compact에서 중요한 설명이나 status 숨김
* fixed pixel height 때문에 content 잘림
* density마다 별도 JSX tree 생성

component-level CSS variable을 사용한다.

# 4. Responsive와 overflow 감사

기준 최소 창 크기에서 모든 화면을 검증한다.

Electron의 기존 `minWidth`, `minHeight` 계약을 유지한다.

## 확인 항목

* shell body에 horizontal scrollbar 없음
* sidebar와 titlebar 폭 정렬
* page content만 scroll
* table horizontal scroll은 table container 내부에 제한
* drawer 내부만 별도 scroll
* chart가 parent width를 넘지 않음
* Settings master-detail layout이 좁은 폭에서 stack
* toolbars가 자연스럽게 wrap
* action button이 viewport 밖으로 밀리지 않음
* 긴 문자열이 layout을 파괴하지 않음
* sticky header가 titlebar 또는 page header를 덮지 않음
* empty/error state가 최소 폭에서 잘리지 않음

다음 문자열로 수동 또는 fixture QA를 수행한다.

* 매우 긴 server name
* 긴 hostname
* 긴 username
* 긴 GPU UUID
* 긴 SSH key path
* 긴 command
* 긴 diagnostic message
* 긴 SSH config alias와 warning

CSS로 해결 가능한 문제에 JavaScript resize listener를 추가하지 않는다.

# 5. Keyboard navigation 감사

마우스 없이 전체 앱의 핵심 흐름을 사용할 수 있어야 한다.

## Global flow

* sidebar navigation
* density control
* page actions
* filters
* tables
* drawers/dialogs
* Settings forms
* delete confirmation
* SSH import candidate selection

## 확인할 동작

* Tab 순서가 시각 순서와 일치
* 숨겨진 element가 tab sequence에 남지 않음
* 모든 interactive element에 focus-visible
* Enter/Space semantics
* Escape로 drawer/dialog 닫기
* 닫은 뒤 trigger 또는 원래 row로 focus 복귀
* Process Table Arrow Up/Down navigation 유지
* selected/pressed/checked/current 상태가 accessibility tree에 노출
* disabled button이 왜 disabled인지 주변 context로 이해 가능
* titlebar drag region이 interactive control을 가로채지 않음

## Drawer와 dialog

공통 `RightDrawer`와 delete confirmation dialog를 감사한다.

최소 요구사항:

* `role="dialog"`
* `aria-modal="true"`
* accessible label 또는 labelled-by
* 열릴 때 적절한 첫 focus
* Escape close
* 닫을 때 trigger focus 복귀
* backdrop 뒤 content와의 accidental interaction 방지
* dialog 내부의 자연스러운 Tab 이동
* close button accessible name

현재 구현에 focus trap 또는 background inert 처리가 없다면, 공통 primitive 수준에서 작고 안전하게 보완한다.

새 dialog library를 도입하지 않는다.

# 6. Screen reader와 semantic structure

각 화면의 heading hierarchy를 확인한다.

권장 구조:

* 앱 identity: `h1` 한 개
* page title: `h2`
* 주요 section: `h3`
* 하위 card/GPU/chart section: `h4`가 필요한 경우

## 확인할 semantics

* navigation에 label
* active navigation에 `aria-current="page"`
* toolbar에 accessible label
* table에 caption 또는 aria-label
* sortable column에 `aria-sort`
* process row accessible identity
* status badge에 visible text
* charts에 의미 있는 aria-label
* loading에 `role="status"`와 live region
* error에 `role="alert"`가 필요한 곳
* success feedback에 polite live region
* form label/input 연결
* helper/error text의 `aria-describedby`
* invalid field의 `aria-invalid`
* candidate disabled reason 연결
* destructive confirmation의 명확한 label
* icon이나 arrow가 장식이면 `aria-hidden`

색상, 위치 또는 border만으로 의미를 전달하지 않는다.

# 7. Focus-visible과 contrast

모든 interactive component의 focus-visible을 확인한다.

* Button
* sidebar navigation
* input
* select
* checkbox/switch
* sortable table header
* process row
* SSH import candidate
* drawer close
* dialog button
* chart toggle
* density control

focus ring이 다음 문제를 일으키지 않게 한다.

* overflow container에 잘림
* sticky table cell 뒤에 숨김
* titlebar drag region과 충돌
* danger background에서 대비 부족
* stale row background에서 대비 부족

텍스트와 border 대비를 dark mode에서 검토한다.

특히 다음을 확인한다.

* tertiary text
* disabled text
* stale status
* warning callout
* placeholder
* table header
* chart legend
* command preview
* helper text

브랜드 lime을 모든 focus, selection, status에 무분별하게 사용하지 않는다.

# 8. Motion과 reduced motion

현재 transition token을 유지하되 `prefers-reduced-motion`을 전역 지원한다.

권장:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

저장소 스타일 구조에 맞게 구현한다.

조건:

* position translate hover 금지
* button scale 효과 금지
* drawer animation이 있다면 reduced motion 대응
* loading 상태에 불필요한 무한 animation 추가 금지
* chart 데이터를 animation으로 왜곡하지 않음
* focus 이동에 smooth scroll을 강제하지 않음

# 9. Loading, error, empty, success copy 감사

모든 상태 문구를 제품 전체에서 검토한다.

## 원칙

* 사용자가 무엇이 일어났는지 알 수 있음
* 다음에 할 수 있는 행동이 명확
* backend 또는 내부 구현 용어를 불필요하게 노출하지 않음
* Electron이 필요한 action은 browser fallback에서 명확히 설명
* 정적 화면 identity는 error 때문에 사라지지 않음
* 실제로 제공되지 않는 action을 제안하지 않음
* unsigned package를 production-ready라고 표현하지 않음

## 용어 통일

다음 용어를 일관되게 사용한다.

* Server
* GPU
* Process
* Live Monitor
* Refresh
* Current
* Stale
* Enabled / Disabled
* SSH config
* Connection test
* Polling interval
* unknown

`host`, `server`, `target`을 같은 맥락에서 무작위로 섞지 않는다.

기존 테스트가 제품 계약으로 보호하는 문구는 이유 없이 바꾸지 않는다.

copy를 바꾸면 smoke assertion과 tests도 의미 중심으로 업데이트한다.

# 10. Electron native frame 감사

macOS Electron 창을 실제로 실행해 확인한다.

## 확인 항목

* native traffic lights 표시
* traffic lights와 app identity 겹침 없음
* titlebar와 sidebar가 자연스럽게 연결
* 빈 titlebar 영역에서 drag 가능
* button/input/select는 no-drag
* 최초 표시 시 white flash 없음
* background color 일치
* 창 최소 크기 정상
* maximize/restore 후 layout 정상
* 창 크기 변경 중 flicker 최소화
* app activate 후 window 재생성 정상
* macOS에서 마지막 창을 닫은 뒤 app lifecycle 정상
* packaged app에서도 titlebar layout 동일

`contextIsolation: true`와 `nodeIntegration: false`를 유지한다.

preload, IPC, helper, scheduler lifecycle을 변경하지 않는다.

# 11. Plain Vite browser fallback 감사

`npm run dev`의 plain browser surface를 검증한다.

조건:

* static app shell과 navigation 표시
* backend-unavailable error가 화면 identity를 가리지 않음
* Overview, Process Table, Settings의 read-only/static context 유지
* Electron 전용 action이 작동하는 척하지 않음
* demo row를 조작해 backend failure를 숨기지 않음
* generic invoke 추가 금지
* stack trace 또는 sensitive path 노출 금지

# 12. Unit 및 integration test 감사

모든 기존 테스트를 실행한다.

```bash
npm run test -- --run
```

테스트 실패를 snapshot 또는 assertion 삭제로 회피하지 않는다.

## 테스트 품질 확인

* 구현 class 이름에 과도하게 결합되지 않음
* role, accessible name, visible text, user action 중심
* focus 이동 검증
* Escape close 검증
* dialog/drawer accessible semantics
* full/compact density
* null/unknown 계약
* sanitization
* error 상태에서도 static identity 유지
* long text fixture
* minimum width 관련 의미 구조
* selected/current/pressed state

필요한 회귀 테스트만 추가한다.

전체 UI를 거대한 snapshot 하나로 고정하지 않는다.

# 13. Build 및 Rust verification

다음을 실행한다.

```bash
npm run build
npm run electron:build
npm run helper:build
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
```

조건:

* normal test는 live SSH에 의존하지 않음
* `tml-server` 사용 금지
* generated artifact를 source에 commit하지 않음
* TypeScript warning 또는 test warning을 무시하지 않음
* React key, act, uncontrolled input warning 확인
* Electron console error 확인

# 14. Electron dev smoke 강화

기존 `npm run smoke:electron:first-run` smoke를 리팩토링된 UI에 맞게 업데이트한다.

현재 smoke의 핵심 흐름을 유지한다.

* isolated data directory
* isolated HOME
* isolated SSH config
* action-specific preload bridge guardrails
* Settings SSH import
* sanitized error
* Overview seed
* Process refresh
* History refresh
* Settings cleanup
* screenshot evidence

## assertion 원칙

* 오래된 마케팅 copy나 exact layout class에 결합하지 않음
* page identity와 user-visible result 중심
* UI가 nonblank인지뿐 아니라 주요 navigation과 state가 실제로 존재하는지 확인
* sensitive path/token이 screenshot 또는 body text에 노출되지 않는지 확인
* 각 주요 화면의 screenshot 확보
* full density screenshot
* compact density screenshot
* 최소 창 크기 screenshot 가능하면 추가

## 권장 screenshot evidence

* initial Overview
* Overview with seeded servers
* Server Detail
* Live Monitor
* Process Table
* Process Detail drawer
* Settings registry/editor
* SSH import candidates
* connection or sanitized error
* compact density
* minimum window size

불안정한 timestamp, random temp path, transient animation에 assertion을 결합하지 않는다.

# 15. Packaged app smoke

다음을 실행한다.

```bash
npm run electron:pack
node smoke/electron-packaged-app-smoke.mjs
```

생성된 `.app` 경로를 `mac` 또는 `mac-arm64`로 하드코딩하지 않는다.

다음을 검증한다.

* `GPUWatcher.app` 존재
* renderer assets 존재
* Electron main/preload 존재
* helper가 ASAR 밖 resource 경로에 존재
* packaged app launch
* first window nonblank
* navigation 표시
* helper health 또는 명확한 helper error
* titlebar/full-bleed shell 표시
* sensitive path 미노출
* isolated smoke data 사용
* production DB 오염 없음

수동으로 packaged `.app`도 실행해 dev mode와 시각 차이를 비교한다.

# 16. Unsigned DMG와 ZIP 검증

다음을 실행한다.

```bash
npm run electron:dist:unsigned
node smoke/electron-unsigned-dist-artifacts.mjs
```

검증:

* DMG와 ZIP이 존재하고 non-empty
* 두 artifact에 `GPUWatcher.app` 포함
* helper resource 포함
* artifact naming 정상
* app bundle 구조 정상

중요:

이 artifact는 internal/test unsigned output이다.

다음을 주장하지 마라.

* signed
* notarized
* uploaded
* auto-updated
* production release-ready
* external distribution-ready

Gatekeeper 또는 quarantine 차단은 unsigned artifact caveat로 기록한다.

# 17. SSH runtime caveat 검증

GUI와 Terminal의 SSH 환경 차이를 문서와 error copy에서 확인한다.

* `SSH_AUTH_SOCK`
* known_hosts first-use prompt
* passphrase prompt
* GUI launch PATH
* noninteractive remote shell
* `nvidia-smi` availability

앱에 password prompt나 interactive terminal을 추가하지 않는다.

원격 서버에 다음을 설치하지 않는다.

* GPUWatcher
* nvitop
* Python collector
* repository files
* 별도 agent

# 18. Console warning과 sensitive data 감사

dev와 packaged 앱에서 console 및 smoke logs를 확인한다.

금지된 노출:

* private key material
* full sensitive local path
* token
* raw command secret
* helper path가 renderer-visible API로 노출
* generic action payload
* stack trace가 user-facing UI에 노출

필요한 error는 sanitize된 형태로 유지한다.

민감정보 검증을 약화시키기 위해 test fixture를 단순화하지 않는다.

# 19. 문서 업데이트

실제 검증 절차와 일치하도록 다음을 업데이트한다.

* `docs/smoke-checklist.md`
* 필요한 경우 README의 active setup 부분
* 필요한 경우 troubleshooting
* smoke evidence naming 설명

문서는 현재 Electron runtime만 설명한다.

Tauri를 active setup으로 되살리지 않는다.

unsigned artifact와 production release를 구분한다.

# 20. QA matrix

다음 matrix를 실제로 점검하고 결과를 보고한다.

## 화면

* Overview
* Server Detail
* Live Monitor
* Process Table
* Settings

## density

* Full
* Compact

## window

* Default size
* Minimum size
* 넓은 size
* resize 후
* maximize 후 restore

## data state

* Loading
* Success
* Empty
* Filtered empty
* Partial unknown
* Stale
* Error
* Backend unavailable
* Mutation pending
* Mutation success
* Mutation error

## input

* Mouse
* Keyboard only
* Escape close
* Arrow navigation
* Long text
* Disabled control
* Reduced motion

## runtime

* Plain Vite
* Electron dev
* Packaged `.app`
* Unsigned DMG/ZIP artifact validation

# 21. 수정 범위

이번 단계는 감사 결과에 따라 여러 파일을 수정할 수 있다.

그러나 다음 원칙을 지킨다.

* 발견한 문제와 직접 관련된 파일만 수정
* 화면별 feature logic 재설계 금지
* backend/Rust 수정은 실제 회귀가 확인된 경우에만 최소 범위
* 새 dependency는 원칙적으로 추가하지 않음
* 새로운 디자인 abstraction은 반복되는 실제 문제에만 추가
* CSS specificity 전쟁을 피하고 기존 token/component 구조 안에서 수정
* 테스트를 먼저 약화하지 않음

가능한 주요 대상:

* `src/components/Shell.tsx`
* `src/components/ui/`
* `src/features/*`
* `src/styles/*`
* `smoke/*`
* `docs/smoke-checklist.md`
* 관련 test files

# 완료 기준

다음을 모두 만족해야 Phase 7이 완료된다.

* 모든 화면이 같은 제품처럼 보임
* full/compact density가 전체 화면에서 정상
* 최소 창 크기에서 핵심 기능 사용 가능
* keyboard-only 주요 흐름 통과
* drawer/dialog focus와 Escape 동작 정상
* focus-visible과 semantic state 정상
* reduced motion 지원
* loading/error/empty/success copy 일관성
* sensitive data redaction 유지
* plain Vite fallback 정상
* unit tests 통과
* TypeScript/Vite build 통과
* Electron build 통과
* Rust core/helper tests 통과
* Electron dev smoke 통과
* packaged app smoke 통과
* unsigned DMG/ZIP validator 통과
* QA screenshot evidence 확보
* unsigned artifact를 production release라고 주장하지 않음

# 완료 보고 형식

1. 전체 감사 요약
2. 발견한 문제와 수정 내용
3. 화면 간 일관성 개선
4. keyboard와 focus 개선
5. semantic/accessibility 개선
6. responsive와 density 개선
7. reduced motion 처리
8. copy와 상태 표현 정리
9. Electron native frame 검증
10. plain Vite fallback 결과
11. unit/build/Rust test 결과
12. Electron dev smoke 결과
13. packaged app smoke 결과
14. unsigned DMG/ZIP 결과
15. 생성한 screenshot/evidence 목록
16. 수정 파일 목록
17. 남은 known issue
18. 실제 production release 전에 필요한 작업

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라.

기존 Phase 1~6 변경을 되돌리지 마라.

테스트 실패나 QA 실패를 숨기지 말고, 해결하지 못한 항목은 정확한 재현 절차와 함께 보고해라.
