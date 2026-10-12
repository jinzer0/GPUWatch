# Task #31 Stage 1 — v0.2.0 서명 배포 실행 경계와 회귀 검증

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
구현계획서: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 1
승인 구현계획 commit: `42acefc7cef15c4e7d87b239f2b9634565ffe207`
승인 구현계획 blob: `1a047ae856ff25caf5c7236df9cac6dce6a8bafe`
상태: 구현·최종 자동 검증 통과, 단계 보고/제품 commit 승인 대기. 실제 Developer ID 서명·Apple 제출·Stage 2 미실행.

## 단계 목적

macOS arm64 v0.2.0의 signed 후보 build, 앱/DMG별 승인된 공증 제출, 최종 산출물 검증 경로를 구현하고 원격 부작용 없는 mock/회귀 gate로 검증한다. 인증서 조회·mock Accepted·unsigned 패키지 결과를 실제 signed/notarized 외부 배포 성공으로 표현하지 않는다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `package.json`, `package-lock.json` | v0.2.0, signed pack/dist 명령. 이미 설치된 @electron/osx-sign 1.3.3을 직접 devDependency로 선언; 기존 transitive dependency resolution은 변경 없음 |
| core/helper `Cargo.toml`, 각 `Cargo.lock` | 로컬 프로젝트 version만 v0.2.0. 기존 registry dependency·protocol v1·DB·DTO 불변 |
| `electron/signedRelease.mjs` | 고정 build/prepare-app/submit-app/package/prepare-dmg/submit-dmg CLI, signed-only run과 승인/hash/provenance, native signing·별도 Apple 제출·Accepted/log SHA·staple·strict Gatekeeper 상태 전이 |
| `electron/signedRelease.test.ts` | source/credential/path/hash/state drift·OS/Apple 실패·본래 app 보존과 설치된 native builder identity 계약 회귀 |
| `electron/signPackagedApp.mjs`, `.test.ts` | native osx-sign 위임, 명시적 distribution identity, 정확한 helper만 빈 entitlement·hardened runtime으로 제한, framework 옵션 보존 |
| `build/entitlements.mac.plist`, `build/entitlements.helper.plist` | 앱 JIT-only·helper 빈 dict. library-validation/디버깅/unsigned-executable-memory 권한 확대 없음 |
| `smoke/electron-signed-dist-artifacts.mjs`, `.test.ts` | finalized manifest·실제 hash/signature/Accepted/ticket/ZIP/DMG app 동등성·격리 runtime 검증. source app 보존·소유 mount의 회복/정리, 모든 unit 원격/OS 동작은 mock |
| `smoke/shared/paths.mjs` | signed 명시 app 입력·canonical real app 검증, signed namespace를 unsigned 탐색에서 제외, 모호한 unsigned app 선택 거부 |
| `smoke/scenarios/packaged-app.mjs` | signed의 명시 app/evidence prefix 입력과 기존 no-arg unsigned 경로 유지. explicit run 실패 전파, 기존 disposable fault copy·데이터 격리 재사용 |
| 본 보고서, `mydocs/orders/20261008.md` | 검증/실패 이력과 현재 승인 경계 기록 |

## 본문 변경 정도 / 본문 무손실 여부

- 승인 수행/구현계획을 수정하지 않았고 plan commit/HEAD/index/worktree blob·mode와 ancestor/Stage 1 HEAD 결박을 확인했다.
- Electron runtime UI·preload/IPC·Rust 수집/DB/unknown-null 의미와 no-install SSH는 변경하지 않았다.
- 원 worktree의 devel commit 및 BMad 등 사용자 status가 시작 baseline과 동일함을 확인했다. main worktree와 기존 backup/evidence를 수정하지 않았다.
- README/공식 checklist/AGENTS는 승인된 Stage 3에서 실제 결과 기준으로 갱신하므로 이번 Stage 1에서는 그대로다. 기존 unsigned 안내가 여전히 정확하며 새 signed 명령의 실패·준비 상태는 본 보고/구현계획에 명시한다.
- JS formatter 설정/명령은 저장소에 없으므로 새 formatter 정책/의존성을 추가하지 않았다. 두 Rust crate의 기존 cargo fmt check와 diff whitespace 검증은 통과했다.

