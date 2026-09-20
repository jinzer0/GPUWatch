# 최종 보고서 템플릿

이 파일은 `mydocs/report/task_{milestone_slug}_{issue}_report.md` 작성용 중앙 템플릿이다. 최종 보고서는 모든 Stage의 결과, 수용 기준 검증, 남은 위험을 장기 보관용으로 정리하고, 보고서와 오늘할일 갱신 커밋 뒤 같은 스레드의 final report/evidence 승인을 받기 위한 문서다. 이 첫 승인은 private publication input 준비만 허용하며 원격 게시를 허용하지 않는다.

GitHub Issue: [#{issue}](https://github.com/jinzer0/GPUWatch/issues/{issue})
마일스톤: {milestone_name}

## 작업 요약

- 대상 이슈: #{issue}
- 마일스톤: {milestone_name}
- 단계 수: {N}
- 작업 목적: {한 줄 요약}

## 변경 파일 목록과 영향 범위

| 경로 | 변경 요약 | 영향 범위 |
|---|---|---|
| `{path}` | {변경 요약} | {영향 범위} |

## 문서 위치 검증

제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서를 생성, 이동, 수정했다면 수행계획서의 "문서 위치 판단"과 실제 산출물 위치가 일치하는지 검증한다. 해당 문서 변경이 없으면 `해당 없음`과 이유를 적는다.

| 파일 | 계획된 위치 | 실제 위치 | 결과 | 근거 |
|---|---|---|---|---|
| `{path 또는 해당 없음}` | `{path}` | `{path}` | OK/MISS | {수행계획서와 diff 기준 근거} |

## 변경 전·후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| {지표} | {값} | {값} |

적용할 정량 지표가 없으면 이 섹션에는 "해당 없음"과 이유를 적는다.

## 검증 결과

| 수용 기준 | 결과 |
|---|---|
| {기준} | OK/MISS — {근거} |

### 단계별 검증 결과

- Stage 1: {보고서 링크 또는 검증 요약}
- Stage 2: {보고서 링크 또는 검증 요약}
- Stage 3: {보고서 링크 또는 검증 요약}

## 잔여 위험과 후속 작업

### 잔여 위험

- {남은 위험. 없으면 `없음`으로 적는다.}

### 후속 작업 후보

- {후속 이슈 후보. 없으면 `없음`으로 적는다.}

## 커밋 후 승인 요청

- 이 보고서와 오늘할일 갱신은 regular, non-symlink, single-link, working-tree mode `0644`, index/commit mode `100644` 산출물로 검증한 뒤 정확히 두 파일만 커밋한다.
- 커밋 뒤 즉시 멈추고, final commit OID, 두 artifact blob OID, acceptance evidence SHA-256을 묶은 새 같은 스레드 final report/evidence 승인을 요청한다.
- 첫 승인 뒤 private title/body를 준비하고 read-only 원격 상태를 분류한 다음 다시 멈춘다. exact publication tuple에 대한 별도 두 번째 승인만 원격 mutation을 허용한다.
