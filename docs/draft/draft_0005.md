# GPUWatcher Phase 4: Monitoring Workspace 리팩토링

GPUWatcher의 `Server Detail`과 `Live Monitor` 화면을 하나의 일관된 모니터링 경험으로 리팩토링해라.

Phase 1에서 macOS Native Frame과 Full-bleed Console shell이 구현되었고, Phase 2에서 공통 디자인 시스템이 정리되었다. Phase 3에서는 Overview를 기준 화면으로 완성했다.

이번 단계의 목표는 특정 서버를 선택한 뒤 현재 상태와 시간 흐름을 자연스럽게 탐색할 수 있는 desktop monitoring workspace를 만드는 것이다.

백엔드, DTO, IPC, polling 동작을 변경하는 작업이 아니다.

## 작업 전 확인

아래 파일과 관련 테스트를 먼저 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `src/features/detail/ServerDetailScreen.tsx`
* `src/features/detail/DetailGpuCard.tsx`
* `src/features/detail/DetailGpuHistorySection.tsx`
* `src/features/detail/DetailProcessList.tsx`
* `src/features/detail/detailModel.ts`
* `src/features/detail/useServerDetailController.ts`
* `src/features/detail/ServerDetailScreen.test.tsx`
* `src/features/history/HistoryMonitorScreen.tsx`
* `src/features/history/HistoryControls.tsx`
* `src/features/history/HistoryCharts.tsx`
* `src/features/history/historyModel.ts`
* `src/features/history/useHistoryMonitorController.ts`
* `src/features/history/HistoryMonitorScreen.test.tsx`
* `src/components/ui/MiniLineChart.tsx`
* `src/components/ui/TimeSeriesChart.tsx`
* `src/components/ui/chartTypes.ts`
* `src/styles/charts.css`
* `src/styles/screens.css`
* Phase 1~3에서 정리된 shell, 디자인 토큰, 공통 UI 컴포넌트

현재 작업 트리의 디자인 시스템과 Overview 패턴을 유지한다.

## 핵심 목표

사용자가 특정 서버를 선택했을 때 다음 질문에 빠르게 답할 수 있어야 한다.

1. 서버가 현재 정상인가?
2. 마지막 정상 수집은 언제인가?
3. GPU별 현재 utilization, memory, temperature 상태는 어떠한가?
4. 어느 GPU가 가장 바쁜가?
5. 어떤 프로세스가 GPU 자원을 사용 중인가?
6. 최근 metric이 증가하거나 감소하고 있는가?
7. 수집 데이터에 gap 또는 unknown 값이 있는가?

## 화면 관계

`Server Detail`과 `Live Monitor`는 서로 다른 제품처럼 보여서는 안 된다.

두 화면은 다음 요소를 공유하는 시각 문법을 사용한다.

* server context
* server identity와 health
* current GPU identity
* metric labels와 값
* timestamp 표현
* status 및 diagnostic 표현
* chart container
* loading, error, empty state
* density와 responsive 규칙

필요하면 범용 컴포넌트를 추출할 수 있다.

예:

* `ServerContextHeader`
* `MonitoringSection`
* `MetricStat`
* `GpuIdentity`
* `ChartPanel`

단, 단지 JSX 몇 줄을 줄이기 위한 성급한 추상화는 하지 마라. 두 화면에서 실제로 같은 의미와 동작을 공유할 때만 추출한다.

# Server Detail

## 1. Page header

기존 server name, status, host 정보, refresh action을 유지한다.

권장 구조:

```text
Server Detail

Training Rig                     [degraded]       [Refresh]
alice@train.local:22
Last success 2 minutes ago · Poll every 30s
```

조건:

* page header를 큰 floating card로 감싸지 않는다
* server name이 primary heading
* connection identity는 secondary metadata
* health status가 server name과 명확히 연결
* Refresh 버튼 accessible name에 server name 포함
* refresh pending 중 server context와 기존 metric을 숨기지 않음
* refresh feedback은 header 바로 아래 또는 관련 context 안에 bounded 형태로 표시
* 기존 query invalidation과 mutation 동작 변경 금지

## 2. Server health summary

서버 전체 상태를 compact summary strip으로 표현한다.

