# GPUWatcher Phase 5: Process Ledger Console 리팩토링

GPUWatcher의 `Process Table`과 `Process Detail Drawer`를 고밀도 데스크톱 콘솔 UI로 리팩토링해라.

Phase 1에서는 macOS Native Frame과 Full-bleed Console shell을 구현했고, Phase 2에서는 공통 디자인 시스템을 정리했다. Phase 3에서는 Overview를 기준 화면으로 완성했고, Phase 4에서는 Server Detail과 Live Monitor를 일관된 monitoring workspace로 만들었다.

이번 단계에서는 여러 서버와 GPU에서 실행 중인 process를 빠르게 검색하고 비교하고 상세 확인할 수 있는 고밀도 process ledger를 만든다.

백엔드, DTO, query, filtering 의미를 변경하는 작업이 아니다.

## 작업 전 확인

먼저 아래 파일과 관련 테스트를 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `src/features/processes/ProcessTableScreen.tsx`
* `src/features/processes/ProcessTableToolbar.tsx`
* `src/features/processes/ProcessRowsTable.tsx`
* `src/features/processes/ProcessDetailDrawer.tsx`
* `src/features/processes/processTableModel.ts`
* `src/features/processes/useProcessTableController.ts`
* `src/features/processes/ProcessTableScreen.test.tsx`
* `src/lib/visibility/`
* `src/components/ui/table.tsx`
* `src/components/ui/drawer.tsx`
* `src/styles/tables.css`
* `src/styles/drawers.css`
* `src/styles/screens.css`
* Phase 1~4에서 정리된 shell, 디자인 토큰, Button, form control, status, feedback 컴포넌트

현재 작업 트리의 디자인 시스템을 유지하고, 이전 floating dashboard 스타일을 되살리지 마라.

# 핵심 목표

Process Table 화면은 다음 질문에 빠르게 답해야 한다.

1. 어떤 process가 GPU memory를 가장 많이 사용하고 있는가?
2. 어느 서버와 GPU에서 실행 중인가?
3. 어떤 user가 process를 실행했는가?
4. process가 얼마나 오래 실행 중인가?
5. GPU, SM, memory, CPU utilization은 얼마인가?
6. 현재 row인가, stale snapshot인가?
7. parent-child 또는 user 단위로 어떤 관계가 있는가?
8. 상세 command와 optional metric은 무엇인가?

# 화면 구조

다음 순서로 구성한다.

```text
Page header
Process summary
Primary search and actions
Advanced filters
Refresh feedback / query warning
Process table
Process detail drawer
```

## 1. Page header

기존 `Process Table / GPU memory ledger` identity를 유지하되, 일반적인 console page header로 구성한다.

권장 구조:

```text
Process Table

GPU memory ledger                              [Refresh]
Latest successful process snapshots across configured servers
```

조건:

* 큰 floating card 사용 금지
* 제목과 설명은 Overview, Detail, Live Monitor와 같은 계층 사용
* Refresh는 우측 page action 또는 toolbar action
* refresh pending 중 기존 table을 숨기지 않음
* accessible name을 `Refresh process rows`처럼 명확하게 제공
* 기존 refresh feedback과 refetch 동작 유지

## 2. Process summary

현재 `processRows`와 `visibleRows`에서 계산 가능한 compact summary를 추가할 수 있다.

권장 항목:

* Total processes
* Visible processes
* Servers represented
* GPUs represented
* Current rows
* Stale rows
* Total GPU memory used

모든 항목을 별도 큰 카드로 만들 필요는 없다.

추천 형태:

```text
24 processes · 3 servers · 6 GPUs · 2 stale · 42.8 GiB GPU memory
```

조건:

* DTO 또는 backend 변경 금지
* 계산은 pure helper로 분리
* GPU memory null 또는 unknown을 0으로 취급하지 않음
* process row의 중복 identity 의미를 기존 key와 일치시킴
* 현재 filter 결과와 전체 결과를 혼동하지 않도록 label을 명확히 함
* summary가 table보다 더 큰 시각적 비중을 갖지 않게 함

필요하다면 `processTableModel.ts`에 다음과 유사한 helper를 추가한다.

```ts
type ProcessTableSummary = {
  totalProcesses: number;
  visibleProcesses: number;
  serverCount: number;
  gpuCount: number;
  currentCount: number;
  staleCount: number;
  knownGpuMemoryUsedMiB: number | null;
};
```

실제 타입과 naming은 프로젝트 스타일에 맞춘다.

# Toolbar와 filters

현재 기능을 모두 보존한다.

