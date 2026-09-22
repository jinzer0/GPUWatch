# Task #21 구현계획서 — Process Table을 GPU 사용 현황 핵심 화면으로 승격

수행계획서: [`task_m001_21.md`](task_m001_21.md)
GitHub Issue: [#21](https://github.com/jinzer0/GPUWatch/issues/21)
마일스톤: M001

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | Process 정보 계층 고정 | `src/features/processes/processTableModel.ts`, `src/features/processes/ProcessRowsTable.tsx`, process tests | `npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx` |
| 2 | Table/toolbar/drawer UI 구현 | `src/features/processes/ProcessTableScreen.tsx`, `src/features/processes/ProcessTableToolbar.tsx`, `src/features/processes/ProcessRowsTable.tsx`, `src/features/processes/ProcessDetailDrawer.tsx` | `npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx` |
| 3 | 상태/스타일 검증 | `src/styles/tables.css`, process screen/accessibility tests | `npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx` |

## 문서 위치 확인

수행계획서의 문서 위치 판단과 일치한다. 제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않고, 단계 보고서는 내부 작업 산출물로 `mydocs/working/`에 둔다.

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| `mydocs/working/task_m001_21_stage{N}.md` | `mydocs/working/` | `mydocs/working/task_m001_21_stage{N}.md` | OK | 단계별 내부 작업 보고서 |
| `mydocs/report/task_m001_21_report.md` | `mydocs/report/` | `mydocs/report/task_m001_21_report.md` | OK | 최종 보고서 |

## Stage 1 — Process 정보 계층 고정

### 산출물

수정:

- `src/features/processes/processTableModel.ts`, `src/features/processes/ProcessRowsTable.tsx`, process tests
- `mydocs/working/task_m001_21_stage1.md`

### 변경 내용

- GPU 사용 원인 분석에 필요한 우선 컬럼과 row summary를 정리한다. GPU, PID, User, Process, GPU %, VRAM의 읽기 흐름과 sort/filter 기대값을 테스트로 고정한다.

### 검증

```bash
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx
git diff --check
```

### 커밋

```text
Task #21 Stage 1: Process Table 정보 계층 정리
```

## Stage 2 — Table/toolbar/drawer UI 구현

### 산출물

수정:

- `src/features/processes/ProcessTableScreen.tsx`, `src/features/processes/ProcessTableToolbar.tsx`, `src/features/processes/ProcessRowsTable.tsx`, `src/features/processes/ProcessDetailDrawer.tsx`
- `mydocs/working/task_m001_21_stage2.md`

### 변경 내용

- Toolbar 필터 요약, table row 밀도, status/badge 표현, detail drawer 연계를 GPU Activity Monitor 방향으로 개선한다. destructive process action은 추가하지 않는다.

### 검증

```bash
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
git diff --check
```

### 커밋

```text
Task #21 Stage 2: Process Table 화면과 상세 개선
```

## Stage 3 — 상태/스타일 검증

### 산출물

수정:

- `src/styles/tables.css`, process screen/accessibility tests
- `mydocs/working/task_m001_21_stage3.md`

### 변경 내용

- Compact density와 table overflow, empty/error/backend unavailable 상태를 정리한다. accessibility test와 build로 table semantics와 통합 타입을 확인한다.

### 검증

```bash
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
npm run build
git diff --check
```

### 커밋

```text
Task #21 Stage 3: Process Table 상태와 스타일 마무리
```

## 검증

- 각 Stage 검증 명령은 단계 보고서 작성 전에 실행한다.
- 실패한 검증은 단계 완료로 처리하지 않는다.
- 계획 변경이 필요하면 구현계획서를 먼저 갱신하고 작업지시자 승인을 받는다.
- 문서 위치가 수행계획서 판단과 달라지면 구현 전에 수행계획서 또는 구현계획서를 갱신하고 작업지시자 승인을 받는다.

## 커밋

- 본 문서가 승인되면 Stage 1 시작 전에 `Task #21: 승인된 구현 계획서 확정` 독립 커밋으로 기록한다.
- 승인된 구현계획서 커밋에는 저장소가 요구하는 Sisyphus attribution 두 줄을 포함한다.
- 단계 커밋은 단계 산출물과 `mydocs/working/task_m001_21_stage{N}.md`를 함께 묶는다.
- 커밋 메시지는 `Task #21 Stage {N}: {핵심 내용 요약}` 형식을 따른다.

## 단계 의존성

- Stage 2는 Stage 1의 산출물 확정 후 진행한다.
- Stage 3은 Stage 2의 검증과 보고서 승인 후 진행한다.

## 위험과 대응

- **테이블 과밀**: 핵심 컬럼 우선 + drawer 상세로 분산해 한 행에 모든 정보를 밀어 넣지 않는다.
- **위험 액션 추가**: kill/process control은 제외하고 조회/정렬/필터/상세 확인만 개선한다.

## 승인 요청 사항

- Stage 1~3 분할, 산출물, 검증 명령, 커밋 메시지 승인 및 승인 후 `Task #21: 승인된 구현 계획서 확정` 독립 커밋 진행 승인.
- 승인 전에는 구현 코드와 스타일 파일을 수정하지 않는다.
