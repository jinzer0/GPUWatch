# Task #29 Stage 6.1 — 프로세스 전체 명령의 비밀정보 가림 복구

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 6.1

## 단계 목적

Codex review `5449421556`, comment `4212876195`의 P1 대응. 전체 명령 표시에서 raw token/password/SSH key 경로가 cell text와 title에 노출되는 회귀를 기존 untruncated sanitizer 재사용으로 해결한다.

같은 스레드의 `codex 리뷰 대응 수정 일괄 승인 수정 커밋 푸시까지`에 따라 이번 보완 계획·구현·검증·단계 커밋을 진행했다. 계획 commit `23cd9574533badfff69acab03eafb9c68fe520ef`, blob `37cb5332992ceeaaceb35fdc03746b2367993cd1`. 계획 단일 경로·blob·제품 변경 전 clean을 확인했다. 일반 manual/skill 및 merge/close 승인은 변경하지 않는다. 원격 publication의 새 artifact/exact tuple 경계는 별도로 검증한다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/detail/DetailProcessList.tsx` | text와 title에 공유하는 command를 기존 `formatDrawerCommand`로 정제 |
| `src/features/detail/DetailProcessList.test.tsx` | raw token 노출 기대 제거; 1000자 이상 안전한 전체 명령·token/password/key path/key material의 text/title 가림 검증 |
| `src/features/detail/ServerDetailScreen.test.tsx` | 실제 detail 화면 경로에서 token/password/key path 노출 차단 및 안전한 tail 보존 검증 |
| `mydocs/orders/20261005.md` | 이번 리뷰 보완 진행 상태 |
| `mydocs/working/task_m001_29_stage6.1.md` | 이 하위 단계 기록 |

## 본문 변경 정도 / 본문 무손실 여부

전체 안전한 명령과 tail은 자르지 않는다. 기존 sanitizer의 개행 정제·비밀정보 가림을 재사용하며 새로운 regex/formatter 추상화를 추가하지 않았다. username/PID/unknown/실제0 및 API/DTO/저장 데이터는 그대로다. 제품 문서·AGENTS·manual·skill·설계 사본은 변경하지 않았다.

## 검증 결과

수정 전 focused **6 failed / 65 passed**, exit1. 기존 sanitizer 테스트는 통과했고 table과 detail 경로의 raw 비밀정보 노출 회귀를 재현했다.

```bash
npm run test -- --run src/features/detail/DetailProcessList.test.tsx src/features/detail/ServerDetailScreen.test.tsx src/lib/format.test.ts
npm run test -- --run
npm run build
npm run electron:build
git diff --check
```

수정 후 **5명령 모두 exit0**, focused **3 files / 71 passed**, 전체 **27 files / 424 passed**, renderer/Electron build 및 diff check 통과. DOM text·title·전체 HTML에 각 비밀 값이 남지 않는지 확인했다. 1000자 이상 명령은 정제된 전체 문자열과 일치한다. DOM 검증은 실제 OS/SSH/알림 성공 증거가 아니다. JS/TS formatter 설정이 없어 임의 formatter 설치/재포맷을 하지 않았다.

- 수정 전 `.omo/evidence/task-29-stage6.1-before.txt`, SHA-256 `4fea75b3ba2f31f4c3d658f7b1d660ac7bdd3224215a5b52311f214df3aa640d`.
- 수정 후 `.omo/evidence/task-29-stage6.1-verification.txt`, SHA-256 `b331daf21d9448a738966c4f8c3fbff1308dd3238b9b58bb802f611b9d8a714d`.

## 잔여 위험

기존 sanitizer의 지원 패턴을 복구한 것이며 임의 형식의 모든 비밀을 식별한다고 주장하지 않는다. Rust/bridge/레이아웃 변경이 없어 Cargo·packaging·OS 입력/VoiceOver·live SSH·실제 알림은 이번 하위 단계에서 재실행하지 않았다. 과거 helper timeout 간헐성 및 unsigned 한계는 유지한다. 댓글/review thread resolution·merge·close는 미실행이다.

## 다음 단계 영향

새 제품 commit 수용 재검증·최종 보고 갱신 및 새 exact publication 결박이 필요하다. 기존 tuple/원격 body hash를 새 게시에 재사용하지 않는다. PR #30/devel, ancestor+lease fast-forward 및 명시적 #29 참조/별도 exact-close 정책은 유지한다.

## 승인 요청

이 하위 단계의 수정·단계 커밋은 같은 스레드의 일괄 승인 범위에서 진행한다. 새 final report/evidence 및 publication exact tuple은 원격 mutation 전에 결박한다. merge/issue close는 별도 승인이다.