현재 DTO에 존재하는 정보만 사용한다.

가능한 항목:

* Status
* GPU count
* Busy / free
* Last success
* Poll interval
* Latest diagnostic

같은 정보를 header, summary, GPU card에 반복하지 않는다.

오류가 있을 때:

* server 전체를 빨간색 카드로 만들지 않는다
* status와 diagnostic 영역으로 의미를 제한
* error type, message, guidance 중복 표시 금지
* sanitization과 path redaction 유지

## 3. GPU 목록

GPU마다 거대한 독립 dashboard card를 만드는 대신 console section 또는 compact GPU panel 형태로 정리한다.

권장 계층:

```text
GPU 0 · NVIDIA RTX 5090                         UUID...
84% utilization    18.2 / 32 GB    72°C    310 W

[ utilization sparkline ] [ memory sparkline ]

Processes
python  PID 4812  12.4 GB
python  PID 8871   4.1 GB
```

GPU identity는 다음 값을 가능한 범위에서 표시한다.

* GPU index
* model/name
* UUID
* MIG 상태 또는 identity
* current state

표시할 주요 metrics는 DTO에 실제로 존재하는 값만 사용한다.

우선순위:

* GPU utilization
* memory used / total 또는 memory percentage
* temperature
* power
* fan
* PCIe 또는 기타 optional metric

모든 optional metric을 동일한 중요도로 보여주지 않는다.

unknown과 null은 기존 formatter를 사용해 `unknown`으로 표시한다. 누락 값을 0으로 바꾸지 않는다.

## 4. Metric hierarchy

GPU metric은 세 단계로 구분한다.

### Primary

항상 중요한 현재 상태:

* utilization
* memory
* temperature

### Secondary

값이 존재할 때 유용한 정보:

* power
* fan
* PCIe
* clock 또는 기타 optional metric

### Diagnostic / capability

지원하지 않거나 수집되지 않은 정보:

* unavailable
* unsupported
* collection warning

각 metric을 중첩된 카드로 만들지 않는다.

추천 표현:

* stat cells
* definition grid
* 얇은 vertical separator
* border 없는 compact metric row

## 5. GPU history section

Detail 화면 안의 history는 현재 GPU를 빠르게 이해하기 위한 작은 trend view다.

* 기존 history query와 range semantics 유지
* utilization과 memory trend를 우선
* 모든 metric을 한 차트에 겹쳐 가독성을 떨어뜨리지 않는다
* 서로 다른 단위를 같은 Y축에 섞지 않는다
* sample gap은 실제 gap으로 유지
* null sample을 0으로 연결하지 않는다
* 데이터가 부족하면 명확한 empty state
* chart legend와 latest value를 함께 제공할 수 있음
* Live Monitor로 이동하는 기존 경로가 있다면 유지
* 존재하지 않는 routing API를 새로 만들지 않는다

## 6. Process list

GPU별 프로세스 목록은 card 안의 작은 테이블 또는 compact list로 표현한다.

최소 정보:

* process name
* PID
* user
* GPU memory
* utilization 정보가 존재하면 표시

조건:

* process가 많아져도 GPU card 전체 구조가 무너지지 않음
* 긴 command/process name 처리
* unknown 값을 0으로 표현하지 않음
* process row 전체를 불필요한 카드로 만들지 않음
* 데이터가 없을 때 “0 usage”가 아니라 명확한 no-process 상태
* 기존 process grouping 또는 DTO 의미 변경 금지

# Live Monitor

## 1. Page header

`Stored GPU history`의 의미를 유지하되 현재 선택 context를 더 명확히 표시한다.

권장 구성:

```text
Live Monitor
Stored GPU history

Server [ Training Rig ▾ ]  GPU [ GPU 0 ▾ ]  Range [ 1h ▾ ]
Last sample 14:32:10 · 120 samples
```

Page header와 control toolbar를 분리해도 되지만, 과도한 surface 중첩을 만들지 않는다.

## 2. Context controls

현재 controller가 지원하는 선택과 동작을 모두 유지한다.

* server selection
* GPU selection
* time range
* metric toggles
* refresh 관련 동작
* selectedServerId 동기화

조건:

