---
name: GPUWatcher
title: GPUWatcher 시각 디자인
status: final
updated: '2026-10-05'
description: 서버 중심 GPU 모니터링을 위한 절제된 macOS Electron 데스크톱 시각 계약.
sources:
  - .memlog.md
  - https://github.com/erictli/scratch
# 승인된 구간 경계와 중간색 두 hex는 `.memlog.md` decision을 따른다. 나머지 정확한 색상 hex와 시각 수치는 [ASSUMPTION]이다.
colors:
  surface-base: '#F5F5F7'
  surface-panel: '#FFFFFF'
  text-primary: '#202124'
  text-secondary: '#555860'
  border: '#D5D7DC'
  focus: '#155FC0'
  selected: '#E2ECFA'
  warning: '#815100'
  error: '#B42318'
  surface-base-dark: '#202124'
  surface-panel-dark: '#292B30'
  text-primary-dark: '#F2F3F5'
  text-secondary-dark: '#B5B9C2'
  border-dark: '#484C55'
  focus-dark: '#8AB9FF'
  selected-dark: '#303F56'
  warning-dark: '#EDC16B'
  error-dark: '#FFA398'
  metric-low: '#2E7D32'
  metric-medium: '#F2D000'
  metric-high: '#C62828'
  metric-low-dark: '#74D28C'
  metric-medium-dark: '#FFE14A'
  metric-high-dark: '#FF7B72'
  available-surface: '#EFF8F0'
  available-surface-dark: '#21392A'
  available-border: '#6AA876'
  available-border-dark: '#57996B'
typography:
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 17px
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  meta:
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
  metric:
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  sidebar-width: 220px
  control-height: 28px
components:
  WindowChrome:
    background: '{colors.surface-base}'
    background-dark: '{colors.surface-base-dark}'
  ServerSidebar:
    width: '{spacing.sidebar-width}'
    background: '{colors.surface-base}'
    background-dark: '{colors.surface-base-dark}'
  ServerRow:
    selected: '{colors.selected}'
    selected-dark: '{colors.selected-dark}'
    radius: '{rounded.md}'
  IconButton:
    height: '{spacing.control-height}'
    radius: '{rounded.sm}'
    focus: '{colors.focus}'
    focus-dark: '{colors.focus-dark}'
  GpuCard:
    background: '{colors.surface-panel}'
    background-dark: '{colors.surface-panel-dark}'
    available-background: '{colors.available-surface}'
    available-background-dark: '{colors.available-surface-dark}'
    available-border: '{colors.available-border}'
    available-border-dark: '{colors.available-border-dark}'
    padding: '{spacing.4}'
    radius: '{rounded.lg}'
  AvailabilityWatch:
    foreground: '{colors.text-primary}'
    foreground-dark: '{colors.text-primary-dark}'
  AvailabilityNotification:
    note: 'macOS 시스템 알림 외형을 따름; HTML 모형은 실제 OS 알림이 아님'
  MetricValue:
    font-size: '{typography.metric.fontSize}'
    foreground: '{colors.text-primary}'
    foreground-dark: '{colors.text-primary-dark}'
  MetricBar:
    height: 8px
    segments: 20
    gap: 2px
    track: '#E6E8EC'
    track-dark: '#3A3D43'
    low: '{colors.metric-low}'
    low-dark: '{colors.metric-low-dark}'
    medium: '{colors.metric-medium}'
    medium-dark: '{colors.metric-medium-dark}'
    high: '{colors.metric-high}'
    high-dark: '{colors.metric-high-dark}'
    temperature-scale: '0–100°C; provisional length scale only'
  ProcessTable:
    font-size: '{typography.body.fontSize}'
    divider: '{colors.border}'
    divider-dark: '{colors.border-dark}'
  ServerEditor:
    background: '{colors.surface-panel}'
    background-dark: '{colors.surface-panel-dark}'
    gap: '{spacing.3}'
  SettingsWindow:
    background: '{colors.surface-base}'
    background-dark: '{colors.surface-base-dark}'
    padding: '{spacing.5}'
  ThemeSelector:
    radius: '{rounded.md}'
    selected: '{colors.selected}'
    selected-dark: '{colors.selected-dark}'
  StatusNotice:
    foreground: '{colors.text-secondary}'
    foreground-dark: '{colors.text-secondary-dark}'
    error: '{colors.error}'
    error-dark: '{colors.error-dark}'
