# Task #29 Stage 2 보고서 — GPU 카드·추가 지표·History UI 제거

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
마일스톤: M001
Stage: 2
상태: 구현·검증 및 Stage 2 산출물·단계 커밋 승인 완료, Stage 3 착수는 별도 승인 대기
작업 위치: `/Users/kjy/Desktop/Codes/projects/GPUWatch-task29`
브랜치: `local/task29`
승인된 구현계획서 exact SHA: `6a4f059a5961c86b398bfeeab285d7835a8632a3`

## 단계 목적

서버별 GPU를 제자리에서 독립적으로 펼치는 카드로 연결하고, 세 가지 공통 미터·프로세스 표·추가 지표로 기존 정보를 보존한다. History 화면·차트 조회·renderer 샘플 축적만 제거한다. 서버 메뉴·시트와 신뢰 가능한 가용 관측·알림 보존 변경은 다음 단계 범위다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/detail/GpuMetricMeter.tsx`, `GpuMetricMeter.test.tsx` | 20칸·2px 간격·8px 높이의 단색 분절 미터. 부분 채움, 원값 기반 구간·숫자·낮음/중간/높음 문구, null/비정상 백분율과 실제 0 구분. 온도는 채움 길이만 0–100으로 제한 |
| `DetailGpuCard.tsx` | GPU 식별·UTIL·정확한 VRAM 비율·온도 요약, 부모/추가 지표 독립 펼침, native toggle와 store 동기화. 프로세스·추가 지표·기존 알림 조작을 같은 카드 내부에 배치 |
| `DetailProcessList.tsx`, `DetailProcessList.test.tsx` | PID/사용자/전체 명령/VRAM의 읽기 전용 표. 키보드 포커스 가능한 내부 스크롤, 긴 명령 보존, 성공한 빈 목록과 수집 불가/부분 수집 구분 |
| `ServerDetailScreen.tsx`, `ServerDetailScreen.test.tsx` | 서버+UUID 우선/index 대체의 안정적인 React key. 미터 경계·정보 보존·polling/서버 이동/부모 접힘·진단·watch 회귀. History 요청이 없는 실제 경로 검증 |
| `useServerDetailController.ts`, `detailModel.ts` | History query·chart model·history invalidation·live sample 축적 제거. 실제 detail 조회·refresh·watch 실패/중복 저장 방지 유지 |
| `src/lib/store.ts`, `store.test.ts`, `src/components/Shell.tsx` | GPU별 세션 펼침 유지, 마지막 서버 ID만 저장. 사용하지 않는 live samples·density 상태와 Shell 연결 제거 |
| `src/lib/visibility.ts`, `visibility.test.ts` | 제거된 process 화면에 있던 서버+GPU+PID 식별 함수를 공유 visibility 경계로 이동. 기존 충돌/필터/정렬/그룹 검증 유지 |
| `src/test-utils/detail-fixtures.ts` | 화면 전용 history/session fixture 제거. 실제 helper API 검증용 `apiGpuHistory` DTO fixture 유지 |
| `src/index.css` | 라이트/다크 카드·미터·본문·표 스타일. 노랑 채움 `#F2D000`/`#FFE14A`, 숫자·구간 문구는 고대비 텍스트. 추가 지표는 장식 카드 대신 간결한 그룹별 텍스트 |
| `src/AGENTS.md` | 승인된 기존 위치에서 App/Shell 탐색·GPU 카드·전용 로컬 UI bridge 인덱스 정합화. no-install/보안 규칙 유지 |
| `src/features/overview`, `src/features/processes`, `src/features/history`의 화면 전용 파일 20개 | 사용하지 않는 화면·controller/model·해당 화면 전용 테스트 제거 |
| `DetailGpuHistorySection.tsx`, `src/lib/liveHistory.ts`, `liveHistory.test.ts` | renderer chart 표시·샘플 축적과 그 전용 테스트 제거 |
| `mydocs/orders/20261005.md`, 이 보고서 | 승인 SHA 확인·Stage 2 결과·후속 승인 경계 기록 |