* server → GPU → range 순서의 계층이 명확
* search나 select를 불필요하게 큰 form field로 만들지 않음
* 좁은 폭에서 자연스럽게 wrap
* compact density 지원
* 현재 선택값이 존재하지 않을 때 안전한 fallback
* disabled control의 이유가 시각적으로 이해 가능
* context 변경 시 기존 React Query key와 캐시 의미 유지

## 3. Metric toggle

현재 metric toggle 기능을 유지하되 switch board처럼 복잡해 보이지 않게 한다.

추천 방식:

* compact segmented buttons
* checkbox chips
* small toggle rows

조건:

* 선택 여부를 색상만으로 표현하지 않음
* 최소 하나의 metric이 필요한 기존 규칙이 있다면 유지
* 숨겨진 metric은 legend에서도 제거
* 단위가 다른 metric을 무리하게 하나의 chart에 합치지 않음

## 4. Chart organization

metric을 의미에 따라 그룹화한다.

권장 chart groups:

### Utilization

* GPU utilization
* memory utilization
* encoder/decoder utilization이 존재할 경우 별도 또는 secondary

### Memory

* used memory
* total memory가 필요하면 reference
* percentage와 absolute value를 같은 축에 섞지 않음

### Thermal / power

* temperature
* power
* fan은 단위에 따라 별도 chart 또는 분리된 series

모든 그룹을 반드시 만들 필요는 없다. 현재 DTO와 controller가 제공하는 metric만 사용한다.

chart panel은 다음 정보를 가져야 한다.

* 명확한 제목
* 단위
* 현재 또는 latest value
* legend
* time range
* empty / loading / error 상태

## 5. Chart integrity

데이터를 더 예쁘게 보이게 하기 위해 사실을 왜곡하지 마라.

* null은 0이 아님
* sample gap은 이어 그리지 않음
* polling interval보다 긴 gap은 시각적으로 분리
* timestamps 순서 보존
* 임의 보간 금지
* 유효하지 않은 숫자 무시
* Y축 범위가 metric 의미를 왜곡하지 않게 함
* percentage는 원칙적으로 0~100 범위
* temperature와 power에 percentage 범위 사용 금지
* sample 수가 적으면 과도한 trend 해석을 유도하지 않음

현재 `TimeSeriesChart`의 gap detection과 null 처리 로직을 보존한다.

## 6. Empty and degraded states

다음을 서로 구분한다.

* server가 선택되지 않음
* 선택된 server에 GPU가 없음
* GPU가 선택되지 않음
* history sample이 없음
* 일부 metric만 unavailable
* 전체 query error
* backend unavailable
* loading

화면 header와 선택 context는 오류가 발생해도 유지한다.

전체 화면을 generic ErrorState 하나로 대체하지 않는다.

# Shared visual language

## Section structure

각 section은 다음 구조를 권장한다.

```text
Section title                         Optional metadata/action
Short supporting description

Section content
```

* section마다 큰 card title을 반복하지 않음
* panel 안에 panel을 여러 단계 중첩하지 않음
* separator와 spacing으로 계층 표현
* 중요 action만 button으로 강조
* chart와 table은 필요한 경우 surface 사용

## Density

full / compact 모드를 모두 지원한다.

다음 값은 디자인 토큰 또는 component variable로 제어한다.

* section gap
* card padding
* metric gap
* chart height
* process row height
* toolbar control height

compact 모드에서 정보를 제거하지 말고 간격과 크기만 줄인다.

## Responsive

최소 창 크기에서도 다음이 보여야 한다.

* server name과 status
* Refresh action
* primary GPU metrics
* chart controls
* chart title과 latest value

조건:

* 긴 hostname과 UUID가 horizontal overflow를 유발하지 않음
* metric grid가 적절히 wrap
* chart canvas가 부모 폭을 넘지 않음
* process list가 page 전체 폭을 밀지 않음
* shell content 영역만 스크롤되는 구조 유지

# 접근성

* heading hierarchy 유지
* server header에 명확한 `h2`
* GPU section에 `h3`
* chart에 유용한 aria label
* control label과 select 연결 유지
* metric toggle은 pressed/checked 상태 노출
* loading은 status live region
* error는 alert
* 여러 Refresh 버튼이 있을 경우 server 또는 GPU identity 포함
* 색상만으로 metric series와 status를 구분하지 않음
* keyboard focus-visible 유지
* reduced motion 유지

