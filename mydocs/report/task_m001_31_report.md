# Task #31 최종 보고 — macOS v0.2.0 서명·공증 및 외부 배포 준비

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
마일스톤: M001
상태: 승인된 Stage 4 Codex 리뷰 보정·최신 source 검증·최종 보고 갱신 완료, report/orders 2경로 commit 및 후속 final report/evidence 수용 승인 대기. PR #32는 기존 final0ca source로 게시된 상태이며 최신 보정 push는 미실행. 역사적 source225 서명 산출물은 보존했지만 최신 P4/source의 실제 signed 수용·외부 배포 승인은 미실행.

## 작업 요약

- 대상 이슈: #31
- 마일스톤: M001
- 단계 수: Stage 1~4 및 승인된 보정 Stage 2.1
- 작업 목적: v0.2.0 arm64 앱/helper의 Developer ID 서명·Apple 공증·staple·격리 패키지 수용 경로와 배포 준비 문서를 구축한다. unsigned 경로, no-install SSH, action-specific IPC, unknown/null과 최신 성공 snapshot 정책은 유지한다.
- 승인 수행계획 commit: `11e79f7e05e9ce22185be7bb3445a60ada75e6ea`
- 최초 구현계획 commit: `42acefc7cef15c4e7d87b239f2b9634565ffe207`
- 역사적 signed run의 승인 계획: `810089769e8a1ea1dcbd8476bf250ab8b3eb94d9`, blob `19cd5b13eaf752939f9525cf94c7240d3af7c1d5`
- 최신 보정 계획 commit: `0fa0f34526fc56160448e1d796b19c54ba7cca6d`, blob `9fdfe6ed37f77fb7c9b8740d18cd111377cf3377`
- 역사적 서명 산출물의 immutable 제품 source: `225839c2b932adab6899793e62bb04c45bb359d3`
- 승인된 마지막 Stage·최신 제품 source: `b8a26cff7430cfaf4f31cac81d127d53ff64420a` — 코드/전체/실제 unsigned 수용, 새 실제 signed 수용은 아님
- 이전 final report/evidence 승인 source: `0ca634b552ee8f54a87d7c381a3452017e0a7200`; PR [#32](https://github.com/jinzer0/GPUWatch/pull/32)는 `publish/task31` → `devel`, OPEN/non-draft. 최신 보정 게시·merge·issue close는 별도 경계다.

## 변경 파일 목록과 영향 범위

| 경로 | 변경 요약 | 영향 범위 |
|---|---|---|
| `package.json`, `package-lock.json` | 앱0.2.0, 직접 @electron/osx-sign1.3.3, signed pack/dist scripts | 기존 unsigned defaults 보존 |
| `crates/gpuwatcher-core/Cargo.toml`, `Cargo.lock`; `crates/gpuwatcher-helper/Cargo.toml`, `Cargo.lock` | core/helper0.2.0 정합화 | JSON protocol/DB/IPC DTO 변경 없음 |
| `build/entitlements.mac.plist`, `build/entitlements.helper.plist` | 앱 JIT-only·helper empty | 권한 확대/fallback 없음 |
| `electron/signPackagedApp.mjs`, `.test.ts` | maintained native signer callback, exact helper 최소 권한 | framework options 보존·mock 검증 |
| `electron/signedRelease.mjs`, `.test.ts` | fixed actions, P/C/identity/hash/Apple provenance; Stage 4 squash-safe plan blob·공통 physical/tree source proof | 앱 ZIP/DMG 별도 승인·clean signing·index/filter/mode/ignore masking 거부 |
| `smoke/electron-signed-dist-artifacts.mjs`, `.test.ts` | explicit finalized manifest·native 전/완료 직전 동일 source proof | 제품 drift·unknown source 거부, 문서-only 허용·receipt 결박; native 수용 유지 |
| `smoke/shared/paths.mjs` | signed namespace를 unsigned 탐색에서 제외 | unsigned 자동 탐색 유지 |
| `smoke/scenarios/packaged-app.mjs`, `.test.ts`; `packaged-app/startup.mjs`, `helper-error.mjs`, `evidence.mjs` | explicit signed/unsigned mode, canonical signed 정상 copy·원 helper, 별도 fault와 strict receipt/PID/time/CDP 결박 | unsigned guard/오류/UI 기준 유지 |
| `README.md`, `docs/smoke-checklist.md`, `AGENTS.md` | unsigned/signed 명령·입력·수용과 미게시/검증 한계 | 기존 v0.1.0 링크·runtime·no-install·unknown 보존 |
| `mydocs/plans/task_m001_31_impl.md` | 별도 승인·plan-only commit의 Stage 2.1/4 보정 계약 | 기존 승인/실패 이력 소급 변경 없음 |
| `mydocs/working/task_m001_31_stage1.md`, `stage2.md`, `stage2.1.md`, `stage3.md`, `stage4.md` | 승인 단계별 결과·위험·evidence | 내부 단계 보고 |
| 본 최종 보고서, `mydocs/orders/20261008.md` | 최신 리뷰 보정 수용·역사적 서명/기존 PR와 추가 게시 미실행 구분 | 정확히 두 파일 commit 대상 |

## 문서 위치 검증

| 파일 | 계획된 위치 | 실제 위치 | 결과 | 근거 |
|---|---|---|---|---|
| README | 기존 루트 | `README.md` | OK | 승인 계획의 위치 표, 순서/기존 URL 보존 |
| 공식 검증 안내 | 기존 docs | `docs/smoke-checklist.md` | OK | 기존 시나리오에 signed 별도 추가 |
| 에이전트 인덱스 | 기존 루트 | `AGENTS.md` | OK | 명령·provenance/승인 경계만 갱신 |
| 단계 보고 | mydocs/working | `mydocs/working/task_m001_31_stage*.md` | OK | 중앙 단계 템플릿 |
| 최종 보고/orders | mydocs/report·orders | 본 파일, `mydocs/orders/20261008.md` | OK | 중앙 최종 템플릿, 기존 주문 파일 갱신 |

제품 문서를 mydocs/manual로 옮기거나 새 공식 문서 루트를 만들지 않았다. 역사적 docs/plan·draft는 현재 setup으로 다시 쓰지 않았다.

## 변경 전·후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| 앱/core/helper version | 0.1.0 | 0.2.0 |
| 명시적 signed npm scripts | 없음 | pack:signed·dist:signed 2개 |
| source225 run의 앱/DMG Apple 수용 | 해당 run 없음 | 별도 승인된 2건 Accepted/stapled, 최신 P4 run은 미실행 |
| Vitest 수용 수 | Stage 1 수용 당시609 | source0ca 당시656, 최신 sourceb8 최종705 |
| core/helper tests | Stage 1 당시151/25 | 최종151/25, 기존 live SSH2 ignored |
| artifact 제품 source 이후 차이 | 제품 source225 | source0ca까지 문서-only, Stage 4에서 제품/packaging 입력 변경. 산출물 불변이어도 새 source 수용으로 재사용 금지 |

전체 task 시작 시 테스트 수를 새로 측정하지 않았으므로609는 Stage 1 이후 비교 기준이지 변경 전 전체 테스트 수가 아니다. 기존 source03의 Accepted 2건은 위 새 run 2건과 구별한다.

## 검증 결과

### 역사적 source225 / Stage 1~3 수용

다음 표의 실제 signed 성공은 P810/source225 run과 기존 final0ca 수용에만 결박한다. 최신 P4/sourceb8의 서명·공증 성공이라고 표현하지 않는다.

| 수용 기준 | 결과 |
|---|---|
| 승인 계획·source 결박 | OK — plan-only P/동일 blob·mode·ancestor·source225; 최종 HEAD56은 문서-only 후속 |
| 앱/helper 서명·최소 권한·arm64/0.2.0 | OK — 실제 Developer ID·Team·timestamp·hardened runtime, JIT-only/empty, file/lipo/version 및 실제 helper envelope |
| 앱 ZIP/DMG 별도 승인·Apple provenance | OK — 새 exact tuple 재검증, 각 request/Accepted/log uploaded SHA 결박 |
| app/DMG staple·strict signature·Gatekeeper | OK — 실제 OS 명령과 source=Notarized Developer ID |
| ZIP extraction/DMG mount 동등성 | OK — source app/helper/files/seal·signature/ticket·최종 hash, owned detach/정리 |
| signed 정상 원 helper/UI/bridge | OK — canonical 격리 copy, guard=false, nonblank/정확한 CDP app URL·health0.2.0·disabled registry save/list/navigation |
| signed fault 분리 | OK — 별도 chmod-only copy의 실제 structured backend EACCES/가시 오류·탐색성. 실제 OS-block 결과가 아님 |
| unsigned guard·artifact/UI 회귀 | OK(재실행) — 최초 최종 수용의 fault 오류 UI wait가45초 timeout. 코드/조건/timeout을 바꾸지 않은 1회 전체 재실행은 통과; 원인 미확정 |
| 전체 tests/build/fmt | 역사적 OK — 당시13명령 exit0, Vitest656/core151/helper25. 최신 보정 검증은 아래 별도 기록 |
| docs negative guard·runtime 한계 | OK — active docs collector/Tauri/미게시0.2 download URL0 match; no-install/unknown/MIG/pmon/dmon·기존 링크 유지 |
| 원본/사용자/production data | OK — 원본 seal/최종 artifact hashes와 원 worktree HEAD/사용자 변경 보존, smoke data/HOME/cwd 격리 |

### 이전 최종 수용 실행·실패 보존

승인 HEAD56과 P810 결박 확인 후 마지막 Stage의13명령을 재실행했다. 첫 실행은10개 명령 통과 뒤 unsigned helper fault의 visible error wait timeout으로 중단했다. 실제 launch 로그에는 EACCES가 있지만 가시 UI 수용이 성립하지 않았으므로 성공으로 처리하지 않았다. signed verifier는 그 첫 실행에서 아직 실행되지 않았다.

첫 실패와 해당 launch/failure 로그를 별도로 보존한 뒤 **코드·조건·timeout 무변경으로 한 번만 전체 재실행**했다. 13개 모두 exit0였고 실제 unsigned/signed UI/fault와 Apple read-only 재검증까지 통과했다. 첫 실패를 삭제하거나 근본 해결된 간헐성으로 표현하지 않는다.

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

unsigned build 직전 freshness epoch 값을 artifact verifier까지 전달했고 signed verifier에는 같은 승인 identity/Team/profile을 전달했다. 최종 단계에서 새 signed build·Apple submit·GitHub mutation을 하지 않았다. default icon·unsigned identity:null signing skip·fault scheduler EACCES·cleanup SIGKILL 출력도 원문에 유지한다.

### 역사적 로컬 배포 후보 — 최신 source용 후보 아님

run: `release/electron/signed/2026-10-09T08-41-34-274Z-e77af24c-ba83-417d-a4d7-25ce76e7502b/`

- Developer ID: `Developer ID Application: Jinyeong Kim (397452Z366)`; Team397452Z366; profile gpuwatcher-notary; explicit keychain 없음.
- 앱 request: `3f627a7e-78bc-4a9a-a75b-ce2f57ca8fa3`
- DMG request: `3eb4768e-c9ff-466c-9b31-97603b87e155`

| 산출물 | SHA256 |
|---|---|
| 앱 제출 ZIP | `05d9647f6465f80fc7aba7a91518d4ab7c70e9b0f56d05b8ce199a3838a7c925` |
| signed 앱 staple 전 seal | `c1255955e3668dac3f666b3acfa56b77f595e3f825172c79453b2312a8b13e99` |
| stapled 앱 seal | `bb7d350a22aefb0e6f0652b2bdb45ead280b0929ff72ffbce1e14bf038db6b29` |
| 배포 `distribution/GPUWatcher-0.2.0-arm64.zip` | `e08d681667cb3ee589c5b249875cbe67a1b4a6d719a9794d3b350e1723774c00` |
| DMG 제출 전 | `fd2fb023e4271316e0112712b63614b0b16482dc4956c53875c038f2cdac6d78` |
| 최종 `distribution/GPUWatcher-0.2.0-arm64.dmg` | `ae254a7596a0283271988b15a476ea9ce51fa32dcdfa6d501f654c9392a5bfe8` |

ZIP 자체에는 staple하지 않는다. Accepted·stapled 앱을 담은 배포 ZIP과 공증 전 앱 제출 ZIP을 혼동하지 않는다.

### 이전 수용 evidence — 재라벨하지 않음

- 실패 포함 전체 결박 원문: `.omo/evidence/task-31-final-acceptance-evidence.txt`
  - SHA256 **`726720d7807825f923f1e0f62d1b00fa4534c41ee9f3f2582214132dee7211c9`**
- 최초 실패13명령 시도(11번째 중단): `.omo/evidence/task-31-final-acceptance.txt`
  - SHA256 `4436b6f57150eab99feb50159e9ac5ddcde68068c868f2b0528d9a7805b7b1a8`
- 변경 없는 전체 재실행: `.omo/evidence/task-31-final-acceptance-rerun.txt`
  - SHA256 `49c0546869e00d7cb1ceae49902a35452aeba0a295ecea29bd5ab52c24f4c303`
- Stage 3 통합13명령: `.omo/evidence/task-31-stage3-integration.txt`
  - SHA256 `df9808d258db0c17796dbc590c461e09fc5779da5ccb79c7a53c3a65abe25095`
- 실제 Stage 2 acceptance: `.omo/evidence/task-31-stage2-resume-acceptance.json`
  - SHA256 `b015b7875e8574624c8d37185e7b021adccf7cb9a5134c9ff2c3a626e4fa9270`

원문은 ignored 로컬 증거이며 binary/credential/private key를 commit하지 않는다. UTC 원문 timestamp는 보존하고 로컬 표시 완료 시각은 오늘할일에 따로 기록한다. 이 표시는 인증된 event-time이나 작업 시간 종료 선언이 아니다.

### 단계별 검증 결과

- [Stage 1](../working/task_m001_31_stage1.md): source `03e0c22e5c9c2350cdf49f13037f09502d931bca`, 서명 driver/native callback/mock/unsigned 회귀·v0.2.0, 당시609 tests/12명령 통과.
- [Stage 2.1](../working/task_m001_31_stage2.1.md): source `225839c2b932adab6899793e62bb04c45bb359d3`, signed guard 서명 훼손 보정·정상/fault 분리·strict metadata/PID/time/CDP 수용, focused232/전체656 및 unsigned 실제 검증. 최초 review 지적은 수정하고 재검토했다.
- [Stage 2](../working/task_m001_31_stage2.md): report commit `801d9689abac9cbde199663f2ae847bbf9ad7a4c`, 새 run app/DMG 별도 승인 Accepted/staple/Gatekeeper·실제 signed UI/helper/backend fault 수용.
- [Stage 3](../working/task_m001_31_stage3.md): commit `56dae4ce204e6e23178c59976e1b1cef2ba6a391`, 문서5경로·전체13명령 통과·동일 signed 산출물 재검증.
- [Stage 4](../working/task_m001_31_stage4.md): 승인 commit `b8a26cff7430cfaf4f31cac81d127d53ff64420a`, 정확히7경로. Codex P1/P2 실제 Git 재현·squash-safe B4·공통 source proof·masking 보정·독립 재검토 CLEAR, focused220/전체705 및 실제 unsigned 수용. 최신 signed run은 미실행.
- 기존 source03 run의 앱/DMG Accepted와 signature-breaking guard 이후 SIGKILL·Desktop renderer ERR_FAILED·canonical temp copy 진단은 과거 관측으로 보존했다. 새 source/P의 수용으로 재라벨하지 않았다. 최초 Stage 2 최종 verifier selector 누락 실패도 유지한다.

### 최신 Stage 4 최종 수용

승인된 planP4·exact sourceb8·plan-only 경로/동일 blob·mode·topic ancestor·clean index/working을 확인했다. canonical GitHub repository1256824919/#31 OPEN/M001 및 PR #32의 기존 head0ca를 read-only 확인했다. 이는 push나 close 승인/실행이 아니다.

- Codex P1: 동일 승인 계획 bytes를 가진 fresh/squashed 실제 Git fixture에서 역사적 driver가 old P object를 찾지 못해 builder 전에 실패함을 재현했다. 새 runtime은 승인 OID를 이력 anchor로 유지하면서 HEAD/index/working bytes와 immutable B4를 검증하며 역사적 P object/ancestor가 없어도 된다. 사람/작업 단계의 exact P 승인·topic lineage 검증은 그대로다.
- Codex P2:5개 제품 경로 변경 및 unknown source6건을 기존 verifier가 잘못 수용하는 실패를 보존했다. 실제 index flags2건·filter/mode2건·local/global/nested ignore3건도 재현·보정했다.
- 공통 source proof는 source object/tree·stage0·physical bytes/modes·tracked/untracked를 검사한다. 승인 blob이 같은 문서-only 차이만 허용하고 제품 drift·unknown source·unsafe/binary/executable 문서·Git masking을 실패 처리한다. trusted committed root .gitignore만 generated/local 제외 근거다. native/Apple/runtime 전과 완료 직전에 동일 proof를 요구한다.
- latest source 최종 수용은 전체705/core151/helper25, build/fmt·fresh unsigned artifact·실제 unsigned 정상/helper EACCES/UI/navigation/cleanup 등12명령 모두 exit0다. 추가13번째 확인은 실제 sourceProof와 기존 manifest/artifact seal/hashes 보존·옛 P manifest의 native/Apple/runtime 전 거부이다. 실제 새 signed gate13개 통과로 표현하지 않는다.
- 이번 최종 sourceb8 수용은 한 번에 통과했다. Stage 4 focused220·독립 reviewer CLEAR는 기존 단계 증거와 연결한다. 이전 unsigned UI45초 timeout·실패 포함 수용은 삭제/근본 해결 주장하지 않는다.
- 마지막 source proof는 `{sourceCommit:b8, headCommit:b8, documentationChanges:[]}`였다. 최종 report/orders만 갱신한 뒤에도 제품 source의 문서-only proof를 별도로 확인한다. raw timestamp는 원문에 보존하고 완료 표시는 로컬 문서 범위 표시로만 쓴다.

| 최신 증거 (.omo/evidence/) | SHA256 |
|---|---|
| `task-31-final-stage4-acceptance.txt` — 최신 sourceb8의13개 확인 원문 | **`07265790a9303a7bf41ec7d25eced9abbcc7017b2e556159abdea669955d9948`** |
| `task-31-stage4-final-verification.txt` — 승인 Stage 4의12명령 | `e7a59564f36909bd8631c1003dde5697ab4c53753f05edcfdaea127859cf00bf` |
| `task-31-stage4-source-bindings.json` — 승인7경로 source snapshot | `b71b945fe707f8569b98768a0d805dc79d9362837caf7df944ae1a911d77eeea` |

재현·focused·최신 actual/mock 구분과 증거 hash는 Stage 4 보고서에 기록했다. 이번 final report/evidence tuple은 최신 증거072657에 결박하며 이전 승인726720을 대체해 새 source 성공이라고 소급 해석하지 않는다.

## 잔여 위험과 후속 작업

### 잔여 위험

- **최신 P4/sourceb8에 대한 실제 새 signed run·앱/DMG Apple 제출·signed 최종 수용은 미실행이다.** driver/packaging 제품 입력이 달라졌으므로 새 후보가 필요하다. source225의 Accepted artifact나 Git/mock 회귀를 새 source 수용으로 사용할 수 없다. 리뷰 보정/commit/push 요청은 Apple 제출 승인으로 전파하지 않는다.
- source proof는 trusted root ignore의 generated/local 데이터·build 환경을 포함한 hermetic build 또는 filesystem lock이 아니다. 원본 seal/hash·native gate·별도 승인 경계는 계속 필요하다.
- **최종 최초 unsigned helper fault UI timeout은 원인 미확정이다.** 로그의 backend EACCES만으로 가시 UI 통과를 꾸미지 않았고 재실행 pass도 근본 수정으로 주장하지 않는다. 결과 수용 시 이 간헐성을 함께 판단해야 한다.
- live SSH·실제 OS 알림·물리 키보드/VoiceOver는 미실행이다. CDP·fixture·fake notifier·정상 로컬 helper는 이 수용을 대신하지 않는다.
- signed 성공은 canonical temp copy에서의 결과다. Desktop 원본 ERR_FAILED를 TCC/entitlement 원인으로 확정하거나 해결했다고 하지 않는다.
- OS signature-block 분기는 strict mock/PID/time/log 문법 확인이며 실제 관측 fault는 backend-error다.
- 기존 dependency/install-script 경고와 helper timeout PID assertion 간헐성은 범위 밖·근본 수정 없음. 이번 unsigned 가시 오류 timeout과 기존 helper PID assertion 문제는 서로 다른 관측이다.
- 자동 업데이트·GitHub Release/tag/assets·외부 배포 최종 승인은 없다. 준비된 로컬 산출물을 이미 게시된 릴리스로 표현하지 않는다.

### 후속 작업 후보

- unsigned fault 가시 오류 timeout이 재현되면 CDP/UI state와 실제 backend response를 보존해 원인을 좁히는 별도 보정 계획. 현재 task에서 승인 없이 제품 source·wait 조건을 변경하지 않았다.
- 승인된 로컬 후보에 대한 실제 SSH/물리 macOS/알림 검증이 필요할 때 격리 대상과 별도 실행 승인으로 수행한다.
- 최신 final report/evidence 수용 뒤 PR #32 fresh head/base/title/body를 확인해 승인 exact OID만 fast-forward/exact-old lease로 갱신하고 리뷰 답변에 보정 SHA·검증·미실행 signed 한계를 기록한다. 기존 게시의 Task #31 한정 명시 본문 참조·별도 close 예외는 유지한다. review/merge, 새 실제 signed run의 앱/DMG 각각 승인, devel→main release PR/merge/tag/Release·asset 업로드는 별도다. OPEN issue close는 exact state/updated_at cleanup 승인 경계를 유지한다.

## 커밋 후 승인 요청

- 이 보고서와 오늘할일만 regular/non-symlink/single-link, working0644·index/commit100644로 검증해 정확히2경로 commit하는 별도 승인을 요청한다. 현재 final commit은 미실행이다.
- 메시지: `Task #31: 최종 보고서 작성과 오늘할일 완료 처리`.
- commit 후 final commit OID·report/orders blob OID·최신 acceptance evidence SHA256(072657)을 묶은 같은 스레드 `approve-final-report-and-evidence` tuple 승인을 요청한다. 이전 실패 포함 수용726720은 역사적으로 보존한다.
- 그 승인 전 private publication directory/title/body를 만들지 않는다. 첫 승인도 remote mutation 허가가 아니며 read-only preparation 뒤 exact publication tuple의 별도 승인만 게시를 허용한다.
