# GPUWatcher Phase 3: Overview Console 리팩토링

GPUWatcher의 Overview 화면을 Supabase/Vercel 스타일의 데스크톱 관리 콘솔로 완성해라.

Phase 1에서 macOS Native Frame과 Full-bleed Console shell이 구현되었고, Phase 2에서 공통 디자인 토큰과 UI primitive가 정리되었다. 이번 작업에서는 그 디자인 시스템을 실제 Overview 화면에 적용하고, 이후 다른 화면들이 따라갈 기준 화면을 만든다.

## 작업 전 확인

먼저 저장소의 현재 변경사항과 아래 파일을 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `src/features/overview/OverviewScreen.tsx`
* `src/features/overview/OverviewServerCard.tsx`
* `src/features/overview/overviewModel.ts`
* `src/features/overview/useOverviewController.ts`
* `src/features/overview/OverviewScreen.test.tsx`
* `src/components/ui.tsx`
* `src/components/ui/`
* `src/styles/tokens.css`
* `src/styles/components.css`
* `src/styles/screens.css`
* Phase 1과 Phase 2에서 수정된 shell 및 디자인 시스템 파일

현재 작업 트리에 있는 Phase 1·2 결과를 기준으로 작업한다. 기존 shell 또는 공통 디자인 시스템을 이전 스타일로 되돌리지 마라.

## 작업 목표

Overview가 앱을 열었을 때 다음 질문에 즉시 답하도록 구성한다.

1. 등록된 서버가 몇 대인가?
2. 정상, stale, error 상태인 서버가 몇 대인가?
3. 전체 GPU 용량과 사용 상태는 어떠한가?
4. 어떤 서버가 주의가 필요한가?
5. 서버별 주요 GPU 상태는 어떠한가?
6. 마지막 성공 수집과 오류 원인은 무엇인가?

기능이나 DTO를 새로 만들기보다 현재 `ServerOverviewDto`에 존재하는 값으로 정보 계층을 개선한다.

## 페이지 구조

Overview 화면을 다음 순서로 구성한다.

```text
Page header
Fleet summary
Filter toolbar
Loading / error / result feedback
Server list
Empty state
```

### 1. Page header

기존의 큰 floating `.panel` hero를 제거한다.

권장 구성:

* 작은 section label 또는 breadcrumb
* `Fleet overview` 또는 기존 의미를 유지한 명확한 제목
* 한 줄 설명
* 우측 action 영역

`Seed demo data` 기능은 유지한다.

다만 primary production action처럼 과도하게 강조하지 말고 secondary 또는 ghost action으로 표시한다. demo 데이터 생성 기능을 삭제하거나 숨기지 마라.

Page header 자체를 둥근 카드로 감싸지 않는다.

큰 display font, 과도한 negative letter spacing, 마케팅형 문구를 사용하지 않는다.

### 2. Fleet summary

현재 Overview DTO 배열에서 파생 가능한 요약 정보를 표시한다.

권장 항목:

* Total servers
* Online servers
* Needs attention
* Total GPUs
* Busy GPUs
* Free GPUs

모든 항목을 반드시 별도 큰 카드로 만들 필요는 없다. 4개 정도의 compact summary cell 또는 하나의 summary strip으로 구성할 수 있다.

추천 구성:

```text
Servers       Online       Needs attention       GPUs
5             3            2                     12 · 8 busy · 4 free
```

규칙:

* backend API 또는 DTO 변경 금지
* aggregate 값은 `overviewModel.ts`의 pure function으로 계산
* status 비교는 기존 프로젝트의 status semantics를 따른다
* online이 아닌 모든 상태를 무조건 error로 간주하지 않는다
* stale과 error를 시각적으로 구분한다
* 서버 배열이 비어 있을 때 misleading한 상태를 표시하지 않는다
* 숫자 `0`과 unknown을 혼동하지 않는다