## 검증 결과

### 최종 재검증

아래 12명령을 최신 코드에서 승인 plan 결박 확인 후 실행했고 모두 exit0였다. unsigned build 시작 직전 freshness 값을 캡처해 그 build의 DMG·ZIP만 확인했다.

```bash
npm run test -- --run electron/signedRelease.test.ts electron/signPackagedApp.test.ts smoke/electron-signed-dist-artifacts.test.ts
npm run test -- --run
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
cargo fmt --manifest-path crates/gpuwatcher-core/Cargo.toml -- --check
cargo fmt --manifest-path crates/gpuwatcher-helper/Cargo.toml -- --check
npm run build
npm run electron:build
npm run helper:build
npm run electron:dist:unsigned
node smoke/electron-unsigned-dist-artifacts.mjs
git diff --check
```

| 주제 | 관측 결과 | 판단 |
|---|---|---|
| focused signed driver/signer/artifact | 3 files / 185 tests passed | OK, mock·native identity cache 기반. 실제 서명/Apple 제출 아님 |
| 전체 Vitest | 30 files / 609 tests passed | OK. 기존 renderer/Electron/실제 local debug helper integration 포함 |
| Rust core | 151 passed, 기존 live SSH 2 ignored | OK. live SSH를 실행하지 않았고 기존 ignored gate 유지 |
| Rust helper | 25 passed | OK. debug helper가 Vitest integration에 사용 가능함도 확인 |
| renderer/Electron/helper release build | 각 exit0 | OK |
| unsigned arm64 DMG·ZIP | 최신 build 2파일; ZIP extraction·DMG mount·helper 실행 권한·ad-hoc/no Team 확인, 임시 extraction 제거·volume detach | OK, 내부 테스트용. Developer ID·공증 성공 근거가 아님 |
| 원본/namespace 안전 | signed/unsigned 분리·소스 app seal 보존·escape/복수 후보 거부·uncertain mount probe 실패 시 삭제하지 않음 | OK, signed 실제 OS 경로는 다음 단계에서 확인 |

npm ci는 이 전용 worktree의 locked 의존성 설치로 실행했다. core/helper metadata·npm/Cargo lock을 대조했으며 npm 기존 package entry가 새로 추가/변경되지 않고 direct devDependency 선언과 프로젝트 버전만 변경됐음을 확인했다.

### 발견·재현·보완 이력

1. 최초 driver/signer focused 115 tests, 이후 3파일 focused 184와 전체 608·빌드/unsigned gate가 통과했다. 이 결과는 보완 전 기록이며 최종 수치 대신 사용하지 않는다.
2. 독립 read-only native integration 검토에서 **P1 — electron-builder에 full Developer ID CN을 넘겨 prefix rejection이 발생**하는 문제를 발견했다. signing mock만으로는 native qualifier 계약을 충분히 검증하지 못했다.
3. 설치된 `app-builder-lib`의 실제 `findIdentity`를 사용하되 exported identity cache를 fixture로 고정해 OS 인증/서명/업로드 없이 회귀를 추가했다. 수정 전 해당 focused case는 exit1 / 1 fail, `Please remove prefix "Developer ID Application:"` 오류를 재현했다. filter로 제외된 다른 case는 최종 전체 gate에서 모두 실행했다.
4. 앱 후보와 prepackaged DMG 두 builder call에 사전 검증된 certificate SHA1을 넘기도록 수정했다. manifest/approval/signature 검증에는 full CN·Team ID를 그대로 유지한다. helper는 명시적 mac.binaries 경로이며 per-file native signer를 사용한다.
5. 보완 후 최종 focused 185 / 전체 609 및 위 12명령 모두 통과했다. read-only 재검토 결과 해당 P1 해결·검토 범위 잔여 blocker 없음. reviewer는 테스트/서명/네트워크를 실행하지 않았으며 실제 gate는 parent가 수행했다.