* Search
* Server
* GPU
* Kind
* Freshness
* View
* Reset
* Refresh

그러나 모든 control을 동일한 크기와 중요도로 한 줄에 나열하지 않는다.

## 3. Primary controls

항상 노출할 primary controls:

* Search
* Server
* GPU
* Refresh

Search가 가장 넓은 공간을 차지해야 한다.

권장 구조:

```text
[ Search process, PID, user, command........ ] [ Server ▾ ] [ GPU ▾ ] [ Refresh ]
```

Search placeholder는 실제 검색 대상에 맞게 명확하게 작성한다.

예:

```text
Search PID, user, command, server…
```

기존 검색 semantics는 변경하지 않는다.

## 4. Advanced filters

다음은 secondary 또는 advanced 영역으로 묶는다.

* Kind
* Freshness
* View mode
* Reset filters

표현 방식 후보:

* toolbar의 두 번째 row
* compact filter strip
* `More filters` disclosure
* 작은 segmented control

조건:

* feature를 숨기거나 제거하지 않음
* disclosure를 사용한다면 현재 active filter 수 또는 상태를 표시
* keyboard로 열고 닫을 수 있어야 함
* 좁은 창에서도 자연스럽게 wrap
* filter 변경 시 기존 visible row 계산 유지
* Reset은 search, filters, view, sort를 현재 동작대로 초기화
* active filter가 없다면 Reset disabled 가능
* view mode는 Flat / Parent grouped / User grouped 의미 유지

## 5. Filter dependencies

Server와 GPU filter의 기존 exact pair semantics를 유지한다.

현재 controller는 이름과 ID, GPU index와 UUID를 함께 사용해 중복 이름이나 index 충돌을 방지한다. 이를 단순한 name/index 비교로 약화하지 마라.

조건:

* 동일 server name을 가진 서로 다른 ID 구분
* 동일 GPU index를 가진 서로 다른 UUID 구분
* 선택한 option이 데이터 갱신으로 사라졌을 때 `All` fallback 유지
* status, kind, stale filter semantics 유지
* 새로운 URL state나 persistence를 임의로 추가하지 않음

# Process table

## 6. Table information hierarchy

현재 12개 column을 모두 동일한 중요도로 보여주지 않는다.

column을 다음처럼 분류한다.

### Primary columns

항상 빠르게 읽혀야 한다.

* Process / PID
* Server / GPU
* User
* GPU memory
* GPU utilization
* Runtime
* Freshness

### Secondary columns

비교에 유용하지만 폭이 좁을 때 우선순위가 낮다.

* SM utilization
* Memory utilization
* CPU
* Host memory

### Detail-only 또는 low priority

* full command
* GPU UUID
* parent PID
* encoder/decoder utilization

현재 table에서 제공되는 기능을 삭제할 필요는 없지만, desktop 최소 폭에서 12개 column이 모두 동일하게 압축되지 않도록 한다.

가능한 방법:

* Server와 GPU를 하나의 context column으로 병합
* PID와 command summary를 Process column으로 결합
* stale status를 별도 column 대신 context 또는 row indicator로 표현
* low priority metric을 drawer로 이동
* column visibility를 CSS responsive behavior로 제어
* optional column selector를 추가할 수 있으나 기존 기능을 복잡하게 만들지 않는 범위에서만 허용

DTO 값이나 정렬 key를 제거하지 마라.

## 7. 권장 table 구조

다음과 유사한 구조를 우선 검토한다.

```text
Process                Context           User       Runtime      GPU memory   GPU util
python · PID 4812      Training / GPU 0  alice      2h 18m       12.4 GiB     84%
command preview        current
```

또는 충분한 폭에서:

```text
Process | Server | GPU | User | Runtime | GPU memory | GPU util | CPU | Command
```

조건:

* row 높이는 정보 밀도를 유지
* 모든 cell을 card처럼 만들지 않음
* numeric metric은 정렬이 쉬운 alignment 사용
* PID, GPU index, memory 값은 tabular numeric font 또는 적절한 mono 스타일 사용
* command는 한 줄 preview로 truncate
* full command는 drawer와 title/accessible context에서 확인 가능
* unknown은 기존 formatter 그대로 표시
* null을 0으로 표시하지 않음

## 8. Sticky header

본문 table header를 sticky하게 만들어 긴 process 목록에서도 column context를 유지한다.

조건:

* shell titlebar가 아니라 table scroll context 안에서 sticky
* content 상단을 잘못 덮지 않음
* header background가 투명해서 body text가 비치지 않음
* border와 subtle shadow 또는 separator만 사용
* horizontal scroll에서도 header와 body column alignment 유지
* `aria-sort`와 sortable button semantics 보존