---

## Brand & Style

**확인됨 — `.memlog.md`의 decision:** 타이틀바·사이드바·본문이 자연스럽게 연결되는 native macOS desktop 느낌, 절제된 컨트롤, 최소한의 카드 장식. Scratch는 시각 영감이며 런타임 전환 요구가 아니다. Electron은 유지하고 Tauri를 도입하지 않는다.

**[ASSUMPTION] — `.memlog.md`의 assumption:** 중립적인 밝은/어두운 표면, 파란 포커스, 시스템 폰트, 작은 간격과 모서리는 수용된 잠정 구현 기준이다. 지표 구간 경계, 세 지표의 분절형 표현 및 아래 중간색은 개별 확정됐다. 나머지 정확한 수치에는 [ASSUMPTION]을 유지한다. 2026-10-05 설계 최종화 승인을 반영했으며 제품 코드 구현 승인은 포함하지 않는다. 행동 계약은 `EXPERIENCE.md`가 담당한다. 참조 시안은 아래 Layout & Spacing의 링크에서 확인한다.

## Colors

**[ASSUMPTION]** 라이트는 접미사 없는 토큰, 다크는 동일 이름의 `-dark` 토큰을 사용한다. 색은 모두 평면 hex이며 그라데이션·투명 블러에 의존하지 않는다.

**확인됨:** 중간 구간은 갈색에 가까운 황토색이 아니라 선명한 노랑으로 표현한다. `{colors.metric-medium}` / `{colors.metric-medium-dark}`는 장식용 미터 채움에만 사용하고 숫자·단위·`중간` 문구는 기존 고대비 텍스트 색을 유지한다. 밝은 노랑 자체의 텍스트 대비 충족을 주장하지 않는다.

**시안 승인됨:** 중간색 라이트 `#F2D000`, 다크 `#FFE14A`는 수정 시안 확인 후 사용자 승인을 받았다. 이 두 색은 아래의 정확한 hex 미확정 규칙에서 제외한다.

- `{colors.surface-base}` / `{colors.surface-base-dark}`: 창 상단과 사이드바의 연속된 바탕.
- `{colors.surface-panel}` / `{colors.surface-panel-dark}`: 본문 카드·편집 영역의 작은 톤 차이. 별도의 떠 있는 웹 대시보드처럼 보이지 않게 한다.
- `{colors.text-primary}` / `{colors.text-primary-dark}`: 값·본문. `{colors.text-secondary}` / `{colors.text-secondary-dark}`: 지표 이름·단위·시각 정보.
- `{colors.selected}` / `{colors.selected-dark}`: 선택 서버와 테마 선택의 배경. `{colors.focus}` / `{colors.focus-dark}`: 키보드 포커스; GPU UTIL 크기나 건강 상태를 뜻하지 않는다.
- `{colors.border}` / `{colors.border-dark}`: 구조 구분. `{colors.warning}` / `{colors.warning-dark}`, `{colors.error}` / `{colors.error-dark}`: 경고·실패 문구. `{colors.metric-low}` / `{colors.metric-low-dark}`, `{colors.metric-medium}` / `{colors.metric-medium-dark}`, `{colors.metric-high}` / `{colors.metric-high-dark}`는 각각 낮음·중간·높음 부하/온도 구간을 나타낸다. 승인된 중간색 외 정확한 hex는 [ASSUMPTION]이며 색은 오류·건강·안전 한계 판정이 아니다.

