# Task #31 Stage 3 — 서명 공증 배포 준비 문서와 통합 검증

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
구현계획서: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 3
상태: 문서·통합 검증 통과, 결과·5경로 commit 승인 대기. 최종 보고와 GitHub publication은 미실행.

## 단계 목적

승인 계획 `810089769e8a1ea1dcbd8476bf250ab8b3eb94d9`에 따라 내부 unsigned와 로컬 signed/stapled 배포 후보를 구분하고, 실제 Stage 2 수용 산출물의 재검증과 전체 회귀를 수행한다. Stage 2 보고 commit `801d9689abac9cbde199663f2ae847bbf9ad7a4c`의 exact SHA 확인·Stage 3 진입 승인을 같은 스레드에서 받았다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `README.md` | v0.1.0 unsigned 링크·안내 보존, v0.2.0 로컬 후보와 미게시 상태 구분, signed/unsigned 명령·입력·승인 순서 안내 |
| `docs/smoke-checklist.md` | 기존 unsigned 탐색에서 signed namespace 제외. 별도 signed 시나리오에 identity/Team/profile·명시 manifest·두 hash-bound 제출 승인·최소 entitlement·정상/fault/cleanup 경계 기록 |
| `AGENTS.md` | 기존 build index에 signing-only/패키지/최종 verifier 명령, explicit selectors, 별도 앱/DMG 승인과 immutable source·문서-only provenance 규칙 반영 |
| 본 보고서, `mydocs/orders/20261008.md` | Stage 3 결과·실제 증거·최종 보고/게시 승인 경계 기록 |

## 본문 변경 정도 / 본문 무손실 여부

- 위치는 승인 계획의 문서 위치 판단을 따른다. README는 루트, 공식 검증 안내는 기존 docs, agent index는 기존 AGENTS, 내부 보고/orders는 mydocs 역할별 폴더다. 새로운 제품 문서 루트·역사 문서 재작성·파일 이동은 없다.
- README의 Contents → Overview → Getting Started → Features → Prerequisites 순서와 기존 v0.1.0 URL/unsigned 안내, no-install SSH·unknown/null·MIG/optional pmon/dmon·프로세스 한계를 보존했다. v0.2.0 download URL·Release 게시 성공·자동 업데이트·실제 SSH/알림 성공을 추가하지 않았다.
- 공식 체크리스트는 실행 시나리오이며 자체를 통과 기록으로 표현하지 않았다. 기존 unsigned/fixture/renderer/물리 QA 경계를 유지하고 signed 검증을 별도 추가했다. unsigned 탐색이 새 signed namespace를 잘못 선택하지 않도록 문서의 find 예제만 보완했다.
- 계획의 commit/HEAD/index/working blob `19cd5b13eaf752939f9525cf94c7240d3af7c1d5`, mode100644/regular0644/single-link·ancestor를 통합 gate 전에 검증했다. 제품/packaging 입력·entitlement·IPC/DB·Rust·테스트 코드는 변경하지 않았다.
- artifact source는 `225839c2b932adab6899793e62bb04c45bb359d3`로 유지한다. 이 source부터 승인 Stage 2 HEAD801까지 차이는 report/orders 2문서이고, 이번 단계 변경도 위 문서뿐이다. manifest/source를 최신 문서 HEAD로 다시 쓰거나 다시 signing/submit하지 않았다.

## 검증 결과

다음 13명령을 parent가 직접 한 번씩 실행해 모두 exit0였다. signed verifier에는 승인 identity/Team/profile을 전달했고 unsigned build 직전 epoch milliseconds freshness 값을 artifact verifier까지 전달했다.

```bash
npm run test -- --run
npm run build
npm run electron:build
npm run helper:build
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml -- --check
cargo fmt --manifest-path crates/gpuwatcher-helper/Cargo.toml -- --check
npm run electron:dist:unsigned
node smoke/electron-unsigned-dist-artifacts.mjs
node smoke/electron-packaged-app-smoke.mjs
node smoke/electron-signed-dist-artifacts.mjs --manifest "$SIGNED_MANIFEST"
git diff --check
```

