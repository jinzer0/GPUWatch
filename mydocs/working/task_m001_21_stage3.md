# Task #21 Stage 3 보고서

GitHub Issue: [#21](https://github.com/jinzer0/GPUWatch/issues/21)
구현계획서: [`task_m001_21_impl.md`](../plans/task_m001_21_impl.md)
Stage: 3

## 단계 목적

Process Table의 compact density, table overflow, empty/error/backend unavailable 상태, 접근성 기대값을 마무리했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/processes/ProcessTableScreen.tsx` | no rows, filtered empty, backend unavailable/error 상태를 Process Table 전용 상태 패널로 분리하고 sanitize된 메시지와 read-only 안내를 유지했다. |
| `src/features/processes/ProcessRowsTable.tsx` | 가로 overflow table region을 키보드 포커스 가능하게 만들고 scroll/read-only activation 안내를 연결했다. |
| `src/features/processes/ProcessTableScreen.test.tsx` | backend unavailable, no-process, filtered-empty 상태와 overflow region 접근성 기대값을 추가했다. |
| `src/features/processes/ProcessTableAccessibility.test.tsx` | 가로 scroll table region의 keyboard reachability와 설명 연결을 회귀 테스트로 고정했다. |
| `src/styles/tables.css` | Process Table 상태 패널, overflow focus ring, compact density table width/cell 폭 조정을 추가했다. |

## 본문 변경 정도 / 본문 무손실 여부

프론트엔드 표시 계층과 테스트 기대값 변경이다. Electron/Rust backend/helper contract, renderer API 호출, refresh 경로, 필터/정렬 데이터 처리, destructive process action 부재는 변경하지 않았다.

## 검증 결과

실행 명령:

```bash
git diff --check
npm run test -- --run src/features/processes/ProcessTableScreen.test.tsx src/features/processes/ProcessTableAccessibility.test.tsx
npm run build
```

결과:

- OK — `git diff --check` 통과.
- OK — Process Table screen/accessibility 테스트 34개 통과.
- OK — `npm run build` 통과.

## 잔여 위험

- 없음. Stage 3 범위의 UI polish와 검증을 완료했다.

## 다음 단계 영향

- Stage 3 구현 산출물 검증까지 완료했으며 커밋만 남아 있다.