**확인됨 — `.memlog.md`의 decision:** GPU UTIL과 VRAM 사용률은 `≤30%` 낮음, `>30%–≤60%` 중간, `>60%` 높음이다. 온도는 `≤60°C` 낮음, `>60°C–≤80°C` 중간, `>80°C` 높음이다. 세 지표 모두 같은 분절형 미터를 사용하고 현재 구간색 하나로 채운다. 무지개 색상 그라데이션을 쓰지 않는다. 온도 미터 길이에만 쓰는 `0–100°C` 척도는 [ASSUMPTION]이며 GPU의 백분율이나 하드웨어 최대 온도가 아니다.

**[ASSUMPTION] 분절 규격:** `{components.MetricBar.segments}`칸, 간격 `{components.MetricBar.gap}`, 높이 `{components.MetricBar.height}`. 채움과 중립 배경 모두 동일 간격으로 끊어지며 마지막 칸의 부분 채움을 허용한다. CSS 마스크는 간격을 만드는 용도이며 색상 그라데이션이 아니다. 숫자는 정확한 원값을 유지하고 색 구간도 칸 수로 반올림하지 않는다.

**확인됨 — 가용 카드:** 유휴 조건이 5분간 충족된 GPU 카드는 은은한 녹색 배경·테두리와 `사용 가능` 문구로 구별한다. 초록 미터 구간만으로 카드 전체를 강조하지 않는다. 알림을 꺼도 유효한 가용 상태는 표시한다. 수집 실패·unknown·stale에서는 현재 `사용 가능` 강조를 제거하고 상태 문구를 표시한다. [ASSUMPTION] 정확한 재질은 `{colors.available-surface}` / `{colors.available-surface-dark}` 및 `{colors.available-border}` / `{colors.available-border-dark}`로 제안한다.

**[ASSUMPTION] 접근성 목표:** 일반 텍스트 4.5:1, 큰 텍스트 3:1, 조작 경계·포커스 3:1. 얇은 장식 구분선을 조작 경계로 쓰지 않는다. 초안 토큰의 라이트/다크 텍스트·포커스 조합 22개를 계산해 각각 4.5:1·3:1 목표 충족을 확인했다. 이는 토큰 조합 확인이며 실제 렌더링·운영체제 재질·전체 접근성 검증은 아니다. 색만으로 상태를 전달하지 않는다.

## Typography

**[ASSUMPTION]** 시스템 sans-serif를 기본으로 사용하며 별도 웹폰트는 설치하지 않는다. 서버 제목은 `{typography.title.fontSize}`, 본문·표는 `{typography.body.fontSize}`, 단위·마지막 성공 시각은 `{typography.meta.fontSize}`, 요약 값은 `{typography.metric.fontSize}`를 사용한다. PID·명령은 `{typography.code.fontFamily}`로 구분한다. 지표 숫자는 tabular figures를 제안하며 한국어 레이블·단위를 생략하지 않는다. 긴 명령은 읽기·복사가 가능해야 하고 확대 시 필수 정보가 사라지지 않아야 한다.

## Layout & Spacing

**확인됨:** 왼쪽 서버 사이드바는 항상 표시한다. 오른쪽에 선택 서버의 전체 GPU 요약 카드를 표시하고, 각 카드는 제자리에서 독립적으로 펼쳐진다. 여러 펼침을 허용한다. 서버 추가·편집은 사이드바에서 시작한다. 설정은 별도 창이다.

**[ASSUMPTION]** 사이드바 `{spacing.sidebar-width}`, 카드 한 열, 본문 여백 `{spacing.4}`, 카드 간격 `{spacing.3}`를 제안한다. 긴 서버 목록과 본문은 각자 스크롤하며 창을 줄여도 사이드바를 숨기거나 아이콘 전용으로 바꾸지 않는다. 메인 시안의 880px 최소 폭·708px 높이는 잠정 기준이며 Electron 최소 창 크기 검증값이 아니다. 서버 추가·편집은 메인 창에 붙는 시트로 제안한다.