### 증거

- 최종 원문: `.omo/evidence/task-31-stage1-final-verification.txt`
  - SHA256: `7be4fe891ec13d9eb26034517f39e80d1ce363443b4c65157225d3575e5529e1`
- native selector 수정 전: `.omo/evidence/task-31-stage1-native-identity-before.txt`
  - SHA256: `5e5a0603ae5e002f92dd2b1b686cd10e4aab1c048684ede1ff616b1ef1f6a1d0`
- 보완 전 focused/전체/Rust 기록은 `.omo/evidence/task-31-stage1-{driver-signer-focused,signing-focused,integration,rust}.txt`에 당시 결과로 보존한다.
- 증거는 ignored 로컬 자료다. Git에는 원문 log·산출물·인증정보를 stage하지 않으며 본 보고서에 결과/위치를 기록한다.

## 잔여 위험

- 실제 Developer ID private key 접근, native signing, JIT-only/빈 helper entitlement의 OS startup 검증은 아직 없다. profile 인증 성공은 이를 대체하지 않는다.
- 실제 Apple app ZIP/DMG Accepted·log uploaded SHA·staple·Gatekeeper·signed package smoke는 미실행이며 Stage 2의 별도 hash tuple 승인 후만 수행한다.
- 생성한 v0.2.0 DMG/ZIP은 **unsigned 내부 테스트용**이다. signed/notarized·GitHub 업로드·production/external release-ready로 주장하지 않는다.
- 기본 Electron icon 및 identity:null로 signing skipped 출력 유지. npm ci의 glob7 deprecated/보안 경고와 electron-winstaller/esbuild/fsevents install-script 차단 경고도 숨기지 않았다. install-script 정책을 우회하지 않고 이번 build/gate는 통과했다. dependency resolution/security 보정 작업을 임의로 섞지 않았다.
- 기존 helper timeout PID assertion 간헐성은 원인 수정 범위 밖이다. 이번 최종 전체 609는 통과했지만 과거 간헐 이력을 없애지 않는다.
- signed driver가 고정 approved plan/source와 clean tree를 요구하므로 Stage 1 제품 commit 전 실제 candidate build를 실행할 수 없다. artifact source commit과 최종 release commit의 차이는 후속 단계에서 검증한다.
- mount ownership 조회나 detach 실패 시 안전하게 해당 run-owned 임시 tree를 남기고 실패한다. 무조건 force 삭제로 성공을 만들지 않는다.
- packaged smoke의 외부 evidence log prefix는 Task31로 분리했지만 내부 기존 Task29 screenshot 이름은 유지했다. 실제 OS 입력·VoiceOver·GUI SSH/OS 알림 성공 근거는 여전히 아니다.

## 다음 단계 영향

- Stage 1 report/제품 commit 승인 → exact stage commit 기록 → Stage 2 진입 승인 순서를 따른다.
- Stage 2에서 실제 identity/Team ID/profile를 고정해 signing-only app을 만들고 제출 ZIP tuple을 준비한다. app/DMG 각각 hash-bound Apple 제출 승인이 필요하다.
- 실제 package 검증 실패 시 계획/코드를 승인된 경계에서 보완하고 새 source/hash 결박으로 재검증한다. warn-only/unsigned fallback·과거 Accepted 재사용을 금지한다.
- GitHub task publication/merge/close와 devel → main release/tag/Release는 아직 실행하지 않았으며 별도 승인이다.

## 승인 요청

- 이 Stage 1 결과·보완 이력·검증 한계에 대한 승인.
- 승인된 제품/테스트/entitlement 파일 16경로와 본 보고서·orders 2경로만 포함하는 `Task #31 Stage 1: v0.2.0 서명 배포 실행 경계와 회귀 검증` commit 승인.
- Stage 2 진입은 다음 별도 승인으로 요청하며 현재 승인에 포함하지 않는다. 실제 서명·Apple 제출은 미실행이다.