## 9. Horizontal overflow

최소 창 크기에서 전체 application layout을 밀어내지 않는다.

조건:

* table container 내부에서만 horizontal scroll
* shell 또는 body에 horizontal scrollbar 생성 금지
* 첫 번째 핵심 column을 sticky column으로 만드는 것을 검토할 수 있음
* sticky first column을 사용한다면 grouped section row와 focus ring이 깨지지 않게 함
* command가 무한 폭을 요구하지 않게 max width 적용
* UUID와 긴 server name은 truncate 또는 wrap 규칙 적용

## 10. Sorting

기존 정렬 semantics를 모두 유지한다.

* 같은 header 재클릭 시 asc/desc toggle
* 다른 metric column 선택 시 numeric metric은 기본 descending
* text column은 기본 ascending
* default sort 유지
* grouped view에서도 정렬된 process 의미 유지
* `aria-sort`
* sortable button accessible label

정렬 indicator는 단순 화살표를 사용할 수 있지만 다음을 지킨다.

* active sort가 명확
* 색상만으로 구분하지 않음
* inactive column의 indicator가 과도하게 시끄럽지 않음
* hover 시 header 위치가 움직이지 않음

## 11. Grouped views

기존 view mode를 모두 유지한다.

* Flat
* Parent grouped
* User grouped

section row는 일반 process row와 명확히 구분하되 거대한 banner처럼 보이지 않게 한다.

권장 표현:

```text
alice                                      8 processes
─────────────────────────────────────────────────────────
```

또는:

```text
▼ alice · 8 processes
```

현재 expand/collapse 기능이 없다면 새로 만드는 것은 선택 사항이며, 이번 범위에서 필요하지 않다.

조건:

* section row는 focus 가능한 process row처럼 동작하지 않음
* process count 유지
* parent depth의 indentation 유지
* depth가 깊어도 PID column이 과도하게 밀리지 않음
* grouped 상태에서도 Arrow Up/Down은 실제 process row 사이를 이동
* section row가 keyboard focus sequence에 끼어들지 않음

## 12. Stale rows

stale 상태를 row 전체의 낮은 대비 스타일과 명확한 textual indicator로 표시한다.

금지:

* row 전체를 강한 노란색 또는 빨간색으로 채움
* opacity를 너무 낮춰 읽을 수 없게 함
* stale 값을 0 또는 unavailable과 혼동

추천:

* 왼쪽 indicator
* muted background
* 작은 `Stale` badge
* latest snapshot timestamp가 DTO에 존재한다면 metadata로 활용

색상만으로 stale을 구분하지 않는다.

# Row interaction

## 13. Keyboard and pointer behavior

기존 동작을 반드시 보존한다.

* click으로 drawer 열기
* Enter 또는 Space로 drawer 열기
* Arrow Down/Up으로 visible process row 이동
* drawer open 시 Close button focus
* drawer close 시 원래 process row로 focus 복귀

추가 조건:

* 현재 focus row가 명확히 보임
* hover와 selected 상태 구분
* grouped section row는 Arrow navigation 대상이 아님
* horizontal scroll 중에도 focus outline이 잘리지 않게 함
* row 안에 별도 button이나 link를 추가한다면 row click과 충돌하지 않음
* `<tr tabIndex={0}>` 접근성 동작을 변경할 경우 동등하거나 더 나은 keyboard semantics를 제공해야 함

선택된 process row는 drawer가 열린 동안 subtle selected 상태를 유지할 수 있다.

필요하면 controller가 selected key를 노출하도록 범용적으로 확장하되, selection semantics는 변경하지 않는다.

# Process Detail Drawer

현재 drawer는 거의 모든 field를 각각 독립 `.surface` card로 표시한다. 이를 정보 그룹 중심의 inspector로 바꾼다.

## 14. Drawer header

권장 구조:

```text
PID 4812                                      [×]
python
Training Rig · GPU 0 · current
```

가능한 identity:

* PID
* command/process name
* server
* GPU
* current/stale status

`Read-only view` 문구는 유지하되 상단 전체를 강조색 banner로 만들 필요는 없다.

작은 informational note 또는 footer metadata로 표현한다.

## 15. Drawer sections

field를 다음 의미 그룹으로 정리한다.

### Identity

* PID
* Parent PID
* Process kind
* Username
* Runtime

### GPU context

* Server
* GPU index
* GPU UUID
* Status

### GPU metrics

* GPU memory
* GPU utilization
* SM utilization
* Memory utilization
* Encoder utilization
* Decoder utilization