참조 시안: [라이트 메인 창](mockups/key-main-light.html), [다크 메인 창](mockups/key-main-dark.html)은 WindowChrome·ServerSidebar·GpuCard의 구성과 동시 펼침, 서버 메뉴, 추가 지표, 가용 강조·알림 대체 상태를 보여준다. [별도 설정 창](mockups/key-settings.html)은 SettingsWindow·ThemeSelector를 보여준다. [서버 관리](mockups/key-server-management.html)는 편집 시트·삭제 확인·SSH 테스트·가져오기·모니터링 꺼짐을 보여준다. 모두 예시 데이터와 잠정 수치의 브라우저 모형이며 실제 macOS 창 동작·재질을 검증하지 않는다.

## Elevation & Depth

**[ASSUMPTION]** 메인 창은 톤과 얇은 구분선으로 계층을 표현하고 카드 그림자·hover 상승은 쓰지 않는다. macOS 창 제어와 별도 창의 시스템 그림자는 존중한다. 창 상단에 별도 웹 헤더 박스나 장식용 툴바를 얹지 않는다. 투명 재질의 사용 여부는 미결정이다.

## Shapes

**[ASSUMPTION]** 작은 조작부는 `{rounded.sm}`, 서버 행·선택부는 `{rounded.md}`, 카드는 `{rounded.lg}`를 사용한다. 카드가 펼쳐져도 같은 외곽 형태를 유지한다. 과도한 pill·배지·큰 둥근 패널은 피한다.

## Components

시각 규칙만 기술한다. **모든 행의 시각 세부는 [ASSUMPTION]**이며 행동·확인된 구조는 `EXPERIENCE.md`의 동일 이름 행을 따른다.

