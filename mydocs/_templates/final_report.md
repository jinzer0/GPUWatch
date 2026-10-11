# 최종 보고서 템플릿

이 파일은 `mydocs/report/task_{milestone_slug}_{issue}_report.md` 작성용 중앙 템플릿이다. 최종 보고서는 Stage 결과, 수용 기준 검증, 남은 위험과 handoff 컨텍스트를 장기 보관용으로 정리하는 non-blocking Evidence Checkpoint다. 공통 정책은 [`agent_code_hyperfall_rule_conflict.md`](../manual/agent_code_hyperfall_rule_conflict.md)를 따른다. 별도 final report/evidence Human 승인 없이 안전한 private publication input 준비와 read-only 원격 분류를 진행하며 원격 게시는 exact publication tuple에 대한 Human 승인 뒤에만 수행한다.

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

- Stage {N}: {실제 실행 단위의 보고서 링크 또는 검증 요약. 단계 수는 동적이며 최소 수 없음}

## 잔여 위험과 후속 작업

### 잔여 위험

- {남은 위험. 없으면 `없음`으로 적는다.}

### 후속 작업 후보

- {후속 이슈 후보. 없으면 `없음`으로 적는다.}

## Evidence Checkpoint와 publication 승인 경계

- Commit은 명시 요청된 경우에만 수행한다. 해당 경로에서는 이 보고서와 오늘할일 갱신을 regular, non-symlink, single-link, working-tree mode `0644`, index/commit mode `100644` 산출물로 검증한 뒤 정확히 두 파일만 커밋한다. commit 요청이 없으면 안전한 검증·기록·handoff를 계속하고 publication에 필요한 commit은 미실행으로 남긴다.
- final commit OID, exact artifact paths와 두 blob OID, acceptance evidence source/path와 SHA-256을 내부 Evidence Checkpoint로 캡처·재검증한다. 별도 Human 응답을 기다리지 않는다.
- 검증된 commit 컨텍스트에서 private title/body와 read-only 원격 상태 분류를 자동 준비한다. 원격 mutation 직전에 exact publication tuple의 같은 스레드 Human 승인을 요청한다. tuple의 identity/ref/OID/blob/path/hash 검증과 merge/release/현재 OPEN 이슈 close 보호는 그대로 유지한다.
