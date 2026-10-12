# Task #20 구현계획서 — Overview를 GPU Activity dashboard로 전환

수행계획서: [`task_m001_20.md`](task_m001_20.md)
GitHub Issue: [#20](https://github.com/jinzer0/GPUWatch/issues/20)
마일스톤: M001

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | Overview KPI 모델 정리 | `src/features/overview/overviewModel.ts`, `src/features/overview/overviewModel.test.ts` | `npm run test -- --run src/features/overview/overviewModel.test.ts` |
| 2 | Overview 화면 재구성 | `src/features/overview/OverviewScreen.tsx`, `src/features/overview/OverviewServerCard.tsx`, `src/features/overview/OverviewScreen.test.tsx` | `npm run test -- --run src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts` |
| 3 | 상태/스타일 검증 | `src/styles/screens.css`, overview screen/model tests | `npm run test -- --run src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts` |

## 문서 위치 확인

수행계획서의 문서 위치 판단과 일치한다. 제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않고, 단계 보고서는 내부 작업 산출물로 `mydocs/working/`에 둔다.

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| `mydocs/working/task_m001_20_stage{N}.md` | `mydocs/working/` | `mydocs/working/task_m001_20_stage{N}.md` | OK | 단계별 내부 작업 보고서 |
| `mydocs/report/task_m001_20_report.md` | `mydocs/report/` | `mydocs/report/task_m001_20_report.md` | OK | 최종 보고서 |

## Stage 1 — Overview KPI 모델 정리

### 산출물

수정:

- `src/features/overview/overviewModel.ts`, `src/features/overview/overviewModel.test.ts`
- `mydocs/working/task_m001_20_stage1.md`

### 변경 내용

- 현재 `ServerOverviewDto`에서 계산 가능한 GPU activity summary를 정의한다. total/busy/free GPU, attention hosts, active process 의미를 테스트로 고정하고 unknown/null을 0으로 오인하지 않는다.

### 검증

```bash
npm run test -- --run src/features/overview/overviewModel.test.ts
git diff --check
```

### 커밋

```text
Task #20 Stage 1: Overview GPU activity 모델 정리
```

## Stage 2 — Overview 화면 재구성

### 산출물

수정:

- `src/features/overview/OverviewScreen.tsx`, `src/features/overview/OverviewServerCard.tsx`, `src/features/overview/OverviewScreen.test.tsx`
- `mydocs/working/task_m001_20_stage2.md`

### 변경 내용

- Overview header와 KPI row를 GPU Activity dashboard 방향으로 재배치한다. 서버 카드의 GPU/프로세스/주의 상태 스캔성을 높이고 기존 filter, seed demo, empty/error/loading 상태를 유지한다.

### 검증

```bash
npm run test -- --run src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts
git diff --check
```

### 커밋

```text
Task #20 Stage 2: Overview GPU activity 화면 구성
```

## Stage 3 — 상태/스타일 검증

### 산출물

수정:

- `src/styles/screens.css`, overview screen/model tests
- `mydocs/working/task_m001_20_stage3.md`

### 변경 내용

- Overview dashboard 레이아웃과 responsive spacing을 정리한다. filtered-empty, no-data, backend unavailable 계열 문구가 유지되는지 확인하고 build로 통합 검증한다.

### 검증

```bash
npm run test -- --run src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts
npm run build
git diff --check
```

### 커밋

```text
Task #20 Stage 3: Overview 상태와 스타일 마무리
```

## 검증

- 각 Stage 검증 명령은 단계 보고서 작성 전에 실행한다.
- 실패한 검증은 단계 완료로 처리하지 않는다.
- 계획 변경이 필요하면 구현계획서를 먼저 갱신하고 작업지시자 승인을 받는다.
- 문서 위치가 수행계획서 판단과 달라지면 구현 전에 수행계획서 또는 구현계획서를 갱신하고 작업지시자 승인을 받는다.

## 커밋

- 본 문서가 승인되면 Stage 1 시작 전에 `Task #20: 승인된 구현 계획서 확정` 독립 커밋으로 기록한다.
- 승인된 구현계획서 커밋에는 저장소가 요구하는 Sisyphus attribution 두 줄을 포함한다.
- 단계 커밋은 단계 산출물과 `mydocs/working/task_m001_20_stage{N}.md`를 함께 묶는다.
- 커밋 메시지는 `Task #20 Stage {N}: {핵심 내용 요약}` 형식을 따른다.

## 단계 의존성

- Stage 2는 Stage 1의 산출물 확정 후 진행한다.
- Stage 3은 Stage 2의 검증과 보고서 승인 후 진행한다.

## 위험과 대응

- **DTO 한계**: 전력/온도처럼 현재 DTO에 없는 값은 새 backend 변경 없이 표시하지 않는다.
- **대시보드 과확장**: dashboard builder/변수/annotation 같은 Grafana식 설정 기능은 제외한다.

## 승인 요청 사항

- Stage 1~3 분할, 산출물, 검증 명령, 커밋 메시지 승인 및 승인 후 `Task #20: 승인된 구현 계획서 확정` 독립 커밋 진행 승인.
- 승인 전에는 구현 코드와 스타일 파일을 수정하지 않는다.