파생 로직은 JSX 내부에 흩뿌리지 말고 테스트 가능한 함수로 분리한다.

### 3. Filter toolbar

기존 기능을 모두 보존한다.

* Search servers
* Status
* Quick filter
* Reset filters
* Showing N of M servers

새 디자인 시스템의 `InlineToolbar`, form control, Button primitive를 사용한다.

권장 배치:

```text
[ Search servers........................ ] [ Status ▾ ] [ Quick filter ▾ ] [ Reset ]
Showing 3 of 5 servers
```

조건:

* 검색 input이 가장 넓은 공간을 차지
* select는 compact하게 유지
* 좁은 폭에서 자연스럽게 wrap
* full/compact density 모두 지원
* filter summary가 주요 제목처럼 보이지 않게 한다
* active filter가 없을 때 Reset 버튼을 disabled 처리할 수 있으나, 기존 동작과 테스트를 깨지 않게 구현한다
* 필터 상태는 기존 controller에 그대로 유지

### 4. Server list

Overview 서버 목록은 카드와 테이블의 중간 형태인 compact console row로 디자인한다.

한 서버가 화면 높이를 과도하게 차지하지 않도록 한다.

권장 정보 계층:

```text
Server name                         Status       Last successful poll      Refresh
hostname

GPU total    Busy / free    GPU utilization    Memory usage    Max temp
4            3 / 1          81.2%              70.0%           74°C

Diagnostic summary, 오류가 있을 때만 표시
```

#### Server identity

* 서버 이름이 가장 중요한 텍스트
* host는 secondary text
* status badge는 이름 옆 또는 우측
* 서버 이름 또는 identity 영역 클릭 시 기존처럼 Server Detail로 이동
* Refresh 버튼은 별도의 명확한 action
* 카드 전체를 무조건 button으로 만들지 않는다
* Refresh 클릭이 Detail navigation을 발생시키지 않게 한다

#### 주요 metrics

기본 화면에는 다음 주요 metric만 표시한다.

* GPU total
* Busy / free
* Average GPU utilization
* Average memory
* Max temperature

`Last success`는 card header의 metadata 영역으로 이동한다.

`Error type`과 `Error message`를 일반 metric card로 표시하지 않는다. 오류는 diagnostic 영역으로 묶는다.

현재처럼 모든 값에 동일한 크기의 중첩 카드 8개를 만들지 않는다.

metrics는 아래 중 하나로 표현한다.

* border 없는 compact definition grid
* 얇은 separator를 가진 stat cells
* 하나의 내부 surface 안에 배치된 metric columns

각 metric마다 중첩된 그림자나 강한 border를 사용하지 않는다.

#### Diagnostic

다음 중 하나라도 존재하면 diagnostic 영역을 표시한다.

* `lastErrorType`
* `lastErrorMessage`

조건:

* 기존 `DiagnosticPanel`과 formatting/sanitizing 로직 재사용
* local SSH path 등의 민감한 문자열 redaction 유지
* 오류 type/message/guidance를 중복해서 여러 곳에 표시하지 않는다
* card 전체를 빨간색으로 만들지 않는다
* 좌측 indicator, 작은 status icon 영역 또는 낮은 대비의 danger surface 사용
* diagnostic은 정상 서버보다 오류 서버가 조금 더 높아지는 정도로 제한
* 오류가 없는 서버에는 빈 diagnostic 공간을 남기지 않는다

### 5. Refresh feedback

서버별 refresh pending, success, error 동작을 그대로 유지한다.

조건:

* pending 상태에서 기존 card identity와 metrics를 숨기지 않는다
* Refresh 버튼 disabled와 pending label을 명확히 표현
* success feedback은 compact하게 표시
* error feedback은 card 내부에서 관련 서버와 연결되어 보여야 한다
* filter state를 보존한다
* 기존 query invalidation 동작을 변경하지 않는다
* feedback 자동 제거 동작을 임의로 추가하지 않는다

