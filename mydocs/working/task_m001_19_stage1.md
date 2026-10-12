# Task #19 Stage 1 보고서

GitHub Issue: [#19](https://github.com/jinzer0/GPUWatch/issues/19)
구현계획서: [`task_m001_19_impl.md`](../plans/task_m001_19_impl.md)
Stage: 1

## 단계 목적

Shell IA의 기본 label/order와 density control 명칭을 GPU Activity Monitor 작업 흐름에 맞춰 고정했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/components/Shell.tsx` | Sidebar tab labels/order와 density control aria label을 정리했다. |
| `src/components/Shell.test.tsx` | 새 tab label/order, active aria-current, density control 기대값을 고정했다. |

## 본문 변경 정도 / 본문 무손실 여부

코드 작업이다. 외부 API, Electron/Rust backend contract, 저장 데이터 의미는 변경하지 않았다. Stage 1 범위의 UI/model/test 의미만 조정했다.

## 검증 결과

실행 명령:

```bash
git diff --check
npm run test -- --run src/components/Shell.test.tsx
```

결과:

- OK — Shell.test.tsx 9개 테스트 통과, diff whitespace check 통과.

## 잔여 위험

- 없음. Stage 2에서 화면 구성/상태 표현을 이어서 다룬다.

## 다음 단계 영향

- Stage 2에서 기존 overview prop 범위 안에서 titlebar/toolbar 상태 표현을 개선한다.

## 승인 요청

- Stage 1 산출물과 검증 결과를 승인하면 다음 단계로 진행한다.