추가 지표는 memory activity/free, power/limit/fan, 프로세스 수, UUID, encoder/decoder/JPEG/OFA, PCI/driver/clocks, PCIe RX/TX/gen/width, MIG current/pending/count와 topology/가용성 한계 안내를 보존한다. memory activity는 VRAM 용량 점유율과 별개다.

## 본문 변경 정도 / 본문 무손실 여부

- 수행/구현계획서와 최종 설계 입력 8개는 이번 제품 구현 중 변경하지 않았다. 승인 commit·HEAD·index·working-tree의 구현계획서 blob 일치를 확인했다.
- Rust core/helper·fixtures·Electron IPC/preload/helper 계약·package/lockfile 변경 없음. `list_gpu_history` 등 helper/API·DTO·DB 저장/retention은 유지했다.
- 6개 전용 테스트 파일은 더 이상 존재하지 않는 화면/차트/renderer 축적과 함께 제거했다. backend API 검증을 제거하거나 tests를 skip하지 않았다. 기존 watch·진단 회귀와 새 카드/미터/세션 동작 검증으로 UI 검증을 대체했다.
- 현재 가용 판정을 busy/free·프로세스 수로 만들어내지 않는다. 기존 watch 조작은 연결만 유지했으며 사용자 조건 재활성화·cooldown 보존을 이번 단계에서 해결했다고 주장하지 않는다.
- README·제품 smoke/demo 문서·배포용 smoke 스크립트는 계획대로 Stage 4에서 새 전체 여정에 맞춘다. 기존 화면을 전제로 하는 first-run smoke를 통과했다고 보고하지 않는다.

## 검증 결과

실행 명령:

```bash
npm run test -- --run src/features/detail/GpuMetricMeter.test.tsx src/features/detail/ServerDetailScreen.test.tsx src/features/detail/DetailProcessList.test.tsx src/lib/store.test.ts src/lib/api.test.ts
npm run test -- --run
npm run build
npm run electron:build
git diff --check
```

- focused: **5 files / 82 tests passed**.
- 전체 Vitest: **26 files / 349 tests passed**. Stage 1의 31 files/407 tests와 차이는 제거한 화면 전용 테스트 및 새 미터·카드 회귀의 교체다.
- renderer TypeScript/Vite, Electron TypeScript/CJS build, whitespace 검증 통과.
- UTIL/VRAM 0·30·30 초과·60·60 초과·100·비정상 값과 VRAM 총량 null/0/범위 밖 검증. 온도 60/80 양쪽 경계·100 초과·음수의 원값과 길이 clamp·null 검증.
- 여러 GPU·중첩 펼침·UUID/index·native toggle·새 polling snapshot·서버 이동·재실행 초기 접힘·긴 명령·unknown/0·MIG/PCIe/driver 정보 보존 검증.
- 없어진 화면 import/callsite·liveHistory/density 상태 참조 검색 결과 없음. `src/lib/api.test.ts`의 history helper bridge 요청/응답 검증 유지·통과.
- 프로젝트 formatter 설정·스크립트·의존성이 없어 별도 formatter를 설치하지 않았다. Rust 변경이 없어 Cargo tests/cargo fmt는 실행하지 않았다. 전체 Rust/CLI 저장 회귀는 Stage 4 통합 검증 범위다.

### 격리 dev Electron 확인

별도 HOME·SQLite·Electron userData와 실제 helper의 demo 데이터, 두 번째 disabled 서버를 사용했다. 앱에는 SSH 요청을 기록·차단하는 임시 guard를 연결했다. 배포용 smoke가 아닌 전용 임시 harness다.