### 6. Loading, error, empty states

페이지 header와 Overview 화면 identity는 어떤 상태에서도 유지한다.

#### Initial loading

* `Loading overview DTOs...` 의미 유지
* 화면 전체를 거대한 spinner로 가리지 않는다
* 가능하면 summary/list 영역에 bounded loading state 사용
* 가짜 metric 숫자를 표시하지 않는다

#### API error

* ErrorState를 page header 아래에 표시
* 오류가 발생해도 static Overview context를 숨기지 않는다
* 오류 문자열 sanitize 규칙을 유지한다

#### No configured servers

* 제목과 설명을 명확하게 표시
* `Seed demo data` 기능으로 이어지는 action을 제공할 수 있다
* 실제 서버 추가는 Settings에서 수행된다는 맥락을 표현할 수 있다
* 존재하지 않는 navigation API나 server creation API를 새로 만들지 않는다

#### Filtered empty state

* no configured servers와 명확히 다른 상태
* 현재 filter 결과가 없음을 표시
* Reset filters action을 제공
* 전체 Overview 화면을 빈 화면으로 바꾸지 않는다

## Overview model

`overviewModel.ts`에 필요한 pure helper를 추가한다.

예:

```ts
type FleetSummary = {
  totalServers: number;
  onlineServers: number;
  attentionServers: number;
  totalGpus: number;
  busyGpus: number;
  freeGpus: number;
};

export const summarizeFleet = (
  overview: readonly ServerOverviewDto[]
): FleetSummary => {
  // Existing DTO values only.
};
```

실제 이름과 타입은 기존 프로젝트 스타일에 맞춰라.

요약 함수에 대한 unit test를 추가한다.

최소 검증:

* 빈 배열
* online 서버
* stale 서버
* error/degraded 서버
* 여러 서버의 GPU 합계
* busy/free 값이 실제 숫자 0인 경우
* status 대소문자 처리
* 현재 DTO 타입에서 nullable 값이 있다면 unknown 처리

## CSS와 responsive behavior

가능한 한 Phase 2에서 만든 토큰과 primitive를 사용한다.

Overview 전용 의미 class는 `screens.css` 또는 적절한 feature style 위치에 추가할 수 있다.

권장 class 개념:

* `.overview-page`
* `.page-header`
* `.fleet-summary`
* `.fleet-summary-item`
* `.overview-server-list`
* `.overview-server-card`
* `.server-card-header`
* `.server-metrics`
* `.server-diagnostic`

정확한 이름은 기존 convention에 맞게 조정한다.

조건:

* inline arbitrary Tailwind class가 지나치게 늘어나지 않게 한다
* full/compact density 변수 사용
* 최소 창 크기에서 horizontal overflow 방지
* 1024px 창에서도 주요 action이 보이게 한다
* card metrics는 적절히 wrap
* server name과 hostname의 긴 문자열 처리
* error message가 폭을 밀어내지 않도록 wrap 또는 break 처리
* 전체 페이지가 아니라 shell의 content 영역만 스크롤되는 구조 유지

## 접근성

* Overview 영역에 적절한 heading hierarchy 유지
* server card는 `article` 또는 의미 있는 list item 유지
* 현재 `${server.name} overview` accessible label 유지 가능
* 서버 detail 이동 버튼에 명확한 accessible name
* Refresh 버튼은 여러 개 존재하므로 서버 이름을 포함한 accessible label을 권장
* status badge의 텍스트 유지
* loading feedback은 live region 유지
* error feedback은 alert role 유지
* filtered empty state의 Reset action에 명확한 label
* focus-visible 상태 유지
* 색상만으로 online/stale/error를 구분하지 않는다

## 기존 동작 보존

다음을 변경하지 마라.

