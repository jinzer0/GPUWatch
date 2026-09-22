# Task #21 최종 보고서 — Process Table을 GPU 사용 현황 핵심 화면으로 승격

GitHub Issue: [#21](https://github.com/jinzer0/GPUWatch/issues/21)
마일스톤: M001

## 작업 요약

- 대상 이슈: #21
- 마일스톤: M001
- 단계 수: 3
- 작업 목적: Process Table을 GPU 사용 원인 분석 중심 화면으로 재구성하고 compact/overflow/state/accessibility polish를 완료했다.

## 변경 파일 목록과 영향 범위

| 경로 | 변경 요약 | 영향 범위 |
|---|---|---|
| `src/features/processes/processTableModel.ts` | root-cause column label과 row summary helper를 추가했다. | Process model |
| `src/features/processes/ProcessRowsTable.tsx` | GPU/PID/User/Process/GPU%/VRAM 우선 column order와 accessible row/overflow region을 구현했다. | Process table |
| `src/features/processes/ProcessTableScreen.tsx` | 상태 패널과 read-only 안내를 Process Table 전용으로 정리했다. | Process screen |
| `src/features/processes/ProcessTableToolbar.tsx` | toolbar summary와 scope chip을 추가했다. | Process toolbar |
| `src/features/processes/ProcessDetailDrawer.tsx` | drawer 상단 GPU activity 요약을 추가했다. | Process drawer |
| `src/features/processes/ProcessTableScreen.test.tsx` | column/order/state/overflow 테스트를 갱신했다. | Process screen test |
| `src/features/processes/ProcessTableAccessibility.test.tsx` | row selected state와 overflow region 접근성을 고정했다. | Process accessibility test |
| `src/styles/tables.css` | toolbar chip, row status, overflow, compact density, state panel 스타일을 추가했다. | Process CSS |
| `mydocs/working/task_m001_21_stage1.md` | Stage 1 결과 기록 | 작업 산출물 |
| `mydocs/working/task_m001_21_stage2.md` | Stage 2 결과 기록 | 작업 산출물 |
| `mydocs/working/task_m001_21_stage3.md` | Stage 3 결과 기록 | 작업 산출물 |

## 문서 위치 검증

제품/사용자/기여자/외부 통합/API/아키텍처/로드맵 문서는 생성, 이동, 수정하지 않았다. 수행계획서에서 정한 내부 작업 산출물 위치와 실제 산출물 위치가 일치한다.

| 파일 | 계획된 위치 | 실제 위치 | 결과 | 근거 |
|---|---|---|---|---|
| `mydocs/working/task_m001_21_stage{N}.md` | `mydocs/working/` | `mydocs/working/` | OK | Stage 1~3 보고서가 모두 해당 위치에 생성됐다. |
| `mydocs/report/task_m001_21_report.md` | `mydocs/report/` | `mydocs/report/` | OK | 최종 보고서를 해당 위치에 작성했다. |

## 변경 전·후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| Process focused tests | 31 passed | 34 passed |
| Build | 미실행 | passed |

## 검증 결과

| 수용 기준 | 결과 |
|---|---|
| GPU 점유 원인을 빠르게 식별할 수 있다. | OK — GPU/PID/User/Process/GPU%/VRAM 우선 column order와 root-cause row summary를 구현했다. |
| process row/table 표현이 compact하면서도 접근성을 유지한다. | OK — compact density/overflow region/focus 설명과 accessibility tests를 추가했다. |
| plain Vite/backend unavailable 경계와 기존 error/empty 상태가 유지된다. | OK — backend unavailable, no-process, filtered-empty 상태 테스트를 추가했다. |
| destructive process action을 추가하지 않는다. | OK — drawer/action 영역은 read-only 안내와 상세 확인만 유지한다. |

### 단계별 검증 결과

- Stage 1: ProcessTableScreen.test.tsx 31 passed, `git diff --check` 통과
- Stage 2: Process Table screen/accessibility tests 33 passed, `git diff --check` 통과
- Stage 3: Process Table screen/accessibility tests 34 passed, `npm run build` 통과, `git diff --check` 통과

### 최종 수용 기준 검증

실행 명령:

```bash
git diff --check
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
npm run build
```

결과:

- OK — Process Table screen/accessibility tests 34 passed, build passed, diff check passed.

## 잔여 위험과 후속 작업

### 잔여 위험

- 없음.

### 후속 작업 후보

- 없음.

## 커밋 후 승인 요청

- 이 보고서와 오늘할일 갱신은 regular, non-symlink, single-link, working-tree mode `0644`, index/commit mode `100644` 산출물로 검증한 뒤 정확히 두 파일만 커밋한다.
- 커밋 뒤 즉시 멈추고, final commit OID, 두 artifact blob OID, acceptance evidence SHA-256을 묶은 새 같은 스레드 final report/evidence 승인을 요청한다.
- 첫 승인 뒤 private title/body를 준비하고 read-only 원격 상태를 분류한 다음 다시 멈춘다. exact publication tuple에 대한 별도 두 번째 승인만 원격 mutation을 허용한다.
