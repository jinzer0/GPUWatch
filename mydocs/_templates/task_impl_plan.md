# 구현계획서 템플릿

이 파일은 `mydocs/plans/task_{milestone_slug}_{issue}_impl.md` 작성용 중앙 템플릿이다. 허용된 Scope를 Stage별 산출물과 검증으로 정리한다. 기존 BMAD 계획이 있으면 참조하여 중복 작성하지 않는다. Stage 수에 최소값은 없으며 필요한 Stage만 남긴다. 승인 기준은 [`공통 정책`](../manual/agent_code_hyperfall_rule_conflict.md)을 따른다.

수행계획서: [`task_{milestone_slug}_{issue}.md`](task_{milestone_slug}_{issue}.md)
GitHub Issue: [#{issue}](https://github.com/jinzer0/GPUWatch/issues/{issue})
마일스톤: {milestone_name}

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | {제목} | `{path}` | `{검증 요약}` |
| 2 | {제목} | `{path}` | `{검증 요약}` |
| 3 | {제목} | `{path}` | `{검증 요약}` |

## 문서 위치 확인

수행계획서의 "문서 위치 판단"과 실제 Stage 산출물 경로가 일치하는지 확인한다. 문서 생성/이동/수정이 없으면 `해당 없음`과 이유를 적는다.

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| `{path 또는 해당 없음}` | `{path}` | `{path}` | OK/MISS | {불일치 시 위치 판단 보정; HIGH/Scope 변경만 승인} |

## Stage 1 — {제목}

### 산출물

신규:

- `{path}`

수정:

- `{path}`

### 변경 내용

- {구체적으로 무엇을 만들거나 고칠지 적는다.}

### 검증

```bash
{검증 명령}
git diff --check
```

### 커밋

```text
Task #{issue} Stage 1: {핵심 내용 요약}
```

## Stage 2 — {제목}

### 산출물

- `{path}`

### 변경 내용

- {구체적으로 무엇을 만들거나 고칠지 적는다.}

### 검증

```bash
{검증 명령}
git diff --check
```

### 커밋

```text
Task #{issue} Stage 2: {핵심 내용 요약}
```

## Stage 3 — {제목}

### 산출물

- `{path}`

### 변경 내용

- {구체적으로 무엇을 만들거나 고칠지 적는다.}

### 검증

```bash
{검증 명령}
git diff --check
```

### 커밋

```text
Task #{issue} Stage 3: {핵심 내용 요약}
```

## 검증

- 각 Stage 검증 명령은 단계 보고서 작성 전에 실행한다.
- 실패한 검증은 단계 완료로 처리하지 않는다.
- Scope 내 계획/문서 위치 변경은 기존 계획의 판단 근거를 갱신하고 자동 진행한다.
- HIGH 결정 또는 Scope 확장만 명시 승인받고 안전한 독립 작업은 계속한다.

## 커밋

- Commit은 명시 요청된 경우에만 수행한다. 계획 commit은 일반 구현의 선행 승인 조건이 아니다.
- 구현계획서 커밋에는 저장소가 요구하는 Sisyphus attribution 두 줄을 포함한다.
- 단계 커밋은 단계 산출물과 `mydocs/working/task_{milestone_slug}_{issue}_stage{N}.md`를 함께 묶는다.
- 커밋 메시지는 `Task #{issue} Stage {N}: {핵심 내용 요약}` 형식을 따른다.

## 단계 의존성

- Stage 2는 Stage 1의 산출물 확정 후 진행한다.
- Stage 3은 Stage 2의 검증과 Evidence 기록 후 자동 진행한다.

## 위험과 대응

- **{리스크 이름}**: {대응}

## 위험 결정과 Checkpoint

- {위험 수준·허용된 Scope·수용 기준·필요한 HIGH 결정/승인 또는 해당 없음}
- 계획·Stage 진입/전환·검증·기록은 응답 대기 없는 Checkpoint다.
