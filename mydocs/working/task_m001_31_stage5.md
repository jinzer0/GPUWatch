# Task #31 Stage 5 — 승인 manifest source label 결박

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
PR: [#32](https://github.com/jinzer0/GPUWatch/pull/32)
구현계획: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 5
계획 commit: `4792cf42a8fac74540b3547349018e854b44f74e`
계획 blob: `6aaa38b6321e3e2aa7407f672a16917e9d1f6a24`
GPG: plan-only commit의 `VALIDSIG 2BC4EB9D9F9332E3A377AFAC2040104BBE6459FE` 확인
상태: 보정 구현·회귀 검증·결과 작성 완료, 단계 결과/8경로 제품 commit 승인 대기. 제품 commit/push·새 실제 signed 수용·Apple 제출은 미실행.

## 단계 목적

Codex P1 comment `4232489857`을 해결한다. 기존 finalized manifest의 sourceCommit과 두 approval.sourceCommit을 문서-only 후속 HEAD로 동시에 바꾸면 원 승인 manifestSha256은 형식만 검사하고 새 source label로 verified를 반환할 수 있었다. 원 승인 pre-submit 원문과 독립 hash 입력을 결박해 이 재라벨을 거부한다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `electron/signedRelease.mjs` | P5/B5 pin, 공유 approval projection, state/upload 전 exact 원문 wx0600 snapshots, 독립 원 승인 hash의 verifySubmissionSnapshots |
| `electron/signedRelease.test.ts` | snapshot bytes/원문 hash·exclusive path·original state/source/credential/artifact/seal·uncertain upload/old provenance 회귀 |
| `smoke/electron-signed-dist-artifacts.mjs` | 원 앱/DMG 승인 manifest hash 필수 CLI, native 전/성공 직전 원 승인 proof 검증·receipt |
| `smoke/electron-signed-dist-artifacts.test.ts` | 실제 Git 문서-only source 재라벨·snapshot/record 동시 수정·missing anchor·mode/link·기존 source/fault 수용 회귀 |
| `AGENTS.md` | snapshot/independent anchors·새 CLI·GPG 신규 commit 서명 검증 인덱스 |
| `docs/smoke-checklist.md` | 원 앱 hash를 DMG 단계까지 보존하고 최종3 flags로 검증하는 실행 안내 |
| 본 보고서, `mydocs/orders/20261008.md` | 재현/보정·actual/mock 구분·증거·승인 상태 |

## 본문 변경 정도 / 본문 무손실 여부

- 승인 계획 P5의 GPG signature·plan-only 경로·HEAD/index/working mode/blob를 확인했다. 계획은 제품 구현 중 수정하지 않았다. 현재 단계 진행 지시는 구현 승인으로 적용했고, 미래 모든 exact 단계/게시 승인을 포괄한 것으로 간주하지 않았다.
- configured GPG key로 신규 계획 commit을 서명했고 `git verify-commit --raw`의 실제 fingerprint를 검증했다. 이후 허용되는 repository product/final commit에도 서명을 필수 적용한다. 기존 unsigned history를 amend/rewrite하지 않는다. 테스트의 disposable Git fixture commit은 실제 repository publication commit이 아니다.
- 제품6경로와 보고/orders2경로 총8개만 변경한다. package/version/lockfile·entitlement·native signer·원격 no-install/renderer IPC/DB는 변경하지 않았다.
- docs 규칙을 먼저 읽고 이미 선택된 공식 checklist와 기존 AGENTS만 최소 수정했다. 내부 보고는 기존 mydocs/working, 이후 final report/orders도 기존 위치다. 새 제품 문서 루트/매뉴얼/skill을 만들거나 승인 규칙을 우회해 고치지 않았다.
- 역사적 source225 actual signed run·Stage 4 sourceb8/최종0d 수용과 PR 게시 이력은 보존한다. 새 snapshot/P5/source를 old manifest에 소급 생성하거나 source label을 바꾸지 않는다.

## 검증 결과

### 수정 전 재현과 보정

- 실제 disposable Git의 문서-only 후속 commit으로 manifest.sourceCommit과 두 stored approval.sourceCommit만 새 HEAD로 바꾼 사례를 추가했다. 수정 전 verifier가 `verified`를 반환해 **promise resolved instead of rejecting**으로1개 실패했다. 이 실패를 원문 보존했다. signed/Apple/runtime는 mock이며 실제 Git만 native다.
- submit은 승인 hash 재검증 뒤 원 pre-submit bytes를 fixed `approval-app-manifest.json`, `approval-dmg-manifest.json`에 `wx`/0600으로 보존하고 재검증한 뒤 state를 바꾼다. existing/missing/tampered snapshots에 overwrite/reconstruction/fallback하지 않는다. upload 불확실성/재제출 거부 경계는 유지한다.
- `verifySubmissionSnapshots(manifest, manifestPath, options, dependencies)`는 operator가 독립적으로 보존한 approvedAppManifestSha256/approvedDmgManifestSha256을 필수로 받고 원문 hash·prepared state·repository/P/source/identity/profile/keychain/path/artifact/staple/seal·stored tuple을 검사한다. mutable manifest/record에서 trust anchors를 자동 추출하지 않는다.
- 원 앱 승인 snapshot은 pre-staple seal에, DMG snapshot은 동일 stapled app/원 앱 Accepted record·pre-staple DMG hash에 결박된다. 두 snapshot의 hashes와 source를 receipt에 기록하며 native 전에 검증하고 마지막 artifacts/source proof 뒤 다시 검증한다.
- file0600은 소유권 위생이지 immutable 승인 근거가 아니다. 독립 승인 hash가 원문 bytes를 고정한다. source label 세 필드 변경이나 snapshot+mutable hashes 동시 수정으로 그 anchor를 바꿀 수 없다.

### 실행 결과

focused **2 files / 275 passed**, 전체 **31 files / 760 passed**. core **151 passed / 기존 live SSH2 ignored**, helper **25 passed**. 아래12명령 전부 exit0:

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

- freshness epoch를 unsigned build 직전에 캡처해 artifact verifier까지 전달했다. 실제 unsigned normal/원 helper0.2.0/빈 registry/disabled save-list-navigation·기존 guard/helper EACCES fault·가시 UI/탐색성·owned cleanup을 통과했다. signed 보정을 위해 unsigned 탐색/guard/fault 수용을 완화하지 않았다.
- 첫 통합 focused는270pass/5fail이었다. 실패는 missing-anchor 진단의 `approved/SHA-256`과 기존 assertion의 `approval/hash`, 앞당겨진 Artifact hash drift와 기존 final hash 문구 불일치였다. 정확한 실제 오류를 assert하도록 고쳤고 기능/timeout/수용 조건을 완화하지 않았다. 다음275개 모두 통과했다.
- independent read-only reviewer가4개 코드/test를 검토해 **CLEAR, concrete P1/P2 blocker 없음**을 반환했다. 해당 reviewer는 gates/format/sign/network/edit를 실행하지 않았고 parent가 검증했다.
- 기존 source225 manifest/app ZIP/배포 ZIP/DMG hashes와 app seal `bb7d350a22aefb0e6f0652b2bdb45ead280b0929ff72ffbce1e14bf038db6b29`를 재확인했다. 최신 verifier의 역사적 manifest negative 호출은 `Invalid manifest provenance`로 native/Apple/runtime 전에 거부됐다. 이 negative에 사용한 zero64 값은 의도적으로 가짜인 테스트 입력이지 승인 hash로 주장하지 않는다.
- unsigned icon·identity:null signing skip·fault scheduler EACCES·cleanup 종료 출력은 원문 보존했다. 이전 unsigned 가시 UI timeout/Desktop ERR_FAILED의 근본 해결을 주장하지 않는다. JS/Markdown formatter를 새로 도입하지 않았고 두 cargo fmt check와 whitespace 검증을 유지했다.

### 증거

원문은 ignored 로컬 evidence이며 비밀키/credential/binary와 함께 commit하지 않는다.

| .omo/evidence/ 파일 | SHA256 |
|---|---|
| `task-31-stage5-relabel-before.txt` | `0eb87e8332128a8c0a762d96ace875dfa48172d308d7401eddcb58c73078118d` |
| `task-31-stage5-focused-first.txt` | `276b3904f3909ad658182d6002170725539caee71bdde7df71a2102e0c3a539c` |
| `task-31-stage5-focused-second.txt` | `eb03261d62b744b7a130141a680202c66d34776d6723e380fee210b654d81a4d` |
| `task-31-stage5-integration-first.txt` | `9447d841aab60afabd0deace7cbcf74cbb2b88f1f83554727b604bd61d4a412c` |
| `task-31-stage5-historical-boundary.txt` | `038fbfb9ee8478f8a331bddad0641aa6096c9fd374d013ca05846bd118f94c08` |

## 잔여 위험

- 최신 P5/source의 실제 signed run·앱/DMG Apple submit·signed 최종 수용은 미실행이다. 제품 입력과 필수 snapshots/CLI가 바뀌어 새 run이 필요하며 각 app/DMG exact tuple 승인 경계는 유지한다. mock/native Git regression은 새 Apple 성공 근거가 아니다.
- 외부 승인 hashes는 mutable finalized metadata에서 가져오지 않아야 한다. 이를 잘못 자동 추출하는 운영은 trust model을 무너뜨리므로 CLI/docs/인덱스에서 명시적으로 금지했다.
- source proof는 hermetic build/filesystem lock이 아니며 trusted root ignore의 generated/local 데이터와 환경은 별도 경계다. actual signed native/Apple/artifact gate도 여전히 필수다.
- live SSH·OS 알림·물리 키보드/VoiceOver·실제 OS signature-block은 미실행이다. 기존 unsigned/helper 간헐성·Desktop 로딩·dependency 경고 이력은 보존한다.

## 다음 단계 영향

현재 단계 결과·정확한8경로의 GPG signed product commit 승인 뒤 exact SHA·서명을 검증한다. 이후 final report/orders·최신 evidence를 별도 갱신·수용하고 PR #32 fresh exact head/base/title/body를 재검증해 승인된 새 exact OID만 FF/exact-old lease로 push/본문 갱신한다. 원 Task #31 명시 본문 참조·별도 close 예외를 유지한다. merge/close/Release·Apple 제출을 자동 진행하지 않는다.

## 승인 요청

Stage 5 보정·760 tests/actual unsigned 검증·mock 한계·8경로 GPG signed commit 승인. 메시지: `Task #31 Stage 5: 원 승인 manifest snapshot과 독립 hash 결박`. 신규 source commit/push는 아직 실행하지 않았다.
