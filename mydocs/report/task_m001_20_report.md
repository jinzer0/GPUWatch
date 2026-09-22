# Task #20 최종 보고서 — Overview를 GPU Activity dashboard로 전환

GitHub Issue: [#20](https://github.com/jinzer0/GPUWatch/issues/20)
마일스톤: M001

## 작업 요약

- 대상 이슈: #20
- 마일스톤: M001
- 단계 수: 3
- 작업 목적: Overview를 GPU Activity dashboard 첫 화면으로 전환하고 현재 DTO 기반 GPU activity summary를 UI에 반영했다.

## 변경 파일 목록과 영향 범위

| 경로 | 변경 요약 | 영향 범위 |
|---|---|---|
| `src/features/overview/overviewModel.ts` | GPU activity known/unknown, attentionHosts, nullable aggregate semantics를 추가했다. | Overview model |
| `src/features/overview/overviewModel.test.ts` | known/unknown GPU summary와 attention host 테스트를 추가했다. | Overview model test |
| `src/features/overview/OverviewScreen.tsx` | GPU Activity dashboard header/KPI row와 unknown/active process 문구를 구성했다. | Overview screen |
| `src/features/overview/OverviewServerCard.tsx` | 서버 카드 activity band와 unknown GPU 문구를 추가했다. | Overview card |
| `src/features/overview/OverviewScreen.test.tsx` | dashboard KPI, state preservation, unknown copy 테스트를 갱신했다. | Overview screen test |
| `src/styles/screens.css` | Overview KPI/card responsive/compact spacing을 정리했다. | Overview CSS |
| `mydocs/working/task_m001_20_stage1.md` | Stage 1 결과 기록 | 작업 산출물 |
| `mydocs/working/task_m001_20_stage2.md` | Stage 2 결과 기록 | 작업 산출물 |
| `mydocs/working/task_m001_20_stage3.md` | Stage 3 결과 기록 | 작업 산출물 |

## 문서 위치 검증

제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않았다. 수행계획서에서 정한 내부 작업 산출물 위치와 실제 산출물 위치가 일치한다.

| 파일 | 계획된 위치 | 실제 위치 | 결과 | 근거 |
|---|---|---|---|---|
| `mydocs/working/task_m001_20_stage{N}.md` | `mydocs/working/` | `mydocs/working/` | OK | Stage 1~3 보고서가 모두 해당 위치에 생성됐다. |
| `mydocs/report/task_m001_20_report.md` | `mydocs/report/` | `mydocs/report/` | OK | 최종 보고서를 해당 위치에 작성했다. |

## 변경 전·후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| Overview focused tests | 기존 6 passed | 31 passed |
| Build | 미실행 | passed |

## 검증 결과

| 수용 기준 | 결과 |
|---|---|
| Overview에서 GPU 상태와 사용 현황이 서버 수보다 우선적으로 읽힌다. | OK — GPU activity summary KPI와 server activity band를 추가했다. |
| 현재 DTO에서 계산 가능한 값만 사용하며 unknown/null 의미를 보존한다. | OK — unknown GPU host가 섞이면 GPU aggregate를 `null`로 유지하고 tests로 고정했다. |
| no-data/loading/error/filtered-empty 상태가 깨지지 않는다. | OK — OverviewScreen 테스트에서 상태 분기를 보존했다. |

### 단계별 검증 결과

- Stage 1: overviewModel.test.ts 8 passed, `git diff --check` 통과
- Stage 2: Overview screen/model tests 29 passed, `git diff --check` 통과
- Stage 3: Overview screen/model tests 31 passed, `npm run build` 통과, `git diff --check` 통과

### 최종 수용 기준 검증

실행 명령:

```bash
git diff --check
npm run test -- --run src/features/overview/OverviewScreen.test.tsx src/features/overview/overviewModel.test.ts
npm run build
```

결과:

- OK — Overview screen/model tests 31 passed, build passed, diff check passed.

## 잔여 위험과 후속 작업

### 잔여 위험

- 없음.

### 후속 작업 후보

- 없음.

## 커밋 후 승인 요청

- 이 보고서와 오늘할일 갱신은 regular, non-symlink, single-link, working-tree mode `0644`, index/commit mode `100644` 산출물로 검증한 뒤 정확히 두 파일만 커밋한다.
- 커밋 뒤 즉시 멈추고, final commit OID, 두 artifact blob OID, acceptance evidence SHA-256을 묶은 새 같은 스레드 final report/evidence 승인을 요청한다.
- 첫 승인 뒤 private title/body를 준비하고 read-only 원격 상태를 분류한 다음 다시 멈춘다. exact publication tuple에 대한 별도 두 번째 승인만 원격 mutation을 허용한다.