### Host metrics

* CPU
* Host memory

### Command

* full command
* mono typography
* wrap
* copy가 필요하다면 clipboard API를 새로 연결하지 말고 기존 환경과 보안 범위 확인 후에만 추가
* 이번 단계에서 copy 기능은 필수가 아님

각 field를 독립 card로 만들지 않는다.

추천 표현:

* section heading
* definition list
* 2-column label/value rows
* subtle separator
* metric grid

## 16. Drawer layout

* 기본 폭은 process detail을 읽기에 충분하되 본문을 완전히 가리지 않음
* 최소 창 크기에서는 적절한 비율 또는 full-width fallback 고려
* drawer 내부만 scroll
* header와 close button은 sticky 가능
* command와 UUID가 drawer 폭을 밀어내지 않음
* tab order 자연스럽게 유지
* Escape close가 기존 RightDrawer에서 지원된다면 유지
* overlay 및 focus behavior를 기존 공통 drawer contract대로 유지

## 17. Drawer state

필터나 refresh로 선택한 process가 visible rows에서 사라지면 기존처럼 drawer가 닫혀야 한다.

닫힌 후 focus 복귀가 가능한 row가 없다면 안전하게 table 또는 page context로 focus를 이동할 수 있지만, 기존 controller 동작을 무리하게 변경하지 않는다.

# Error, loading, empty states

## 18. Loading

* page header 유지
* toolbar를 완전히 숨길지는 기존 데이터 유무에 따라 판단
* 가짜 process rows 표시 금지
* bounded loading state 사용
* 이전 데이터가 React Query에 남아 있다면 임의로 숨기지 않음

## 19. Query error

현재 query error이면서 기존 rows가 있으면 기존 rows와 함께 non-blocking warning을 보여주는 방향을 우선한다.

현재 row가 하나도 없을 때만 primary ErrorState를 사용한다.

조건:

* error message sanitization 유지
* static screen identity 유지
* refresh action 가능하면 유지
* stale local rows가 진짜 current 데이터처럼 보이지 않게 함

## 20. Empty states

다음을 구분한다.

### No process data

```text
No processes
No latest successful GPU process rows are currently available.
```

### Filtered empty

```text
No processes match filters
Adjust or reset the Process Table filters.
```

filtered empty에는 Reset filters action을 제공한다.

No process data 상태에서 Settings나 refresh로 이어지는 기존 경로가 없다면 존재하지 않는 API를 만들지 않는다.

# Process model tests

summary helper나 presentation helper를 추가한다면 pure unit test를 작성한다.

최소 검증:

* 빈 rows
* 하나의 current row
* current/stale 혼합
* 여러 server
* 동일 server name, 다른 server ID
* 동일 GPU index, 다른 UUID
* known GPU memory 합계
* null GPU memory 처리
* grouped process identity
* selected row key 안정성

기존 `processRowKey`, `serverFilterValue`, `gpuFilterValue` 의미를 변경하지 않는다.

# 접근성

* page `h2` 유지
* table caption 또는 accessible label 제공
* sortable header의 `aria-sort` 유지
* row accessible label에 PID와 server identity 포함
* status text 유지
* selected row에 적절한 상태 노출 검토
* drawer에 dialog/drawer accessible label 유지
* close button label 유지
* focus trap이 기존 RightDrawer에 있다면 보존
* Arrow navigation과 Enter/Space 동작 유지
* 색상만으로 stale, selected, sorted 상태 구분 금지
* `prefers-reduced-motion` 유지

# 성능

process row 수가 많을 수 있으므로 불필요한 rendering 비용을 만들지 않는다.

* render 중 반복적인 expensive aggregate 계산 금지
* summary와 presentation rows는 `useMemo` 또는 existing memoized controller path 활용
* 모든 row마다 새로운 heavy component tree 생성 지양
* CSS 기반 responsive 처리를 우선
* virtualization은 현재 요구사항과 테스트가 없다면 이번 단계에서 추가하지 않음
* filtering, sorting, grouping 알고리즘 의미 변경 금지

# 기능상 변경 금지

다음을 변경하지 마라.

* ProcessRowDto
* `listProcesses`
* `queryKeys.processes`
* React Query refetch 동작
* search semantics
* server/gpu exact pair filtering
* process kind filter
* stale filter
* Flat / Parent grouped / User grouped mode
* sorting semantics와 default direction
* visible process row grouping
* row key
* row keyboard navigation
* drawer open/close와 focus return
* sanitization과 formatter
* null/unknown 처리
* Electron IPC
* Rust backend
* polling scheduler
* database schema