# 기능상 변경 금지

다음을 변경하지 마라.

* Detail 및 history DTO
* React Query key
* server refresh mutation
* query invalidation 범위
* selectedServerId 상태
* selected GPU 상태
* history range semantics
* metric toggle semantics
* scheduler와 polling
* preload 및 IPC
* Rust backend
* database schema
* null/unknown formatter
* diagnostic formatter와 sanitization
* browser fallback

새 backend action이나 renderer bridge를 만들지 마라.

# 수정 범위

주요 수정 대상:

* `src/features/detail/ServerDetailScreen.tsx`
* `src/features/detail/DetailGpuCard.tsx`
* `src/features/detail/DetailGpuHistorySection.tsx`
* `src/features/detail/DetailProcessList.tsx`
* `src/features/detail/detailModel.ts`
* `src/features/detail/ServerDetailScreen.test.tsx`
* `src/features/history/HistoryMonitorScreen.tsx`
* `src/features/history/HistoryControls.tsx`
* `src/features/history/HistoryCharts.tsx`
* `src/features/history/historyModel.ts`
* `src/features/history/HistoryMonitorScreen.test.tsx`
* 필요한 범위의 chart tests
* `src/styles/screens.css`
* `src/styles/charts.css`

공통 패턴이 명확하다면 제한적으로 공통 component 파일을 추가할 수 있다.

Overview, Process Table, Settings의 레이아웃을 이번 작업에서 재설계하지 마라.

# 테스트

기존 테스트의 행동 계약을 유지한다.

Detail 최소 검증:

* no selected server
* loading
* API error
* server identity와 status
* nullable metric은 unknown
* GPU 목록
* GPU별 process 목록
* GPU history query
* history empty state
* refresh pending/success/error
* query invalidation
* diagnostic sanitization
* full/compact density에서 콘텐츠 유지

History 최소 검증:

* static screen identity
* server selection
* selectedServerId 반영
* GPU selection
* range 변경
* metric toggle
* query key 유지
* loading/error/empty state
* null sample 및 gap 처리
* chart label과 series
* sample ordering
* unavailable metric
* backend unavailable
* full/compact density에서 controls와 chart 유지

추가 검증:

* Refresh accessible name에 server name 포함
* GPU section heading hierarchy
* process가 없는 GPU의 empty state
* 서로 다른 단위가 잘못된 chart series로 합쳐지지 않음
* error 상태에서도 context controls 유지
* 긴 hostname, UUID, process name이 렌더링됨

구현 class 문자열보다 role, accessible name, visible text와 사용자 동작을 우선한다.

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

수동 QA:

1. online server with multiple GPUs
2. stale server
3. server error with diagnostic
4. null optional metrics
5. GPU with many processes
6. GPU with no processes
7. history with dense samples
8. history with gaps
9. history with one sample
10. no history
11. loading
12. backend error
13. refresh pending/success/failure
14. full density
15. compact density
16. minimum window size

# 완료 기준

* Detail과 Live Monitor가 같은 monitoring product처럼 보인다.
* 서버 identity와 현재 health가 즉시 이해된다.
* GPU별 primary metric이 한눈에 들어온다.
* secondary metric이 primary metric을 방해하지 않는다.
* process와 history가 현재 GPU context에 명확히 연결된다.
* chart가 null과 sample gap을 정직하게 표현한다.
* surface 중첩과 불필요한 card 수가 줄어든다.
* 기존 기능, query contract, sanitization이 유지된다.
* backend와 DTO 변경이 없다.

# 완료 보고

1. Detail 정보 구조 변경
2. Live Monitor 정보 구조 변경
3. 공유하거나 재사용한 monitoring 패턴
4. chart grouping과 단위 처리
5. null, gap, error 표현 방식
6. responsive 및 density 처리
7. 접근성 개선
8. 수정한 파일
9. 테스트와 빌드 결과
10. Phase 5에 남길 작업

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라. 기존 Phase 1~3 변경을 되돌리지 말고 작업 범위를 벗어난 파일을 수정하지 마라.