* Overview DTO contract
* React Query query keys
* refresh mutation과 invalidation 범위
* seed mutation
* filter state와 filter semantics
* status option 생성 방식
* search 대상 필드
* error message sanitization
* diagnostic guidance
* Zustand server selection
* Detail 화면 navigation
* null metric을 unknown으로 표시하는 규칙
* browser fallback
* Electron IPC와 backend 코드

## 수정 범위

주요 수정 대상:

* `src/features/overview/OverviewScreen.tsx`
* `src/features/overview/OverviewServerCard.tsx`
* `src/features/overview/overviewModel.ts`
* `src/features/overview/OverviewScreen.test.tsx`
* 필요한 경우 별도 `overviewModel.test.ts`
* `src/styles/screens.css`
* Phase 2 공통 component를 사용하는 데 필요한 최소 호출부

공통 UI primitive에 새로운 기능이 꼭 필요하다면 범용 API로 추가하되, Overview만을 위한 임시 variant를 공통 컴포넌트에 넣지 마라.

Detail, History, Process Table, Settings 화면은 이번 단계에서 재설계하지 않는다.

## 테스트 보존

현재 Overview 테스트가 검증하는 다음 동작을 모두 보존한다.

* DTO 값 렌더링
* null metric을 unknown으로 표시
* identity, host, status, error type, sanitized message 검색
* 현재 데이터에서 status option 생성
* stale/error quick filter
* filter reset
* no-data와 filtered-empty 구분
* 서버 선택 후 Detail navigation
* refresh pending/success/error
* filter state 유지
* 정확한 query invalidation
* 다른 서버 history query 미무효화
* local path redaction
* bounded diagnostic guidance
* seed demo data 동작

기존 테스트를 시각 구조 변경에 맞게 수정하되, 기능 검증을 약화하지 마라.

추가 테스트:

* fleet summary aggregate
* server card에 핵심 metrics 표시
* last success가 metadata로 표시
* 오류 type/message가 일반 metric card로 중복되지 않음
* 오류가 없는 서버에는 diagnostic panel이 없음
* Refresh accessible name에 서버 identity 포함
* filtered empty state의 reset action
* full/compact density에서 콘텐츠 유지

구현 세부 class보다 role, accessible name, visible text와 사용자 동작을 우선해 테스트한다.

## 검증

다음을 실행한다.

```bash
npm run test -- --run
npm run build
npm run electron:build
```

Electron 실행이 가능하면:

```bash
npm run electron:dev
```

수동 QA 상태:

1. 여러 서버, full density
2. 여러 서버, compact density
3. online 서버만 존재
4. stale/error 서버 혼합
5. null metrics가 있는 서버
6. 긴 server name, hostname, error message
7. initial loading
8. backend error
9. no configured servers
10. filtered empty state
11. refresh pending
12. refresh success
13. refresh failure
14. 최소 창 크기

## 완료 기준

* Overview가 별도의 웹 대시보드가 아니라 Full-bleed desktop console 안에 자연스럽게 연결된다.
* 페이지 상단의 정보 계층이 명확하다.
* fleet 상태를 한눈에 파악할 수 있다.
* 서버 카드의 높이와 중첩 surface 수가 줄어든다.
* 오류가 없는 서버는 compact하게 보인다.
* 오류가 있는 서버는 원인과 guidance를 찾기 쉽다.
* 기존 기능과 테스트 동작이 유지된다.
* 새로운 backend 또는 DTO 변경이 없다.
* 다른 화면이 재사용할 수 있는 시각 문법이 확립된다.

## 완료 보고 형식

1. 새로운 Overview 정보 구조
2. fleet summary 계산 방식
3. server card 변경 사항
4. 오류 및 feedback 표현 방식
5. responsive 및 density 처리
6. 접근성 개선
7. 수정 파일 목록
8. 테스트와 빌드 결과
9. 수동 QA가 필요한 항목
10. Phase 4에 재사용할 패턴

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라. 기존 Phase 1·2 변경을 되돌리지 말고 작업 범위 밖의 파일을 수정하지 마라.