- Vitest **31 files / 656 passed**. core **151 passed / 기존 live SSH 2 ignored**, helper **25 passed**. renderer/Electron/helper build와 두 cargo fmt check 통과. 프로젝트 JS/Markdown formatter를 새로 도입하지 않았다.
- fresh unsigned DMG/ZIP·내용/helper 검증 통과. 실제 unsigned packaged smoke는 기존 guard와 EACCES 오류/UI/탐색성 회귀를 유지하며 통과했다. signed 지원 때문에 unsigned 검증을 줄이지 않았다.
- 최신 승인 plan과 source225의 기존 finalized run을 명시해 실제 signed verifier를 재실행했다. 앱/DMG Apple info/log의 Accepted/request/uploaded SHA를 read-only 재조회하고 app/helper/DMG strict signature·최소 entitlement·arm64/version·stapler·spctl·ZIP/DMG 동등성 및 최종 hash를 재검증했다.
- signed 정상 disposable copy는 guard=false, 원 helper v0.2.0, launch 전 source/copy seal·codesign/stapler 동일성, 해당 copy의 CDP URL·nonblank UI·action-specific bridge·disabled smoke.invalid 저장/list/navigation을 통과했다.
- signed fault는 별도 chmod-only copy의 **backend-error**, 실제 structured EACCES·가시 UI·관리 탐색성으로 수용했다. 실제 OS signature-block을 관측한 것이 아니며 모호한 SIGKILL을 성공 증거로 사용하지 않았다. 원본 app·manifest/artifact hash와 owned cleanup이 보존됐다.
- 전용 search로 README와 active setup/protocol/troubleshooting/demo/checklist에서 `gpuwatcher --json`, collectorCommand/collector_command/collector command path, TAURI_/@tauri-apps, 미게시 v0.2.0 Release/download URL 패턴은 **0 match**였다. README/checklist의 NVIDIA/no-install/unknown/MIG/pmon/dmon/N/A/nvitop 한계도 확인했다. 역사적 docs/plan·draft와 negative guard가 있는 AGENTS는 삭제/재작성하지 않았다.
- unsigned의 default Electron icon·identity:null signing skipped 경고와 fault scheduler EACCES·cleanup SIGKILL 원문을 보존했다. 과거 install/dependency 경고, helper timeout PID assertion 간헐성, 최초 Stage 2 selector 누락·원 source signed runtime 실패 이력은 최신 통과로 삭제하지 않았다.

통합 gate 표시 구간은 2026-10-09 18:32~18:33 (+09:00)이다. 원문 UTC timestamp는 그대로 보존한다. 이는 검증 표시 시각이며 작업 종료 선언이나 인증된 event-time은 아니다.

### 산출물 결박

run: `release/electron/signed/2026-10-09T08-41-34-274Z-e77af24c-ba83-417d-a4d7-25ce76e7502b/`

- 앱 Accepted/stapled request: `3f627a7e-78bc-4a9a-a75b-ce2f57ca8fa3`
- DMG Accepted/stapled request: `3eb4768e-c9ff-466c-9b31-97603b87e155`
- 앱 seal: `bb7d350a22aefb0e6f0652b2bdb45ead280b0929ff72ffbce1e14bf038db6b29`
- 최종 배포 ZIP: `e08d681667cb3ee589c5b249875cbe67a1b4a6d719a9794d3b350e1723774c00`
- 최종 DMG: `ae254a7596a0283271988b15a476ea9ce51fa32dcdfa6d501f654c9392a5bfe8`
- Stage 2 acceptance receipt: `.omo/evidence/task-31-stage2-resume-acceptance.json`, SHA256 `b015b7875e8574624c8d37185e7b021adccf7cb9a5134c9ff2c3a626e4fa9270`
- Stage 3 통합 원문: `.omo/evidence/task-31-stage3-integration.txt`, SHA256 `df9808d258db0c17796dbc590c461e09fc5779da5ccb79c7a53c3a65abe25095`

원문·manifest·산출물은 ignored 로컬 증거다. 제품 문서 및 보고서에 비밀/개인키/암호를 기록하거나 바이너리/원문을 stage하지 않는다.

## 잔여 위험

- live SSH·실제 OS 알림·물리 키보드/VoiceOver 수용은 미실행이다. CDP·fixture·fake notifier를 실제 OS 입력/수집 성공으로 표현하지 않는다.
- signed 성공은 canonical temp copy에서의 결과다. 이전 Desktop 원본 위치의 ERR_FAILED 원인이 TCC/entitlement라고 확정하거나 해결됐다고 주장하지 않는다.
- OS signature-block 분기는 strict mock 회귀와 read-only log 문법 확인으로만 검증됐고 실제 fault 결과는 backend-error였다.
- 로컬 Accepted/stapled·통합 gate 통과는 GitHub 업로드·외부 배포 최종 수용·자동 업데이트·Task #31 완료를 뜻하지 않는다. 최종 보고/evidence acceptance와 publication은 남아 있다.

## 다음 단계 영향

Stage 3 결과·5경로 commit 승인 후 exact SHA 확인 및 별도 최종 보고 절차 진입 승인을 받는다. 최종 보고와 orders는 Stage 3 commit에 합치지 않는다. 이후 최종 evidence 수용·task publication tuple, devel→main release PR/merge/tag/Release·asset 업로드, issue close/cleanup의 개별 승인을 유지한다.

## 승인 요청

- Stage 3 문서·통합 결과와 한계 승인.
- README/checklist/AGENTS/report/orders 총5경로만의 commit 승인.
- 메시지: `Task #31 Stage 3: 서명 공증 배포 준비 문서와 통합 검증`.
- 최종 보고 진입·GitHub mutation·작업 종료는 현재 요청에 포함하지 않는다.
