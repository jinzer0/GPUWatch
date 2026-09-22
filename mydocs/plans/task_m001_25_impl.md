# Task #25 구현계획서 — 디자인 리팩토링 통합 검증

수행계획서: [`task_m001_25.md`](task_m001_25.md)
GitHub Issue: [#25](https://github.com/jinzer0/GPUWatch/issues/25)
마일스톤: M001

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | 통합 테스트와 빌드 검증 | focused UI tests, build 결과, `mydocs/working/task_m001_25_stage1.md` | `npm run test -- --run ...`, `npm run build` |
| 2 | 브라우저/스모크 QA | Vite browser QA 또는 smoke subset 결과, `mydocs/working/task_m001_25_stage2.md` | 대표 viewport/density/browser state 확인 |
| 3 | 회귀 정리와 최종 검증 | 필요한 수정 또는 후속 후보, `mydocs/working/task_m001_25_stage3.md` | 수정별 focused test, `git diff --check` |

## 문서 위치 확인

수행계획서의 문서 위치 판단과 일치한다. 제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않는다.

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| `mydocs/working/task_m001_25_stage{N}.md` | `mydocs/working/` | `mydocs/working/task_m001_25_stage{N}.md` | OK | 단계별 내부 작업 보고서 |
| `mydocs/report/task_m001_25_report.md` | `mydocs/report/` | `mydocs/report/task_m001_25_report.md` | OK | 최종 보고서 |

## Stage 1 — 통합 테스트와 빌드 검증

### 산출물

신규:

- `mydocs/working/task_m001_25_stage1.md`

수정:

- 발견된 회귀가 있으면 해당 source/test 파일

### 변경 내용

- `origin/devel` 통합 상태에서 Shell, Overview, Process Table focused tests를 실행한다.
- `npm run build`로 TypeScript/Vite 통합 빌드를 확인한다.
- 실패가 있으면 원인을 기록하고, 범위 내 작은 회귀만 수정한다.

### 검증

```bash
npm run test -- --run src/components/Shell.test.tsx src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
npm run build
git diff --check
```

### 커밋

```text
Task #25 Stage 1: 통합 테스트와 빌드 검증
```

## Stage 2 — 브라우저/스모크 QA

### 산출물

- `mydocs/working/task_m001_25_stage2.md`
- 필요한 경우 smoke/browser QA 관련 회귀 수정 파일

### 변경 내용

- Vite browser QA 또는 Electron smoke subset으로 navigation label, overview/process visible layout, full/compact density를 확인한다.
- 대표 viewport에서 horizontal overflow, blank 화면, backend fallback 문구를 확인한다.
- smoke selector 불일치가 있으면 범위 내 수정한다.

### 검증

```bash
npm run dev -- --host 127.0.0.1
# Browser QA: Fleet/Processes/History navigation, Overview and Process Table at representative full/compact viewports
git diff --check
```

### 커밋

```text
Task #25 Stage 2: 브라우저 QA와 스모크 확인
```

## Stage 3 — 회귀 정리와 최종 검증

### 산출물

- `mydocs/working/task_m001_25_stage3.md`
- 필요한 경우 후속 이슈 후보 기록 또는 범위 내 회귀 수정

### 변경 내용

- Stage 1~2에서 발견된 작은 회귀를 정리하거나 후속 이슈 후보로 분리한다.
- 최종 focused tests/build/diff check를 재실행한다.
- 최종 보고서 작성 전 worktree clean 상태를 만든다.

### 검증

```bash
npm run test -- --run src/components/Shell.test.tsx src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
npm run build
git diff --check
```

### 커밋

```text
Task #25 Stage 3: 통합 검증 정리
```

## 검증

- 각 Stage 검증 명령은 단계 보고서 작성 전에 실행한다.
- 실패한 검증은 단계 완료로 처리하지 않는다.
- 계획 변경이 필요하면 구현계획서를 먼저 갱신하고 작업지시자 승인을 받는다.
- 문서 위치가 수행계획서 판단과 달라지면 구현 전에 수행계획서 또는 구현계획서를 갱신하고 작업지시자 승인을 받는다.

## 커밋

- 본 문서가 승인되면 Stage 1 시작 전에 `Task #25: 승인된 구현 계획서 확정` 독립 커밋으로 기록한다.
- 승인된 구현계획서 커밋에는 저장소가 요구하는 Sisyphus attribution 두 줄을 포함한다.
- 단계 커밋은 단계 산출물과 `mydocs/working/task_m001_25_stage{N}.md`를 함께 묶는다.
- 커밋 메시지는 `Task #25 Stage {N}: {핵심 내용 요약}` 형식을 따른다.

## 단계 의존성

- Stage 2는 Stage 1의 통합 테스트/빌드 결과 확정 후 진행한다.
- Stage 3은 Stage 2의 browser/smoke QA 결과 확정 후 진행한다.

## 위험과 대응

- **GUI QA 환경 의존성**: Electron smoke가 환경 의존적으로 실패하면 Vite browser QA와 한계를 보고하고, Electron 전용 문제는 후속 이슈로 분리한다.
- **범위 확장**: PR #22-#24 범위를 넘는 개선은 직접 구현하지 않고 후속 작업 후보로 기록한다.

## 승인 요청 사항

- Stage 1~3 분할, 산출물, 검증 명령, 커밋 메시지 승인.
- 승인 후 본 구현계획서를 독립 커밋하고 Stage 1에 진입하는 것에 대한 승인 요청.
