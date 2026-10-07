# Task #29 Stage 6.2 — 상세 재조회 실패 시 마지막 성공 화면 보존

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 6.2

## 단계 목적

Codex review `5449561295`, comment `4212998080`의 P2 대응. React Query refetch 실패 후 cache가 남아도 error 조기 반환 때문에 identity·health·마지막 snapshot이 사라지던 회귀를 수정한다. 같은 스레드의 재리뷰 대응 일괄 승인 범위에서 계획·수정·검증·단계 커밋을 진행한다. 원격 exact publication·merge·close·thread resolution 경계는 유지한다.

계획 commit `95b4fdc89714091c7c1af7ce5726c5eb67a87916`, blob `3518335d295ebe6b76e14ecbe679b305741ff681`. 제품 변경 전 계획서 단독 커밋·clean·현재 plan blob 일치를 확인했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/features/detail/ServerDetailScreen.tsx` | 캐시 없는 error만 전체 오류로 반환. cache가 있으면 마지막 성공 화면과 정제된 Detail diagnostic alert·stale 안내를 함께 표시 |
| `src/features/detail/ServerDetailScreen.test.tsx` | 실제 QueryClient refetch 실패·캐시 무변경·identity/health/snapshot/refresh 보존·가용 강조 해제·비밀정보 정제·성공 재조회 회복 검증 |
| `mydocs/orders/20261005.md` | 하위 단계 진행 기록 |
| `mydocs/working/task_m001_29_stage6.2.md` | 이 단계 보고 |

## 본문 변경 정도 / 본문 무손실 여부

controller의 실패 시 가용 unknown projection 및 query cache는 그대로다. 최초 loading/error·null/missing·선택 없음 계약을 유지한다. backend/API/DTO/DB·제품 문서·AGENTS·manual/skill은 변경하지 않았다.

## 검증 결과

수정 전 focused1 failed(47 filtered/skipped), exit1: 캐시가 존재하지만 화면 heading이 사라짐을 재현했다. 해당 필터 제외 테스트는 아래 전체 실행에서 모두 실행했다.

```bash
npm run test -- --run src/features/detail/ServerDetailScreen.test.tsx
npm run test -- --run
npm run build
npm run electron:build
git diff --check
```

수정 후 **5명령 모두 exit0**, detail48/전체27 files·424 tests, renderer/Electron build·diff check 통과. stale 캐시와 cache 없는 최초 오류, 오류 중 refresh 조작 가능, unknown 강조 해제와 성공 refetch 후 fresh identity/시각·available 강조 복귀를 검증한다. DOM에 token/key path가 남지 않는지 확인했다. tests/경고를 억제하지 않았다.

- 수정 전 `.omo/evidence/task-29-stage6.2-before.txt`, SHA-256 `ae83662bf8c8f198a31db6e103633dc2eb547ef2b2940ffc07ebb799e3630ad6`.
- 수정 후 `.omo/evidence/task-29-stage6.2-verification.txt`, SHA-256 `33b436f411c2d7e51dcf217d92d62262f5047c6179d8fd1de0d70d8d225655b8`.

## 잔여 위험

React Query와 화면 DOM 검증이며 live SSH·운영 DB·OS 물리 입력/알림 검증이 아니다. Rust/bridge/metric layout 변경이 없어 Cargo/packaging/smoke는 재실행하지 않았다. JS/TS formatter 설정이 없어 임의 formatter를 추가하지 않았다. 기존 unsigned/timeout 간헐성 한계는 그대로다.

## 다음 단계 영향

새 제품 commit의 수용 재검증 및 final report/evidence와 publication exact tuple을 결박한다. PR #30/devel·ancestor/exact lease·명시적 #29 참조·별도 exact-close 정책을 유지한다. 기존 승인 tuple을 재사용하지 않는다.

## 승인 요청

계획·수정·검증·단계 커밋은 일괄 승인 범위에서 진행한다. 새 exact final artifacts 및 publication은 별도로 결박하며 merge/close/thread resolution은 실행하지 않는다.