| Component | 시각 계약 |
|---|---|
| WindowChrome | `{components.WindowChrome.background}`와 다크 대응 토큰으로 사이드바까지 연결. macOS 창 제어 위치·드래그 가능 영역과 조작 영역을 겹치지 않게 한다. |
| ServerSidebar | `{components.ServerSidebar.width}` 고정 제안. 상단 서버 목록과 `+` 메뉴(서버 직접 추가·SSH config 가져오기), 하단 작은 설정 아이콘. 별도의 History 항목 없음. 메뉴 위치는 확인됨, 크기·외형은 초안. |
| ServerRow | 서버 이름·연결 상태 문구와 `…` 메뉴(편집·삭제·모니터링 켜기/끄기·SSH 연결 테스트). 선택은 `{components.ServerRow.selected}` / `{components.ServerRow.selected-dark}`; 포커스는 선택과 별도로 표시. 긴 이름은 전체 이름 접근 수단 제공. |
| IconButton | `{components.IconButton.height}`, 얇고 일관된 선형 아이콘. hover/focus/disabled를 구분하며 기능명 접근성 레이블 제공. |
| GpuCard | `{components.GpuCard.padding}`와 `{components.GpuCard.radius}`. GPU 식별자·VRAM 사용량/총량과 사용률·UTIL·온도 및 각 값의 텍스트 구간 표시. 상세와 표는 같은 외곽 안에 이어지며 다른 카드처럼 떠 있지 않음. 기존 추가 정보는 초기 접힘 `추가 지표`로 보존하는 구조가 확인됨. [ASSUMPTION] 프로세스 아래 그룹별 텍스트 목록·얇은 구분선으로 표현하고 별도 카드·미터 장식을 추가하지 않음. |
| AvailabilityWatch | 펼친 카드 내부의 `사용 가능해지면 알림` 조작과 저장된 조건의 읽기 전용 요약. `{components.AvailabilityWatch.foreground}` 및 다크 대응 텍스트 색 사용. [ASSUMPTION] 체크 여부·저장 실패·권한 확인 불가를 텍스트로 구분하며 시스템 설정 경로는 보조 문구로 안내. 임의 조건 편집 폼은 이번 잠정안에 추가하지 않음. |
| AvailabilityNotification | macOS 시스템 알림 외형을 따르며 서버명·GPU 식별자·가용 상태를 짧게 표시. HTML 시안은 앱 밖에 `macOS 알림 예시 · 실제 발송 없음`으로 분리한다. OS 권한·집중 모드에 따른 배너 노출을 보장하지 않는다. |
| MetricValue | `{components.MetricValue.font-size}`. 지표 이름·값·단위·낮음/중간/높음 텍스트를 한 묶음으로 표시. unknown은 `알 수 없음`, 실제 0은 `0`; stale은 마지막 성공 시각과 함께 구분. |
| MetricBar | 세 지표 모두 `{components.MetricBar.segments}`칸의 단색 분절형 미터. 높이 `{components.MetricBar.height}`, 간격 `{components.MetricBar.gap}`. `{components.MetricBar.low}`, `{components.MetricBar.medium}`, `{components.MetricBar.high}` 및 다크 대응 토큰으로 구간을 나타내며 숫자·단위·구간 텍스트 병용. 마지막 칸 부분 채움 허용. 온도 길이는 `[ASSUMPTION]` `{components.MetricBar.temperature-scale}`에 따르고 채움만 척도 범위로 제한한다. |
| ProcessTable | `{components.ProcessTable.divider}` / `{components.ProcessTable.divider-dark}` 구분선. PID/사용자/명령/VRAM 열 제안, 읽기 전용. 긴 명령에 전체 값 접근, kill 버튼 없음. |
| ServerEditor | `{components.ServerEditor.gap}`으로 레이블·입력·필드 오류 정렬. 메인 창 시트 제안. 저장/취소 구분, 연결 성공처럼 보이는 장식 없음. [서버 관리 시안](mockups/key-server-management.html)에 편집과 삭제 확인·SSH 테스트·가져오기 대체 상태를 제시하며 세부 표현은 [ASSUMPTION]. |
| SettingsWindow | `{components.SettingsWindow.padding}`. 하나의 별도 창, 외형 선택 중심의 간결한 구성. 서버 관리는 사이드바, GPU 가용 알림은 펼친 해당 GPU 카드에 배치. |
| ThemeSelector | 시스템 설정 따르기/라이트/다크의 세 선택. `{components.ThemeSelector.selected}` / `{components.ThemeSelector.selected-dark}`와 선택 표시 병용; 구체 조작 형태는 시안에서 확인. |
| StatusNotice | `{components.StatusNotice.foreground}` / `{components.StatusNotice.foreground-dark}`의 상태·성공 시각 문구. 오류는 오류 토큰과 텍스트 병용, 데이터를 가리는 큰 경고 배너는 피함. |

## Do's and Don'ts

| Do | Don't |
|---|---|
| 확인된 서버 중심 구조와 절제된 창 일체감 유지 | Scratch의 기능·런타임을 복제하거나 Tauri 도입 |
| 값·단위·마지막 성공 시각을 읽을 수 있게 표현 | unknown을 0으로 채우거나 실패 시 stale 값을 최신값처럼 표시 |
| 숫자와 낮음/중간/높음 텍스트에 세 지표 공통 분절형 미터 병용 | 구간 색을 장애·건강·안전 한계 판정처럼 표현하거나 무지개 색상 그라데이션 사용 |
| 여러 카드의 독립적인 제자리 펼침 표현 | 별도 GPU 상세 페이지·강제 단일 펼침·전역 History 차트 추가 |
| [ASSUMPTION] 작은 톤 차이와 시스템 폰트로 정돈 | 장식용 차트·카드 그림자·읽기 전용 표의 프로세스 종료 조작 |

**잠정 유지:** 사용자의 비용·시간 효율 지시에 따라 [ASSUMPTION] 토큰 색·밀도·사이드바 폭·시트 방식·프로세스 열은 현재 시안을 잠정 기준으로 유지한 채 최종화했다. 가용 알림 진입과 `추가 지표` 접힘 구조의 개별 명시 승인도 유지한다.