| 시나리오 | 관측 |
|---|---|
| 최소 880×708 창 | document scrollWidth 880, 수평 overflow 없음 |
| 실제 demo GPU 2개 | 미터 총 6개, 최초 카드 접힘 |
| renderer CDP Enter/Space | GPU와 추가 지표 각각 펼침 성공 |
| 두 GPU 동시 펼침 | 다른 카드를 닫지 않고 2개 open 유지 |
| 부모 닫기/열기·서버 이동/복귀 | 추가 지표 open과 두 GPU의 세션 상태 유지 |
| 추가 지표 | 실제 표시 텍스트에서 20개 핵심 레이블 확인 |
| 라이트/다크 | renderer 캡처 직접 확인. dark CSS transition 완료 후 컨트롤 대비·추가 지표 확인 |
| History query | helper `list_gpu_history` 요청 0 |
| SSH | refresh_server/test_connection/poll_due_servers 요청 0 |
| 알림 | notification show 이벤트 0 |

최종 결과를 확인한 뒤 소유한 QA 프로세스 0개를 재확인하고 임시 HOME·DB·userData·guard·harness·캡처를 정리했다. 관측 결과와 영구 회귀 테스트는 보고서·소스에 남겼다.

초기 harness의 불완전 키 이벤트와 CSS text-transform 대소문자 비교를 보완했다. native toggle의 store 동기화 회귀를 추가했고, Testing Library에 없는 `fireEvent.toggle` 대신 실제 `Event('toggle')`를 사용해 최종 gates를 재실행했다. 실패를 숨기거나 테스트를 억제하지 않았다.

## 잔여 위험

- 키보드 확인은 실제 Electron renderer에 대한 CDP 입력이다. 물리 키보드·native macOS 입력·VoiceOver·실제 titlebar dragging을 검증한 것으로 확대하지 않는다.
- packaged 앱·live SSH·실제 OS 알림 권한/배너·실제 OS 테마 변경은 검증하지 않았다. demo 데이터는 실제 호스트 관측이 아니다.
- 긴 명령·수집 불가·null 지표·stale 정보는 unit/integration fixture로 검증했다. 실제 Electron smoke는 두 GPU demo의 카드/세션/레이아웃에 한정한다.
- 기존 watch 재활성화의 기본값 전송과 저장 시 cooldown/지속 관측 초기화 문제는 Stage 4에서 조건 보존·실효 최소 간격·재준비 규칙과 함께 수정한다.

## 다음 단계 영향

- Stage 3는 현재 기능을 유지한 sidebar 관리 진입을 `…`/`+` 메뉴·관리 시트로 대체한다. 새 경로 연결 전 기존 관리 form/controller를 지우지 않는다.
- Stage 4는 실제 backend 가용 DTO·watch 사용자 조건/cooldown 보존·읽기/저장 실패·권한 확인 불가 안내를 연결한다. 현재 낮음 미터나 processCount 0을 `사용 가능`으로 해석하지 않는다.
- disclosure key는 서버별 `uuid:<uuid>`를 우선하고 비어 있는 UUID에는 `index:<index>`를 사용한다. 새 데이터에서 동일 UUID의 index가 바뀌어도 펼침은 유지한다. 재실행에는 마지막 서버 ID만 복원한다.

## 승인 요청

같은 스레드의 `산출물·단계 커밋 승인`으로 아래 Stage 2 산출물·검증·미검증 항목과 묶음 커밋을 승인받았다. Stage 3 착수나 게시·병합·이슈 close 승인으로 확대하지 않는다.

- Stage 2 산출물·검증 결과와 명시한 미검증 항목 승인.
- `Task #29 Stage 2: GPU 카드와 추가 지표를 통합하고 History UI 제거`로 단계 산출물·보고서·오늘할일을 함께 커밋하는 것.

Stage 3 착수·후속 단계·push·PR·merge·issue close는 별도 승인 경계다. 최초 보고 시점에는 제품 변경을 staging/커밋하지 않았으며, 이번 승인에 따라 단계 산출물·보고서·오늘할일을 함께 커밋으로 기록한다.
