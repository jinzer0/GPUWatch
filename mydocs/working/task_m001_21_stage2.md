# Task #21 Stage 2 보고서

GitHub Issue: [#21](https://github.com/jinzer0/GPUWatch/issues/21)
구현계획서: [`task_m001_21_impl.md`](../plans/task_m001_21_impl.md)
Stage: 2

## 단계 목적

Process Table의 toolbar, 행 표현, 상세 drawer를 GPU Activity Monitor 방향으로 정리했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/processes/ProcessTableScreen.tsx` | 화면 설명 문구를 GPU Activity Monitor 목적에 맞게 조정했다. |
| `src/features/processes/ProcessTableToolbar.tsx` | visible row 수, 활성 filter 수, view mode, 현재 scope chip을 toolbar 상단 요약으로 표시했다. |
| `src/features/processes/ProcessRowsTable.tsx` | process 행에 activity status data 속성과 badge wrapper/title을 추가해 current/stale 표현을 명확히 했다. |
| `src/features/processes/ProcessDetailDrawer.tsx` | drawer 상단을 선택된 Process Table row와 연결된 GPU activity 요약으로 바꿨다. |
| `src/features/processes/ProcessTableAccessibility.test.tsx` | Stage 1에서 바뀐 row aria-label 기준을 접근성 회귀 테스트에 반영했다. |
| `src/styles/tables.css` | toolbar scope summary/chip, compact density, current/stale row 및 badge 표현 스타일을 추가했다. |

## 본문 변경 정도 / 본문 무손실 여부

프론트엔드 표시 계층 변경이다. Electron/Rust backend/helper contract, renderer API 호출, 필터/정렬 데이터 처리, destructive process action 부재는 변경하지 않았다.

## 검증 결과

실행 명령:

```bash
git diff --check
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
```

결과:

- OK — `git diff --check` 통과.
- OK — Process Table screen/accessibility 테스트 33개 통과.

## 잔여 위험

- 없음. Stage 3에서 상태별 UI와 통합 build 검증을 이어간다.

## 다음 단계 영향

- Stage 3에서 table overflow, compact density, empty/error/backend-unavailable 상태를 이어서 확인한다.