process 종료, signal 전송, kill 버튼 등 write action을 추가하지 마라. 이 화면은 read-only다.

# 수정 범위

주요 수정 대상:

* `src/features/processes/ProcessTableScreen.tsx`
* `src/features/processes/ProcessTableToolbar.tsx`
* `src/features/processes/ProcessRowsTable.tsx`
* `src/features/processes/ProcessDetailDrawer.tsx`
* `src/features/processes/processTableModel.ts`
* `src/features/processes/useProcessTableController.ts`
* `src/features/processes/ProcessTableScreen.test.tsx`
* 필요하면 별도 model test
* `src/styles/tables.css`
* `src/styles/drawers.css`
* `src/styles/screens.css`

공통 Table 또는 Drawer primitive에 실제로 범용적인 개선이 필요하다면 제한적으로 수정할 수 있다.

Overview, Detail, History, Settings의 화면 구조는 이번 단계에서 재설계하지 마라.

# 테스트

기존 Process Table 테스트가 검증하는 동작을 약화하지 마라.

최소 검증:

* page identity
* initial loading
* query error
* no process rows
* filtered empty
* text search
* server filter
* GPU filter
* kind filter
* current/stale filter
* Flat mode
* Parent grouped mode
* User grouped mode
* filter reset
* default sorting
* sort direction toggle
* metric default descending sort
* section rows와 process count
* stale row 표시
* null metric은 unknown
* command sanitization
* row click으로 drawer 열기
* Enter/Space로 drawer 열기
* Arrow Up/Down row 이동
* drawer close 후 focus 복귀
* selected process가 filter로 사라질 때 drawer close
* refresh pending/success/error
* refresh 이후 row count
* full/compact density에서 table과 controls 유지

추가 검증:

* process summary aggregate
* table accessible label 또는 caption
* sticky header class 또는 의미 구조
* primary process identity rendering
* full command는 drawer에서 확인 가능
* stale 상태가 textual indicator를 가짐
* drawer section headings
* 긴 command와 UUID rendering
* filtered empty Reset action
* selected row state가 구현된 경우 접근성 상태
* 동일 server name / 다른 ID filter 정확성
* 동일 GPU index / 다른 UUID filter 정확성

구현 class 이름보다는 role, accessible name, visible text, focus와 사용자 동작을 우선한다.

# 실행할 검증

```bash
npm run test -- --run
npm run build
npm run electron:build
```

가능하면:

```bash
npm run electron:dev
```

# 수동 QA

다음 상태를 확인한다.

1. process 1~3개
2. process 수십 개
3. 여러 server와 GPU
4. 동일 server name, 다른 ID
5. 동일 GPU index, 다른 UUID
6. current/stale 혼합
7. null optional metrics
8. 매우 긴 command
9. 매우 긴 username/server name/GPU UUID
10. Flat mode
11. Parent grouped mode
12. User grouped mode
13. 여러 sort column
14. horizontal scroll
15. keyboard Arrow navigation
16. Enter/Space drawer open
17. drawer close focus return
18. refresh pending
19. refresh error with existing rows
20. no rows
21. filtered empty
22. full density
23. compact density
24. minimum window size

# 완료 기준

* Process Table이 spreadsheet가 아니라 고밀도 monitoring ledger처럼 보인다.
* process identity, context, GPU memory와 utilization을 빠르게 비교할 수 있다.
* 필터가 많아도 toolbar가 복잡한 form처럼 보이지 않는다.
* sticky header와 내부 horizontal scroll이 안정적으로 동작한다.
* grouped view가 일반 process row와 명확히 구분된다.
* stale row가 읽기 가능하면서도 분명하게 표시된다.
* drawer가 작은 card 모음이 아니라 구조화된 inspector처럼 보인다.
* keyboard navigation과 focus return이 유지된다.
* 기존 filtering, sorting, grouping, query 계약이 유지된다.
* backend와 DTO 변경이 없다.
* process write action이 추가되지 않는다.

# 완료 보고 형식

1. Process Table 정보 구조 변경
2. primary / secondary column 전략
3. toolbar와 advanced filter 구성
4. grouped view 표현
5. stale 및 selected row 표현
6. drawer inspector 구조
7. keyboard와 focus 보존 방식
8. responsive 및 density 처리
9. 수정 파일 목록
10. 테스트와 빌드 결과
11. 수동 QA 항목
12. Phase 6에 남길 작업

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라. 기존 Phase 1~4 변경을 되돌리지 말고 작업 범위를 벗어난 파일을 수정하지 마라.
