# Task #21 Stage 1 보고서

GitHub Issue: [#21](https://github.com/jinzer0/GPUWatch/issues/21)
구현계획서: [`task_m001_21_impl.md`](../plans/task_m001_21_impl.md)
Stage: 1

## 단계 목적

Process Table의 root-cause reading order를 GPU, PID, User, Process, GPU %, VRAM 중심으로 고정했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/processes/processTableModel.ts` | root-cause column labels와 row summary helper를 추가했다. |
| `src/features/processes/ProcessRowsTable.tsx` | table column order와 row aria-label을 GPU 사용 원인 분석 흐름으로 조정했다. |
| `src/features/processes/ProcessTableScreen.test.tsx` | 새 column label/order와 row label 기대값을 반영했다. |

## 본문 변경 정도 / 본문 무손실 여부

코드 작업이다. 외부 API, Electron/Rust backend contract, 저장 데이터 의미는 변경하지 않았다. Stage 1 범위의 UI/model/test 의미만 조정했다.

## 검증 결과

실행 명령:

```bash
git diff --check
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx
```

결과:

- OK — ProcessTableScreen.test.tsx 31개 테스트 통과, diff whitespace check 통과.

## 잔여 위험

- 없음. Stage 2에서 화면 구성/상태 표현을 이어서 다룬다.

## 다음 단계 영향

- Stage 2에서 toolbar/table/drawer UI 표현과 접근성 테스트를 이어서 개선한다.

## 승인 요청

- Stage 1 산출물과 검증 결과를 승인하면 다음 단계로 진행한다.
