# Task #31 Stage 4 — squash-safe 계획 결박과 signed source drift 검증

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
PR: [#32](https://github.com/jinzer0/GPUWatch/pull/32)
구현계획서: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 4
승인 계획 commit: `0fa0f34526fc56160448e1d796b19c54ba7cca6d`
승인 plan blob: `9fdfe6ed37f77fb7c9b8740d18cd111377cf3377`
상태: 보정 구현·실제 Git/mock·전체/unsigned 검증 통과, 결과·7경로 commit 승인 대기. 최신 source의 실제 signed 수용·추가 게시는 미실행.

## 단계 목적

Codex의 P1 `4231004786`과 P2 `4231004797`을 해결한다. squash 뒤 역사적 계획 commit의 존재/ancestor를 요구하지 않고 승인된 immutable 계획 blob을 검증한다. finalized verifier에는 실제 제품 source/tree/index/working 증거를 추가해 변경된 제품을 과거 Accepted artifact로 수용하지 못하게 한다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `electron/signedRelease.mjs` | P4/B4 pin, squash-safe sourceSnapshot, 공통 verifyArtifactSource, raw 물리 bytes/modes·index flags·root ignore policy 검증. signing clean/source/credentials/submit 경계 유지 |
| `electron/signedRelease.test.ts` | 실제 계획 bytes, 실제 disposable Git의 squash/문서-only/제품 drift·unknown source·dirty signing·계획 metadata 회귀 |
| `smoke/electron-signed-dist-artifacts.mjs` | native/Apple/runtime 전 source proof 필수, 완료 전 재검증·동일 proof 비교·receipt 포함 |
| `smoke/electron-signed-dist-artifacts.test.ts` | 실제 Git source fixture, old artifact의 committed/staged/working/untracked/삭제/rename 거부·문서 수용·unsafe docs·index/filter/mode/ignore masking·runtime 중 drift 회귀 |
| `AGENTS.md` | squash-safe runtime vs task 승인, physical source·trusted root ignore·역사적 artifact 경계 |
| 본 보고서, `mydocs/orders/20261008.md` | 리뷰 재현·보정·최신 검증·승인 범위 기록, 리뷰 보정 진행중 상태 복구 |

## 본문 변경 정도 / 본문 무손실 여부

- 계획 내용/plan-only commit/exact SHA·Stage 4 진입을 순서대로 승인받았다. 승인 계획의 HEAD/index/working blob·regular0644/single-link·plan-only 경로를 검증했다. 이 단계에서 승인 계획을 다시 수정하지 않았다.
- 제품5경로와 report/orders2경로만 변경한다. package/version/lockfile·entitlement·native signer·React/IPC/Rust/DB·submit 알고리즘을 변경하지 않았다.
- 최초 구현계획 P810, source225 Accepted run, source0ca의 최종 보고/evidence와 PR 게시 이력은 역사적 사실로 보존한다. 기존 manifest/P/C/Apple request를 P4에 재라벨하지 않는다.
- README/checklist는 Stage 3의 기존 후보 준비·미게시 표현과 검증 경계를 유지한다. 변경한 runtime 검증의 상세 인덱스는 승인된 AGENTS 경로에 기록하고 공식 제품 문서의 새 위치/파일을 만들지 않았다. 최신 제품은 새 run이 필요하다는 상태를 본 보고서/orders에서 명시한다.
- AGENTS는 기존 영어 런타임 인덱스 형식만 최소 보완했다. 내부 보고는 한국어 중앙 단계 템플릿을 따른다. 기존 사용자/BMad·원 worktree 변경을 되돌리지 않았다.

## 검증 결과

### 수정 전 재현

- **P1:** 현재 topic0ca의 P810 ancestor 검사 자체는 exit0였다. 문제는 squash/fresh-clone 이력에서 발생한다. 실제 임시 Git repo에 동일 승인 계획 bytes만 담은 source와 historical driver를 실행해 `merge-base`가 역사적 P object를 찾지 못하고 builder 전에 실패함을 확인했다. mock builder/native/Apple를 실제 성공으로 표현하지 않았다.
- **P2:** 실제 Git repo/source와 mock finalized artifact에서5개 제품 경로 drift와 unknown source6개 사례가 모두 `promise resolved instead of rejecting`으로 실패했다. 기존 verifier가 잘못 수용하는 결함을 수정 전 테스트로 보존했다.
- 이후 actual Git의 assume-unchanged/skip-worktree2건, clean filter·core.fileMode=false2건, local/global/nested ignore3건에서도 잘못 수용하는 실패를 재현했다. timeout·native 수용 조건을 약화하지 않고 동일 source proof 경계에서 보완했다.

### 보정 계약

- runtime은 P4를 승인 이력/manifest anchor로 유지하고 B4와 HEAD/index/물리 계획 파일의 blob/mode/bytes를 비교한다. runtime에는 역사적 P4 object·ancestor가 없어도 된다. 사람/작업 단계의 exact plan-only commit 승인·topic lineage 검증은 제거하지 않았다.
- 공통 API `verifyArtifactSource(manifest, dependencies={})`는 `{sourceCommit, headCommit, documentationChanges}`를 반환한다. manifest source object는 실제 commit이어야 하며 source→HEAD·staged/working/untracked 차이를 검사한다. ancestry 없는 squash/rebase tree도 비교하지만 unknown source를 fetch/추정하지 않는다.
- README/AGENTS 또는 docs/mydocs 아래 regular nonexecutable nonbinary .md만 허용한다. 계획 B4는 별도 고정 검증이다. NUL-delimited Git 결과·literal paths·rename 비활성화로 파일 이름/삭제/rename을 정확히 분류한다.
- Git index의 non-H flags를 거부하고 stage0와 물리 working bytes/modes를 직접 비교한다. Git clean filter·fileMode=false가 실제 제품 입력을 숨길 수 없다. parent symlink·binary/executable/hardlinked 문서도 거부한다.
- generated/local 데이터 제외는 HEAD/index/물리 bytes/mode가 같은 committed root .gitignore만 사용한다. info/exclude·global/nested ignore를 source 수용 근거로 쓰지 않는다. 이 검증은 versioned source proof이며 hermetic build나 filesystem lock은 아니다.
- signing driver는 문서 dirt/untracked도 거부하고 원래 clean exact source/credential/certificate/approval 조건을 유지한다. 최종 verifier만 실제 문서-only 차이를 허용하며 OS/Apple/runtime 전과 완료 직전에 동일 proof를 확인한다.

### 실행 결과

focused driver+verifier **2 files / 220 tests passed**. 최신 전체 **31 files / 705 tests passed**. core **151 passed / 기존 live SSH2 ignored**, helper **25 passed**.

아래12명령 모두 exit0였다. unsigned freshness는 해당 build 직전 epoch milliseconds로 캡처해 artifact verifier까지 전달했다.

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
git diff --check
```

- 실제 unsigned packaged startup·기존 guard·원 helper0.2.0·빈 registry/disabled server 저장/list/navigation·nonexec EACCES 오류/UI·탐색성·owned cleanup을 통과했다. signed 지원 때문에 unsigned fault 수용을 완화하거나 skip하지 않았다.
- default Electron icon·unsigned identity:null signing skip, fault scheduler EACCES·cleanup 종료 로그를 원문에 남겼다. 과거 최종 수용의 unsigned visible-error45초 timeout은 이번 pass로 근본 해결됐다고 주장하지 않는다.
- independent read-only reviewer가 초기 index/filter/mode/ignore bypass를 지적했다. 실제 재현과 보완 뒤 최신4코드/test 파일을 재검토해 **CLEAR·잔여 P1/P2 blocker 없음**을 반환했다. reviewer는 tests/build/network/format/edit를 실행하지 않았고 parent가 gate를 실행했다.
- 기존 source225 app의 seal과 manifest/app ZIP/배포 ZIP/DMG hashes는 변경되지 않았다. 최신 verifier의 옛 manifest 호출은 native/Apple/runtime 함수에 도달하기 전에 `Invalid manifest provenance`로 거부됨을 별도 negative 검증했다. 과거 run을 최신 제품 수용으로 표현하지 않는다.
- JS/Markdown formatter 설정을 새로 도입하지 않았다. 두 cargo fmt check·diff whitespace 검증을 유지했다.

### evidence

원문은 ignored 로컬 파일이며 commit에는 경로/hash/결과만 기록한다.

| 파일 (.omo/evidence/) | SHA256 |
|---|---|
| `task-31-stage4-p1-before.txt` | `e3dcfadfb63e05ceb8462ed7215119c0dd2dc169dea206c4279d186617a509d4` |
| `task-31-stage4-p2-before.txt` | `ea59b21b122e9f23a40fbedfb13c6547e982e0c1b3906aedc718e3b31f9722b1` |
| `task-31-stage4-hidden-index-before.txt` | `ffeaee750445db99e0b49a6a3b36ec5e0f3bfdcb3a0290ec3c200adf17fc1d19` |
| `task-31-stage4-physical-before.txt` | `60231b8a2416aa5f3c9e83e1b28fd474e3a19b98b2da0cf910224f95ec652b8e` |
| `task-31-stage4-ignore-before.txt` | `b358d94775e21f8ffb3db17b9d77ae6e1789d2724b4236c03d4146a1fe7d2c18` |
| `task-31-stage4-focused-hardened.txt` | `7d69be10362e6e4b947dab480bf50492b057871174e46d282363374531e3a44f` |
| `task-31-stage4-final-verification.txt` | `e7a59564f36909bd8631c1003dde5697ab4c53753f05edcfdaea127859cf00bf` |
| `task-31-stage4-historical-artifact-boundary.txt` | `1fedb8017cb63a7e8f73f6a7735711c9db16c70b0b79f1998f158a68d893018e` |

## 잔여 위험

- **최신 P4/보정 source의 실제 signing·Apple 제출·signed 최종 수용은 미실행**이다. source/plan pin과 제품 입력이 바뀌었으므로 외부 배포 후보를 확정하려면 새 run·앱/DMG 각 별도 tuple 승인·실제 수용이 필요하다. 현재 요청은 코드 리뷰 수정/commit/push이고 이를 Apple 제출 승인으로 전파하지 않는다.
- 실제 Git fixture라도 signed artifact/native signer/Apple/runtime는 mock이다. 실제 unsigned UI와 구별한다. live SSH·물리 키보드/VoiceOver·OS 알림은 미실행이다.
- 원 source Desktop ERR_FAILED 및 기존 간헐적 helper/unsigned UI timeout의 근본 원인은 미해소다. 새로운 버그가 해결됐다는 근거로 오래된 실패 이력을 삭제하지 않는다.
- trusted root .gitignore의 generated/local 데이터와 build 환경은 versioned source proof 밖이다. 원자적 filesystem lock이나 reproducible/hermetic build를 보장하지 않는다. native gate·artifact seal/hash와 별도 승인도 계속 필요하다.

## 다음 단계 영향

Stage 4 결과·7경로 제품/report/orders commit 승인 뒤 exact SHA 확인을 받는다. 최종 보고/orders를 별도 갱신·수용한 뒤 PR #32의 fresh exact old head/base/title/body를 확인하고 fast-forward/exact-old lease로 승인 source만 게시한다. #31 명시 본문 참조·별도 issue close 예외는 유지한다. 리뷰 comment 답변에 보정 SHA/실제 tests/새 signed 수용 미실행을 사실대로 연결한다. merge/close/Release는 별도 승인이다.

## 승인 요청

- Stage 4 결과·보정·최신705/unsigned 실제 검증·한계 승인.
- 위5개 코드/test/AGENTS와 report/orders2개 총7경로만 commit 승인.
- 메시지: `Task #31 Stage 4: squash-safe 계획 결박과 signed source drift 검증`.
- 실제 새 signing·Apple 제출·merge·close·Release 또는 작업 종료는 포함하지 않는다.
