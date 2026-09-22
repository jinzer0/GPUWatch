# Task #19 Stage 2 보고서

GitHub Issue: [#19](https://github.com/jinzer0/GPUWatch/issues/19)
구현계획서: [`task_m001_19_impl.md`](../plans/task_m001_19_impl.md)
Stage: 2

## 단계 목적

상단 titlebar/toolbar의 상태 표현을 기존 Shell 입력과 런타임 식별 정보 안에서 분리해, 현재 page title과 fleet/online/runtime 상태가 한눈에 보이도록 개선했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/components/Shell.tsx` | Page title 영역에 화면 맥락을 추가하고, fleet count/online count/runtime 상태를 별도 status item으로 분리했다. |
| `src/styles/layout.css` | Titlebar heading과 status item pill 스타일을 추가해 상단 상태 표현 밀도를 정리했다. |
| `src/components/Shell.test.tsx` | 기존 tab/density 동작 기대값을 유지하면서 runtime fallback/backend 식별 표시와 titlebar 맥락 표시를 고정했다. |
| `mydocs/working/task_m001_19_stage2.md` | Stage 2 변경 내용과 검증 결과을 기록했다. |

## 본문 변경 정도 / 본문 무손실 여부

코드 작업이다. Shell public props는 변경하지 않았고, Electron/Rust backend/helper contract와 DTO 의미도 변경하지 않았다. Runtime 표시는 기존 preload 노출 여부만 읽어 `Desktop backend` 또는 `Browser fallback`으로 식별한다.

## 검증 결과

실행 명령:

```bash
git diff --check
npm run test -- --run src/components/Shell.test.tsx
```

결과:

- OK — `git diff --check` 통과.
- OK — `Shell.test.tsx` 10개 테스트 통과.

## 잔여 위험

- Runtime 표시는 preload metadata와 `window.gpuwatcher` 존재 여부에 의존하므로 실제 Electron/브라우저 화면에서 문구와 폭을 Stage 3에서 확인한다.

## 다음 단계 영향

- Runtime 표시는 preload metadata와 `window.gpuwatcher` 존재 여부에 의존하므로 실제 Electron/브라우저 화면에서 문구와 폭을 Stage 3에서 확인한다.

## 승인 요청

- Stage 2 산출물과 검증 결과를 승인하면 다음 단계로 진행한다.
