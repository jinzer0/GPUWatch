# Task #29 Stage 6 — 반복 enabled 요청의 관측 보존

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 6
상태: 로컬 구현·검증 완료, 단계 산출물 커밋 승인 대기

## 단계 목적

PR #30 Codex 재리뷰 `5437422548`, comment `4202873637`의 P2 대응. 같은 enabled 값을 반복 요청할 때 서버 revision·health와 GPU 관측·watch 지속 구간이 초기화되는 문제를 해결한다.

작업지시자의 같은 스레드 일괄 승인은 이번 Stage 6의 계획서 단독 커밋·생성 SHA 결박·구현·검증에만 적용했다. 일반 승인 절차를 바꾸지 않았으며 산출물 커밋·최종 보고·게시·리뷰 답변·merge·close 승인으로 확대하지 않았다.

계획 커밋 `3486d08e2646e8f41d2560a6c85dffcc89d7929a`, parent `4321fa1afe2d9fcf2dfeeb54f4e02c4a2ec9cbc6`, plan blob `f55e0f7159785aaab89671fc8db2dc3733a9557d`, tree `2c07bf036f9bad8704bfc6430215e23cd064bf63`. 계획서 단일 경로·100644·blob·parent·tree·attribution·clean을 검증했다. Python subprocess를 통해 commit-tree와 exact old OID의 no-deref update-ref transaction(start/prepare/commit)을 실행했다. 설치된 shell fence 자체를 실행한 것으로 표현하지 않는다. 구현과 통합 검증 전에 해당 SHA의 ancestor 및 HEAD/index/working tree plan blob 일치를 확인했다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `crates/gpuwatcher-core/src/repository/servers.rs` | Immediate transaction 안에서 최신 서버를 읽고 동등 enabled면 SQL UPDATE/reset 없이 반환 |
| `crates/gpuwatcher-core/tests/storage/repository_server_contract.rs` | true/false 반복 record·health·revision 보존, 진행 중 poll 완료, 실제 전환, WAL writer 이후 최신 상태 비교 3개 회귀 |
| `crates/gpuwatcher-core/tests/gpu_availability.rs` | 기존 save 보존 회귀에 반복 enabled 분기 추가, 관측·watch sustain/cooldown/armed·snapshot·health 보존과 지속 조건 완료 검증 |
| `mydocs/orders/20261005.md` | 재리뷰 대응 진행·검증 및 미승인 경계 기록 |
| `mydocs/working/task_m001_29_stage6.md` | 이 단계의 근거·검증·한계 |

## 본문 변경 정도 / 본문 무손실 여부

API/DTO/DB schema와 callsite는 변경하지 않았다. 동등 enabled 요청만 no-op으로 수정하고 실제 on/off 전환의 revision/reset/idle·disabled 및 없는 서버 오류 계약은 유지한다. 기존 실제 전환 실패 rollback·관측 초기화 테스트를 그대로 실행했다. UI·제품 문서·manual·skill·최종 보고서는 변경하지 않았다.

## 검증 결과

수정 전 새 회귀: storage 1 passed/2 failed, availability 1 failed. 두 명령 모두 exit101이며 revision 변경과 동시 writer 이후 추가 revision 증가를 재현했다.

실행 명령:

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state server_enabled
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability repeated_enabled
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test storage_read_model_state
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml --test gpu_availability
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml --all -- --check
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
git diff --check
```

- 수정 후 9명령 모두 exit0. focused storage3/availability1, 전체 storage49/availability18 통과.
- core **151 passed**(lib59 + availability18 + parser20 + SSH config5 + storage49), 기존 live SSH **2 ignored**.
- helper CLI **25 passed**, Vitest **27 files / 420 passed**. tests/경고 억제 없음.
- Rust formatter를 합쳐진 변경에 한 번 적용하고 format check를 통과했다.
- 수정 전 evidence: `.omo/evidence/task-29-stage6-before.txt`, SHA-256 `48ec5eabb99646ebbc2cc8c93b1181435669b3c897b116925afd52375cafc833`.
- 수정 후 evidence: `.omo/evidence/task-29-stage6-verification.txt`, SHA-256 `170bfca1f2bf9e14059e4c0bf650335128e9d3226a3ef758c5a98ca4e48de15c`.
- 첫 회귀 파일 적용 시 shell에 apply_patch가 없어 적용 실패했다. 그때 실행된 두 focused 명령은 각각 **0 tests**였으며 회귀 근거/성공으로 세지 않는다. 파일 재확인 후 Edit 도구로 실제 회귀를 추가하고 위 수정 전 실패 및 수정 후 성공을 확인했다.

## 잔여 위험

- renderer/Electron 변경이 없어 build/packaging/UI smoke는 이번 단계에서 재실행하지 않았다. live SSH·실제 OS 입력/알림·운영 DB도 사용하지 않았다. 기존 unsigned 및 CDP 한계는 그대로다.
- PR #30은 아직 기존 final OID `4321fa1afe2d9fcf2dfeeb54f4e02c4a2ec9cbc6`이다. 이번 수정은 원격 미게시, 리뷰 답변·thread resolution 미실행이다.
- main default/devel base의 closing linkage 실패는 별도 승인된 게시 수용 절차가 필요한 미해결 경계다.
- 과거 helper timeout PID test 간헐성의 원인을 수정한 것은 아니다. 이번 전체420 테스트는 통과했다.

## 다음 단계 영향

Stage 6 산출물 커밋 이후 별도 최종 보고 갱신·재수용·원격 갱신 경계가 필요하다. 이전 publication tuple을 재사용하지 않는다. merge·exact tuple 기반 close·정리는 별도다.

## 승인 요청

- Stage 6의 위 5경로 산출물·검증과 `Task #29 Stage 6: 반복 enabled 요청의 서버 관측 보존` 커밋 승인.
- 계획서 커밋은 이미 완료됐으므로 단계 산출물 커밋에 다시 포함하지 않는다. 최종 보고/원격 작업은 이 승인에 포함하지 않는다.
