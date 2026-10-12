# Task #19 구현계획서 — Shell 내비게이션과 상단 툴바 디자인 리팩토링

수행계획서: [`task_m001_19.md`](task_m001_19.md)
GitHub Issue: [#19](https://github.com/jinzer0/GPUWatch/issues/19)
마일스톤: M001

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | Shell IA 고정 | `src/components/Shell.tsx`, `src/components/Shell.test.tsx` | `npm run test -- --run src/components/Shell.test.tsx` |
| 2 | Toolbar 상태 표현 구현 | `src/components/Shell.tsx`, `src/styles/layout.css`, `src/components/Shell.test.tsx` | `npm run test -- --run src/components/Shell.test.tsx` |
| 3 | 스타일/밀도/접근성 정리 | `src/styles/layout.css`, `src/components/Shell.tsx`, `src/components/Shell.test.tsx` | `npm run test -- --run src/components/Shell.test.tsx` |

## 문서 위치 확인

수행계획서의 문서 위치 판단과 일치한다. 제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않고, 단계 보고서는 내부 작업 산출물로 `mydocs/working/`에 둔다.

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| `mydocs/working/task_m001_19_stage{N}.md` | `mydocs/working/` | `mydocs/working/task_m001_19_stage{N}.md` | OK | 단계별 내부 작업 보고서 |
| `mydocs/report/task_m001_19_report.md` | `mydocs/report/` | `mydocs/report/task_m001_19_report.md` | OK | 최종 보고서 |

## Stage 1 — Shell IA 고정

### 산출물

수정:

- `src/components/Shell.tsx`, `src/components/Shell.test.tsx`
- `mydocs/working/task_m001_19_stage1.md`

### 변경 내용

- Sidebar label/order, tab title mapping, active state, density control 위치를 GPU Activity Monitor 작업 흐름 기준으로 확정한다. Shell 테스트의 navigation label, aria-current, density control 기대값을 새 IA에 맞춘다.

### 검증

```bash
npm run test -- --run src/components/Shell.test.tsx
git diff --check
```

### 커밋

```text
Task #19 Stage 1: Shell IA 정리
```

## Stage 2 — Toolbar 상태 표현 구현

### 산출물

수정:

- `src/components/Shell.tsx`, `src/styles/layout.css`, `src/components/Shell.test.tsx`
- `mydocs/working/task_m001_19_stage2.md`

### 변경 내용

- 상단 titlebar/toolbar를 page title, fleet count, online count, backend/fallback 식별 가능 상태로 분리한다. 새 helper/backend contract 없이 기존 `overview` 입력과 store 상태만 사용한다.

### 검증

```bash
npm run test -- --run src/components/Shell.test.tsx
git diff --check
```

### 커밋

```text
Task #19 Stage 2: 상단 툴바 상태 표현 개선
```

## Stage 3 — 스타일/밀도/접근성 정리

### 산출물

수정:

- `src/styles/layout.css`, `src/components/Shell.tsx`, `src/components/Shell.test.tsx`
- `mydocs/working/task_m001_19_stage3.md`

### 변경 내용

- Full/Compact density에서 sidebar, toolbar, content spacing이 깨지지 않도록 CSS를 정리한다. focus ring, button labels, aria-label을 유지하고 build로 타입/번들 경계를 확인한다.

### 검증

```bash
npm run test -- --run src/components/Shell.test.tsx
npm run build
git diff --check
```

### 커밋

```text
Task #19 Stage 3: Shell 스타일과 접근성 마무리
```

## 검증

- 각 Stage 검증 명령은 단계 보고서 작성 전에 실행한다.
- 실패한 검증은 단계 완료로 처리하지 않는다.
- 계획 변경이 필요하면 구현계획서를 먼저 갱신하고 작업지시자 승인을 받는다.
- 문서 위치가 수행계획서 판단과 달라지면 구현 전에 수행계획서 또는 구현계획서를 갱신하고 작업지시자 승인을 받는다.

## 커밋

- 본 문서가 승인되면 Stage 1 시작 전에 `Task #19: 승인된 구현 계획서 확정` 독립 커밋으로 기록한다.
- 승인된 구현계획서 커밋에는 저장소가 요구하는 Sisyphus attribution 두 줄을 포함한다.
- 단계 커밋은 단계 산출물과 `mydocs/working/task_m001_19_stage{N}.md`를 함께 묶는다.
- 커밋 메시지는 `Task #19 Stage {N}: {핵심 내용 요약}` 형식을 따른다.

## 단계 의존성

- Stage 2는 Stage 1의 산출물 확정 후 진행한다.
- Stage 3은 Stage 2의 검증과 보고서 승인 후 진행한다.

## 위험과 대응

- **공통 Shell 충돌**: Overview/Process 병렬 작업과 공유 API가 충돌하지 않도록 Shell props 변경을 최소화하고 기존 `overview` 입력을 유지한다.
- **상태 과대표현**: backend 상태를 새 계약으로 만들지 않고 현재 관찰 가능한 overview/fallback 상태만 표시한다.

## 승인 요청 사항

- Stage 1~3 분할, 산출물, 검증 명령, 커밋 메시지 승인 및 승인 후 `Task #19: 승인된 구현 계획서 확정` 독립 커밋 진행 승인.
- 승인 전에는 구현 코드와 스타일 파일을 수정하지 않는다.
