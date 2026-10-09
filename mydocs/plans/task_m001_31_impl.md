# Task #31 — 서명·공증 및 외부 배포 준비 구현계획서

수행계획서: [`task_m001_31.md`](task_m001_31.md)
GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
마일스톤: M001
작성일: 2026-10-08
상태: 원계획 승인·Stage 1 완료, Stage 2 signed runtime smoke 실패 보존. Stage 2.1 보정안 내용 승인 대기, 보정 제품 수정 미착수
수행계획 기록 commit: `11e79f7e05e9ce22185be7bb3445a60ada75e6ea`
수행계획 blob: `d8f3f56b7b01968970d690dc8056806e028bf41a`
작업 위치: `/Users/kjy/Desktop/Codes/projects/GPUWatch-task31`, `local/task31`

## 단계 개요

| Stage | 제목 | 주요 산출 | 검증 |
|---|---|---|---|
| 1 | v0.2.0·서명/공증 실행 경계 | 버전·lockfile, signed driver와 signer, 최소 entitlements, signed smoke·unit tests | focused/전체 Vitest, Cargo, 빌드, unsigned 회귀, remote 제출 없는 mock gate |
| 2 | 실제 서명·Apple 공증·패키지 수용 | signed app/DMG/ZIP, exact 제출 입력, Accepted·ticket·hash evidence | 앱/helper/DMG 서명, arm64/version, spctl/stapler, 격리 packaged smoke |
| 2.1 | signed smoke 보정·실제 검증 재개 | 서명 보존 startup·fault 분리·최신 plan 결박, 보정 단계 보고 | mock/전체 회귀·unsigned 보존, 별도 승인된 새 source/run의 실제 signed gate |
| 3 | 문서·통합 수용·배포 준비 보고 | 기존 README/체크리스트/AGENTS, 단계·최종 보고 | 전체 gate, 최종 artifact 재검증, 문서 경계·provenance 확인 |

Stage 1에 실제 Stage 2 실행 driver·검증기와 mock 테스트까지 포함한다. Stage 2에서 미커밋 제품 코드를 사용해 원격 제출하지 않도록 Stage 1 제품 commit에 빌드·검증 경로를 고정한다. Stage 2는 승인된 코드로 실제 artifact를 만들고 검증하는 단계다. 아래 Stage 2.1은 발견된 검증기 결함을 보완하기 위한 별도 승인 경계이며 원 Stage 1/Apple 승인 기록을 소급 변경하지 않는다.

## 문서 위치 확인

| 파일 | 수행계획서상 선택 위치 | Stage 산출물 경로 | 일치 여부 | 비고 |
|---|---|---|---|---|
| README | 기존 루트 README | `README.md` | OK | 현재 v0.1.0 다운로드 사실 보존, v0.2.0 준비와 실제 발행 구분 |
| 공식 검증 안내 | 기존 docs | `docs/smoke-checklist.md` | OK | signed/unsigned gate와 실제 OS 검증 한계 |
| 에이전트 빌드 인덱스 | 기존 루트 | `AGENTS.md` | OK | 신규 명령·검증 경계만 갱신 |
| 내부 작업 산출물 | mydocs 역할별 폴더 | 본 문서, `mydocs/working/task_m001_31_stage{N}.md`, `mydocs/report/task_m001_31_report.md`, `mydocs/orders/20261008.md` | OK | 제품 문서를 mydocs/manual에 만들지 않음 |

## 공통 설계와 실행 계약

### 설치 dependency 확인 결과

- 기존 `electron-builder`/`app-builder-lib`는 `mac.binaries`, hardened runtime, `mac.sign` callback와 per-file signing 옵션을 지원한다.
- 설치된 `@electron/osx-sign`은 1.3.3이다. custom callback에서 직접 import하는 경우 이 기존 라이브러리를 동일 버전의 직접 devDependency로 명시한다. 자체 codesigning 구현은 만들지 않는다.
- app-builder-lib는 `APPLE_KEYCHAIN_PROFILE`/선택적 `APPLE_KEYCHAIN`을 지원하지만 인증 누락이면 공증을 warn-only skip할 수 있다.
- non-MAS `prepackaged` target 생성은 app을 재패킹/재서명하지 않고 배포 포맷을 만든다. stapled app의 바이트를 바꾸지 않는 DMG 생성에 이 경로를 이용한다.
- 기존 packaged smoke는 `release/electron` 자동 탐색과 task29 evidence 이름을 사용한다. signed run의 명시적 app/evidence 입력을 추가하되 기존 unsigned 기본 경로는 유지하고 첫 번째 app을 임의 선택하지 않는다.

### 의도적인 서명/공증 단계 분리

`electron:pack:signed`는 **서명만 된 공증 전 후보**를 생성한다. 자동 공증을 이 명령에서 활성화하지 않는다. 이는 missing credential fallback이 아니라 Apple 업로드 전에 exact artifact hash를 승인받기 위한 명시적 단계다. 빌드 성공을 외부 배포 가능 상태로 표시하지 않는다.

앱 공증용 ZIP 생성 → exact 입력 승인 → Apple 제출·Accepted → 앱 staple·검증 → 그 app으로 배포 ZIP/DMG 생성 → DMG exact 입력 승인 → DMG 제출·Accepted·staple → 최종 검증 순서다. Apple 제출에는 기존 `notarytool` CLI와 Keychain profile을 사용하며 electron-builder의 자동 submit과 중복 실행하지 않는다.

### driver와 artifact 경계

- `electron/signedRelease.mjs` 하나가 signed build·제출 입력 준비·승인된 제출·staple·배포 포맷 생성의 CLI와 검증 가능한 pure helpers를 제공한다. 하위 동작은 고정된 action만 허용한다. shell 문자열 실행/eval 및 임의 command dispatch는 금지한다.
- signed 출력은 `release/electron/signed/`의 새 run 디렉터리로 분리한다. run은 생성 시 timestamp+고유 이름을 부여하고 다른 run/기존 파일을 덮어쓰지 않는다. app은 run 안에서 정확히 하나 탐색하고 경로·종류·symlink·버전·아키텍처·signature를 검증한다.
- run manifest는 JSON이며 source commit, 앱 version/arch, Team ID, profile 참조, app file manifest, 제출 ZIP/DMG hash, request ID/Accepted, staple 전후 hash, 최종 ZIP/DMG hash와 시각을 포함한다. 최초·중간·최종 상태를 구분하고 실패를 성공 상태로 덮어쓰지 않는다.
- 제출 ZIP과 최종 DMG는 승인된 SHA-256과 실제 제출 파일이 일치해야 한다. app ZIP은 무변경 서명 app으로 `ditto` 생성하며 앱 공증용 중간 ZIP과 사용자 배포 ZIP을 구분한다.
- `notarytool submit --wait --output-format json --keychain-profile` 결과의 정상 exit, request ID, `Accepted`를 모두 검증한다. 정상 exit여도 Invalid/In Progress이면 실패한다. 이후 해당 ID `info`/필요한 `log`를 조회하며 credentials는 출력하지 않는다.
- 외부 command는 argv 배열, 제한된 timeout, exit/signal 검사로 실행한다. notarytool 제출은 최대 1800초, 검증·mount·smoke는 명시된 개별 timeout을 사용한다. 무한 retry/자동 재제출은 없다. Accepted 이전 timeout은 ID가 확인되면 read-only info로 상태를 재확인하고, 불확실하면 재제출 대신 중단한다.
- stapling은 artifact 바이트를 바꾸므로 제출 hash와 최종 배포 hash를 따로 기록한다. `stapler validate`와 Gatekeeper를 통과한 app으로 ZIP을 생성한다. ZIP 자체를 staple하지 않는다.
- DMG는 electron-builder prepackaged app과 DMG signing을 사용하고 app의 staple·file manifest가 포맷 생성 중 유지됐는지 확인한다. 최종 DMG는 별도 공증·staple 후 hash를 기록한다.
- manifest만 신뢰하지 않는다. 실제 파일·codesign·version·arch·공증 ID·ticket·최종 hash를 재조회한다. mock receipt나 이전 run Accepted는 실제 수용 근거가 아니다.

### 서명 정책

- 유효한 Developer ID Application certificate를 실행 입력으로 지정하며 ad-hoc/개발용 identity와 코드서명 자동 탐색 실패는 중단한다. `forceCodeSigning: true`, hardened runtime, timestamp·strict verify를 사용한다.
- 기존 unsigned `package.json.build`를 기반으로 signed config에서 identity/sign/null과 출력·target을 명시적으로 대체한다. unsigned/dev 명령의 의미는 유지하며 signed config에는 silent fallback이 없다.
- `electron/signPackagedApp.mjs`는 electron-builder가 제공한 native signing options를 `@electron/osx-sign`에 위임한다. helper의 정확한 bundled 경로만 per-file 옵션을 좁혀 빈 entitlement plist를 적용하고 나머지 Electron app/framework 옵션을 보존한다. helper가 발견되지 않거나 예상 경로 밖이면 실패한다.
- `build/entitlements.mac.plist`는 현대 Electron의 JIT에 필요한 `com.apple.security.cs.allow-jit`만 초기 허용한다. helper는 `build/entitlements.helper.plist`의 빈 dict를 사용한다. get-task-allow, 전역 disable-library-validation, 임의 unsigned executable memory 허용을 테스트 통과용으로 추가하지 않는다. 실제 OS에서 추가 entitlement가 필수로 확인되면 근거와 계획 변경 승인을 받는다.
- codesign로 앱과 helper의 Developer ID/Team ID 일치, helper/실행파일 arm64, hardened runtime, entitlements를 확인한다. renderer contextIsolation/nodeIntegration·preload action 계약은 변경하지 않는다.
- Keychain profile은 명시적인 `APPLE_KEYCHAIN_PROFILE` 실행 입력으로 받고 이번 로컬 검증의 후보는 `gpuwatcher-notary`다. `CSC_LINK`/키 암호·APPLE_ID/password/API key 계열이 동시에 공급되면 다른 인증 경로를 adopt하지 않고 거부한다. 선택적 Keychain은 실행 입력에 포함한다.

### 원격 제출 승인 tuple

각 Apple 제출 직전에 read-only preparation으로 다음 전부를 출력하고 same-thread 승인을 받는다. 앱용 ZIP과 DMG는 생성 시점이 달라 별도 tuple이다.

- action: `submit-app-zip-and-staple-app` 또는 `submit-dmg-and-staple-dmg`.
- host `github.com`, repository `jinzer0/GPUWatch`, repository_id `1256824919`, issue_number `31`.
- 작업지시자가 확인한 최신 구현계획 commit OID, product/source commit OID, run manifest path/hash.
- version `0.2.0`, arch `arm64`, Developer ID identity/Team ID, Keychain profile/선택적 Keychain.
- 실제 제출 artifact의 canonical path와 SHA-256, app tree/file manifest hash.
- target `Apple notarization service`, 해당 제출·Accepted 대기·필요한 read-only info/log·허용된 artifact staple·검증 범위.

제출 직전에 같은 입력을 다시 검증한다. source/파일/hash/identity/profile/manifest가 바뀌면 실행하지 않고 새 tuple을 준비한다. 이 승인은 GitHub upload/PR/merge/tag/Release 권한이 아니다.

## Stage 1 — v0.2.0·서명/공증 실행 경계

### 산출물

신규:

- `electron/signedRelease.mjs`, `electron/signedRelease.test.ts`.
- `electron/signPackagedApp.mjs`, `electron/signPackagedApp.test.ts`.
- `build/entitlements.mac.plist`, `build/entitlements.helper.plist`.
- `smoke/electron-signed-dist-artifacts.mjs`, `smoke/electron-signed-dist-artifacts.test.ts`.
- `mydocs/working/task_m001_31_stage1.md`.

수정:

- `package.json`, `package-lock.json`.
- `crates/gpuwatcher-core/Cargo.toml`, `crates/gpuwatcher-core/Cargo.lock`.
- `crates/gpuwatcher-helper/Cargo.toml`, `crates/gpuwatcher-helper/Cargo.lock`.
- `smoke/shared/paths.mjs`, `smoke/scenarios/packaged-app.mjs`의 explicit app/evidence 입력만.
- `mydocs/orders/20261008.md`.

### 변경 내용

- npm/core/helper 프로젝트 버전 v0.2.0 정합성, 기존 protocol/DTO/DB version 불변. 기존 Rust 의존성 업데이트를 섞지 않는다.
- npm `electron:pack:signed`: renderer/Electron/release helper build 뒤 signed driver `build` 동작. `electron:dist:signed`: 이미 서명·공증·staple 검증된 명시적 run/app으로 배포 포맷 준비. 새 driver의 제출 동작은 이 일반 build 명령에서 자동 호출하지 않는다. 기존 dev/pack/unsigned 명령은 내부 테스트 경로 그대로다.
- signed config, certificate/profile/auth 충돌 사전 검증, native signer·helper 최소 권한, 임시 run·file manifest·version/arch/signature 검증.
- Apple submit/Accepted/staple 및 DMG/ZIP 진행 상태를 실제로 처리하는 동작을 구현한다. 미완성 stub/TODO/fake success를 넣지 않는다. Stage 1에서는 injected command/builder mock으로 실행 결과·실패를 시험하고 실제 signing/submit은 Stage 2로 남긴다.
- signed smoke는 run의 explicit manifest/artifact를 받고 실제 app/helper·DMG·ZIP을 검증한다. 임시 extraction/mount는 소유권과 위치를 검증하며 finally에서 해당 생성물만 제거·unmount한다.
- packaged smoke의 기존 unsigned 자동 탐색과 task29 evidence 기본값은 기존 호출에서 유지한다. signed 입력은 canonical validated app 하나와 task31 evidence prefix를 사용한다. 실제 signed app을 손상시키는 helper fault injection은 disposable copy에서만 수행한다. 서명 무효화된 copy의 실행이 OS에서 차단되면 backend 정상 실패 검증과 혼동하지 않는다.

### 관찰 가능한 테스트

- missing/whitespace/ad-hoc/development identity, 없는 profile, 다른 credential 방식 혼입, 지원하지 않는 arch/action, 서명 실패·app/helper 누락·잘못된 mode/Team ID/entitlement에 실패.
- app candidate 0개/복수, symlink/path escape, version 불일치, 기존 output 재사용, 승인 tuple/hash drift에 실패하며 submit이 호출되지 않음.
- notarytool exit/signal/JSON 오류, Invalid/In Progress, Accepted 누락·다른 request ID, timeout·불확실 상태를 성공으로 처리하지 않음. 자동 재제출 없음.
- staple/spctl 실패, submission/최종 hash 혼동, stale manifest, ZIP 안의 unsigned/다른 app, DMG mount·복수 app·helper/arch 오류를 검출.
- 실패 중 mount/extraction 정리, native signer per-file helper 옵션과 다른 framework 옵션 보존, signed/unsigned namespace와 원본 app 보존.
- 기존 unsigned codesign assertion을 완화하거나 테스트를 skip하지 않음. mock tests가 실제 Apple/OS 성공 증거가 아님을 단계 보고에 기록.

### 검증

```bash
npm ci
npm run test -- --run electron/signedRelease.test.ts electron/signPackagedApp.test.ts smoke/electron-signed-dist-artifacts.test.ts
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
git diff --check
```

unsigned artifact gate는 빌드 시작 직전 `GPUWATCHER_ARTIFACT_STARTED_AT_MS`를 캡처해 그 빌드의 출력만 검증한다. version/lockfile·native signing option·entitlement plist 검증도 focused tests에 포함한다. 실제 signing/Apple submit은 실행하지 않는다. npm audit/install warning은 숨기거나 tests를 축소하지 않는다.

### 커밋

```text
Task #31 Stage 1: v0.2.0 서명 배포 실행 경계와 회귀 검증
```

제품·테스트·Stage 1 보고/orders만 exact 경로로 묶으며 구현계획서를 다시 포함하지 않는다. 검증·단계 보고·commit은 명시 승인 범위에만 수행한다.

## Stage 2 — 실제 서명·Apple 공증·패키지 수용

### 산출물

- Stage 1의 immutable 코드에서 생성된 `release/electron/signed/<run>/` app·제출 ZIP·DMG·최종 ZIP과 manifest.
- ignored `.omo/evidence/`의 signing/Apple response/OS 검증·mount/extraction·packaged smoke receipt. 개인키·암호는 포함하지 않는다.
- `mydocs/working/task_m001_31_stage2.md`, `mydocs/orders/20261008.md`.

### 변경 내용

1. 최신 승인 구현계획 SHA와 blob 결박, Stage 1 제품 commit·깨끗한 task working tree 확인. read-only identity/profile/tool 조회 후 실행 identity/Team ID를 고정한다.
2. `CSC_NAME`에 실제 검증된 identity, `APPLE_KEYCHAIN_PROFILE=gpuwatcher-notary`를 명시해 `npm run electron:pack:signed` 실행. 앱/helper strict signature, entitlements, arm64, Info.plist v0.2.0을 검증한다. 이 단계는 공증 전 후보이며 Gatekeeper 성공을 주장하지 않는다.
3. driver의 app 제출 준비 동작으로 app ZIP·hash·manifest와 exact tuple을 출력한다. 승인 전 `notarytool submit`은 실행하지 않는다.
4. 승인 tuple 재검증 후 driver의 app 제출·Accepted·staple 동작을 실행. `codesign --verify --deep --strict`, 앱/helper 상세 signature, `xcrun stapler validate`, `spctl --assess --type execute`의 정상 결과를 확보한다.
5. 그 검증된 stapled app으로 `electron:dist:signed`의 명시적 run 입력을 사용해 ZIP과 Developer ID 서명 DMG를 생성한다. app은 재패킹/재서명하지 않는다. helper/app manifest와 ZIP 내부 app을 대조한다.
6. DMG 제출 준비 tuple의 별도 승인 후 DMG submit·Accepted·staple을 실행한다. DMG codesign/stapler 및 `spctl --assess --type open --context context:primary-signature`를 검증한다.
7. `node smoke/electron-signed-dist-artifacts.mjs --manifest <canonical run manifest>`로 최종 DMG mount·ZIP extraction의 앱/helper를 검증하고 격리 packaged smoke를 실행한다. 코드의 실제 CLI는 위 고정 action/입력 계약을 유지하며 실행 receipt에는 모든 실제 argv/path/hash를 기록한다.
8. 최종 DMG/ZIP·app provenance·결과·한계를 기록한다. stage 전체 수용 전 코드 보완이 필요하면 해당 실패/계획변경을 보고하고 승인된 구현계획 변경 및 exact SHA 확인 후 보완한다.

### 검증

- codesign verify/Developer ID·Team ID·runtime·entitlement 실제 출력.
- app executable/helper `file`·Mach-O arch·Info.plist version 및 실제 helper envelope 동작.
- app ZIP·DMG 각각의 제출 전 hash와 request ID/Accepted JSON, staple 전후 artifact hash 구분.
- app·DMG `stapler validate`, app `spctl --type execute`, DMG `spctl --type open --context context:primary-signature`.
- ZIP extraction과 DMG mount에서 한 개의 동일 app·helper/버전/arch·signature·ticket 확인 및 최종 DMG/ZIP SHA-256.
- 격리된 app startup·실제 로컬 helper resolution 및 disposable fault smoke. 원격 SSH 성공·실제 OS 입력/알림 성공은 별도 미검증으로 표시.
- source app과 production DB·사용자 파일 무변경, 임시 mount/extraction·프로세스 정리, `git diff --check`.

### 커밋

```text
Task #31 Stage 2: arm64 앱과 배포 패키지 서명 공증 수용 검증
```

실제 검증이 모두 통과한 뒤 Stage 2 report/orders만 commit한다. 바이너리·credential·개인키·ignored 원문 evidence를 git stage하지 않는다. 단계 commit/다음 단계는 별도 승인이다.

## Stage 2.1 — signed runtime smoke 보정안

### 기존 승인과 실제 실패

- 원계획 commit `42acefc7cef15c4e7d87b239f2b9634565ffe207`, Stage 1 제품 commit `03e0c22e5c9c2350cdf49f13037f09502d931bca`와 그 시점의 승인/검증 결과를 보존한다.
- 기존 앱 공증 `aa059898-23d3-4be2-bbe8-cf2353c072f6`, DMG 공증 `be26d136-0042-4b5c-8fed-c5275f423fc7`는 실제 Accepted·staple·Gatekeeper까지 통과했다. 기존 app seal `3125d872b43bd46bf636fac83ae6e3ecf132cb84b2fda09cf19d740d534290ea`, 최종 DMG `b515b138a87b8f68f55e3c00a73cf27b75d1f818d87f41d3d64f2c5f11401cac`, ZIP `5efacfae89d8f595b34a6e105e44b8998f32e731c8ee4c085ce9e07eb8d9b2cb`를 당시 성공 범위로만 기록한다.
- 전체 signed artifact smoke는 exit1이다. 기존 startup이 disposable copy의 helper를 `.real`로 옮긴 뒤 guard 스크립트로 교체한다. 실제 strict codesign은 교체 전 exit0, 교체 후 exit1(`a sealed resource is missing or invalid`); 해당 startup은 SIGKILL과 CDP timeout을 관측했다. 이 결과는 backend helper 오류 수용 또는 정상 signed startup 성공이 아니다.
- 원래 Desktop worktree 위치의 unmodified app 직접 실행은 renderer ERR_FAILED/blank UI였다. 이유를 TCC/entitlement로 확정하지 않는다. 원 helper·동일 app seal/signature/ticket을 보존한 canonical 임시 복사본에서는 UI·action-specific bridge·실제 helper v0.2.0·빈 registry가 통과했다. 권한 확대나 제품 UI 수정의 근거로 사용하지 않는다.
- 증거: `.omo/evidence/task-31-stage2-partial-status.json`, SHA256 `5aa8b6e82b9b2712b0160d977824734d80ed80d8c3c79474c0a2b60de322252b`. 연결된 실패/진단/OS 원문을 지우거나 최종 성공으로 덮어쓰지 않는다.

### exact 산출물과 문서 위치

| 파일 | 변경 범위 |
|---|---|
| `smoke/scenarios/packaged-app.mjs` | 명시적 signed/unsigned 검증 모드·시나리오 전달. no-arg unsigned 기본 유지 |
| `smoke/scenarios/packaged-app/startup.mjs` | signed는 canonical 서명/ticket 보존 복사본과 원 helper만 사용; unsigned guard 경로 분리 |
| `smoke/scenarios/packaged-app/helper-error.mjs` | signed disposable nonexec fault의 실제 signature/OS 상태와 backend 오류를 구별; 기존 unsigned 수용 보존 |
| `smoke/scenarios/packaged-app/evidence.mjs` | signed/unsigned·서명 무변경/의도적 fault·guard 사용 여부와 관측 결과를 사실대로 표기 |
| `smoke/electron-signed-dist-artifacts.mjs` | signed 모드 전달과 runtime receipt 수용; 원본/ZIP/DMG/hash/Apple/OS 검증은 유지 |
| `smoke/electron-signed-dist-artifacts.test.ts` | 모드 전달·잘못된 signed 수용·실패 전파·source seal 보존 회귀 |
| `smoke/scenarios/packaged-app.test.ts` | 신규 Node mock 회귀: signed 무교체·canonical copy·검증 전 launch 거부·fault 분류·unsigned guard·cleanup |
| `electron/signedRelease.mjs` | `APPROVED_PLAN_OID`를 단독 commit·exact SHA 확인된 최신 보정 계획으로 갱신하는 한 항목만 변경. 검증 완화/옛 plan fallback 금지 |
| `mydocs/working/task_m001_31_stage2.1.md` | 기존 mydocs/working 내부 단계 보고 위치: 보정 실패/결과·검증·제품 commit 승인 요청 |
| `mydocs/orders/20261008.md` | 타스크는 진행중 유지, 보정 및 실제 Stage 2 재진입 승인 상태 기록 |

제품 문서 위치 선택은 원계획 그대로다. 이번 단계는 위 8개 검증/plan 결박 코드와 2개 내부 작업 문서만 수정한다. 패키지/version/lockfile·React/Electron runtime/preload/IPC·Rust/DB·native signer·entitlement·제출 알고리즘 변경은 범위 밖이다. 추가 파일/권한/제품 입력 보완이 필요하면 다시 계획 내용 승인을 받는다.

### 변경 계약

1. 같은 스레드의 이번 승인은 이 보정안 작성만 허용했다. 보정 내용 승인·이 계획 한 파일 단독 commit 승인·새 exact SHA 확인/Stage 2.1 구현 승인 전에 제품 소스·테스트·바이너리를 바꾸지 않는다.
2. 검증 모드는 명시적으로 구분한다. signed 정상 startup은 격리된 canonical temp HOME/data/cwd·app copy를 사용하며 source/copy app seal과 실제 codesign/stapler를 launch 전에 확인한다. helper rename·guard 삽입·chmod 등 정상 bundle 변경은 금지한다. 원본 signed app은 read-only 검증/복사에만 사용하고 직접 launch/변경하지 않으며 production DB는 접속/변경하지 않는다.
3. signed 정상 startup에서도 기존 UI save/list/navigation 검증과 action-specific bridge/실제 helper envelope를 실행한다. 등록할 test host는 `smoke.invalid`·enabled=false로 고정한다. guard action 목록을 꾸미지 않고 실제 저장 후 disabled 상태를 확인한다. mock/DOM/CDP를 실제 SSH·OS 입력·알림 성공으로 표현하지 않는다.
4. unsigned 정상 startup의 guard와 기존 fault/error·UI 수용 assertion을 그대로 보존한다. signed 지원을 이유로 unsigned 검증을 약화하거나 건너뛰지 않는다.
5. signed nonexec fault는 별도 disposable copy에서만 만든다. 파일 교체/재서명/새 entitlement/원본 변경을 하지 않는다. fault 전후 실제 signature와 launch 결과를 기록한다. 앱 실행이 가능하면 structured helper error와 기존 UI 오류/탐색성을 검증한다. OS 차단·SIGKILL·CDP 미준비는 명시적 OS fault 결과로 분리하고 backend 수용 성공으로 바꾸지 않는다. 단순 timeout/불명확한 종료를 OS fault 성공으로 허용하지 않으며 전체 gate를 실패시키고 진단한다.
6. 공통 evidence의 기존 hardcoded unsigned/task29/first-match 표현을 모드와 실제 explicit discovery에 맞춘다. signed 정상 결과에는 guard를 사용하지 않았음·launch 전 copy 검증·실제 UI/helper와 source 무변경을 기록한다. 임의 성공 receipt·empty placeholder·다른 run 증거 재사용은 금지한다.
7. 모든 실제 command는 argv 배열·bounded timeout·exit/signal 검사다. mock 테스트에서 실제 signing/Apple/SSH/GUI를 호출하지 않는다. subprocess/CDP/temp copy/HOME/data 정리는 finally에서 소유한 대상만 수행하며 cleanup 오류는 성공으로 무시하지 않는다.

### provenance와 실제 Stage 2 재개

- 최신 보정 plan은 별도 승인된 새 commit P로 고정한다. 원 계획/기존 manifest의 승인 CID를 임의 변경하지 않는다. 기존 driver의 원계획 blob 검증을 우회하거나 두 plan을 동시에 허용하는 호환 경로를 넣지 않는다.
- 보정 source에는 driver의 단일 `APPROVED_PLAN_OID=P` 갱신을 포함하고, P의 plan-only 경로·mode/blob·index/working 동일성·ancestor를 기존과 같은 강도로 검증한다. 나머지 signing/submit 코드와 native callback은 변경하지 않는다.
- 보정 source/tests/Stage 2.1 report/orders 총 10경로의 검증 및 commit 승인을 먼저 받는다. 생성된 보정 제품 commit C의 exact SHA 확인과 실제 Stage 2 재개 승인은 다시 별도 요청한다. 미커밋 검증기로 실제 제출하지 않는다.
- 재개 후 P/C에 결박된 **새 signing run**을 생성한다. 기존 성공 run은 역사적 증거로 그대로 보존하며 새 source/P의 최신 수용으로 재라벨하지 않는다. 이는 실패/불확실한 Apple 요청의 자동 retry가 아니다.
- 새 app ZIP·DMG는 각각 새 canonical artifact/manifest SHA·app seal·P/C·identity/Team/profile tuple을 출력하고 같은 스레드에서 별도 승인받은 뒤만 제출한다. 이번 계획 내용/구현/Stage 2 재개 승인에 Apple 제출 승인을 포함하지 않는다.
- 기존 run을 이용한 검증기 진단은 read-only/소유 temp copy에 한정하며 Stage 2 최종 수용을 대신하지 않는다. 최신 driver가 옛 manifest를 거부하는 검증을 완화하지 않는다.

### 검증 및 수용

```bash
npm run test -- --run smoke/scenarios/packaged-app.test.ts smoke/electron-signed-dist-artifacts.test.ts electron/signedRelease.test.ts electron/signPackagedApp.test.ts
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

- Vitest의 local helper integration 전에 debug helper가 최신 source에서 build됐는지 확인한다. unsigned freshness 값은 해당 build 직전 캡처해 artifact gate에 전달한다. 185/609 등의 과거 통과 수치를 보정 후 결과로 사용하지 않는다.
- mock에서는 signed 무교체/원 helper, canonical copy, copy seal/signature/ticket 실패 시 launch 미호출, backend error와 확정 OS fault/불확실 timeout 구별, unsigned 기존 guard 유지, cleanup 실패·원본 byte/mode 불변을 검증한다.
- 실제 재개 후 새 P/C manifest로 Stage 2의 app/DMG Apple 별도 승인·Accepted/log uploaded SHA·staple·Gatekeeper와 ZIP/DMG app 동등성·signed UI/helper/fault 분리·source seal·최종 hash gate를 모두 다시 통과해야 한다. Stage 2 전체 완료는 그때만 기록한다.
- entitlements를 넓히거나 signed normal 검증을 unsigned/mock/OS fault 결과로 대체하지 않는다. Desktop 원본 경로 실행 실패와 canonical temp copy 성공은 실행 위치가 다른 관측으로 보존한다.

### commit과 승인 경계

```text
Task #31: signed runtime smoke 보정 구현계획 확정
Task #31 [Stage 2.1]: 서명 보존 startup과 fault 검증 분리
```

첫 줄은 내용/단독 commit 승인 후 이 계획 파일 하나만 포함한다. 둘째 줄은 별도 승인된 위 10경로의 보정 단계 commit이다. 각각 attribution과 exact SHA 확인을 따른다. 현재는 둘 다 미승인·미실행이다. 기존 Stage 2 report/orders commit과 Stage 3 진입·최종 수용·GitHub 작업의 별도 경계는 유지한다.

## Stage 3 — 문서·통합 수용·배포 준비 보고

### 산출물

- `README.md`, `docs/smoke-checklist.md`, `AGENTS.md`.
- `mydocs/working/task_m001_31_stage3.md`, `mydocs/orders/20261008.md`.
- 별도 최종 보고 `mydocs/report/task_m001_31_report.md`.

### 변경 내용

- 내부 unsigned와 외부 signed/stapled 배포 후보 명령·입력·출력·한계를 기존 위치에 반영한다. README 순서/no-install SSH·unknown·runtime 보안 경계를 유지한다.
- 기존 v0.1.0 Release 링크와 unsigned 역사적 안내를 사실대로 보존한다. 아직 발행하지 않은 v0.2.0 download URL이나 signed Release 업로드 성공을 추가하지 않는다.
- 전체 gate와 최종 signed artifact 검증을 수행하고 source product commit과 최종 task commit의 차이가 문서뿐인지 확인한다. 제품·packaging 입력이 달라졌으면 과거 artifact를 최신 결과로 재사용하지 않는다. 다시 build/sign하면 새 app/DMG hash tuple 및 공증 검증을 요구한다.
- 기존 실패·경고·간헐성, 실제 SSH/OS 미검증을 보존한다. task report에는 upload 전 준비 상태·검증된 정확한 artifact·hash·수용 evidence를 명시한다.
- task publication/merge/close 이후의 devel → main release 계획은 별도 준비다. 현 단계 승인으로 release remote mutation은 하지 않는다.

### 검증

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
git diff --check
```

추가: explicit signed manifest 입력의 signed artifact smoke, Accepted ID read-only 재조회, app/helper/DMG signature·staple/spctl·최종 hash를 재검증한다. unsigned freshness 입력을 사용하며 일반 전체 tests에서 Apple/live SSH를 호출하지 않는다. 문서 negative guard는 전용 search tool로 확인하고 historical docs/plan·draft를 현재 setup으로 바꾸지 않는다.

### 커밋

```text
Task #31 Stage 3: 서명 공증 배포 준비 문서와 통합 검증
```

Stage 3 report/commit 승인 후 task-final-report의 별도 승인 경계에서 최종 보고와 orders를 기록한다. 최종 보고/evidence 수용과 publication tuple 승인을 생략하지 않는다.

## 검증과 승인본 결박

- Stage 시작 및 통합 gate 전에 작업지시자가 확인한 최신 구현계획 commit을 명시 입력으로 사용한다. 그 commit은 이 `_impl.md` 하나만 변경하고 HEAD ancestor여야 한다.
- 해당 plan의 commit/HEAD/index가 mode100644·동일 blob이고 working file이 symlink 아닌 regular0644·single-link·동일 hash인지 검증한다.
- 실패한 테스트·Apple/OS 결과는 단계 완료·최종 수용으로 처리하지 않는다. skip·warn-only·fake credential·ad-hoc로 통과시키지 않는다.
- 계획의 산출물·entitlement·원격 제출/문서 경계 변경은 기존 plan의 보정 내용 승인·단독 commit·새 exact SHA 확인 후 진행한다.

## 커밋

구현계획 내용 승인과 단독 commit 승인을 받은 뒤 이 문서 하나만 다음 제목으로 기록한다.

```text
Task #31: 승인된 구현 계획서 확정
```

모든 commit 메시지에 다음 두 줄을 각각 정확히 한 번 포함한다.

```text
Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>
```

생성된 exact commit OID를 보고하고 same-thread SHA 확인/Stage 1 승인 전에는 제품을 수정하지 않는다. 수행계획 내용 승인은 이번 구현계획 작성까지만 허용한다.

## 단계 의존성

- 구현계획 내용·단독 commit·exact SHA 확인 → Stage 1.
- Stage 1 결과·report·commit 승인 → Stage 2 진입 승인 → 실제 signing build → 앱 제출 exact tuple 승인 → app 수용/DMG 준비 → DMG 제출 exact tuple 승인 → Stage 2 수용.
- Stage 2 runtime 실패 → 기존 계획 보정안 작성 → 보정 내용/계획 단독 commit 승인 → 새 exact plan SHA/Stage 2.1 구현 승인 → 보정 검증/제품 commit 승인 → 새 exact 제품 SHA/Stage 2 재개 승인 → 새 run의 앱/DMG 각각 제출 tuple 승인 → 실제 Stage 2 전체 재검증.
- Stage 2 report/commit 승인 → Stage 3 진입 승인 → 통합 결과/단계 보고·commit → 별도 최종 보고/evidence acceptance → task publication.
- GitHub release PR/merge/tag/Release·main → devel sync와 issue close/cleanup은 각 해당 절차의 별도 승인이다.

## 위험과 대응

- **automatic submit/누락 인증**: signed 후보 build에서는 notarize false로 명시 분리하고 실제 공증은 exact 입력 승인 후 직접 notarytool을 호출한다. 이를 skip 성공으로 표현하지 않으며 final gate가 Accepted/ticket을 필수로 검사한다.
- **helper 과도 권한**: native signer의 helper per-file 옵션만 빈 plist로 좁힌다. 실제 결과·Electron 기능 확인 전 추가 entitlement를 확대하지 않는다.
- **실패 후 재제출**: request ID와 immutable artifact를 확인하고 info로 상태 조회한다. ambiguous timeout·Invalid를 자동 retry하지 않는다.
- **package와 ticket 불일치**: prepackaged app이 유지되는지 file manifest를 검사하고 최종 ZIP/DMG에서 재검증한다. staple 전후 hash를 구분한다.
- **운영·사용자 데이터**: temp HOME/data/DB·disposable fault copy·run-owned artifact만 사용한다. main/BMad/다른 task의 상태와 파일은 건드리지 않는다.
- **release lineage**: artifact source commit을 manifest에 실제대로 기록한다. release merge/문서 보정 후 제품 입력 변경 여부를 재검증하고 필요하면 새 빌드·공증을 별도 승인한다.

## 승인 요청 사항

1. 이 3단계의 exact 산출물·version·최소 권한·native signer 사용, signing-only 후보와 Apple 공증의 분리, 앱/DMG별 exact 제출 tuple, 검증/문서 경계에 대한 구현계획 **내용 승인**.
2. 이 `_impl.md` 하나만 포함하는 **단독 commit 승인**.
3. commit 뒤 출력할 exact SHA 확인과 Stage 1 진입 승인. 내용 승인만으로 commit/SHA/단계 진입 또는 Apple 제출 승인을 간주하지 않는다.

## Stage 4 — PR #32 Codex source provenance 보정

### 요청·발견과 승인 경계

- 작업지시자는 같은 스레드에서 Codex 리뷰 대응 수정·commit·push까지 요청했다. 기존 하이퍼-워터폴의 보정 계획 내용/plan-only commit/exact SHA·단계 진입 경계는 유지한다. 이 절은 그 요청을 실행하기 위한 보정 내용이며 제품 source는 아직 수정하지 않았다.
- P1 review comment `4231004786`: runtime이 승인 plan commit P의 HEAD ancestor와 과거 commit object를 요구한다. 현재 topic HEAD0ca에서는 ancestor 검증 exit0이지만 squash/release history에서는 그 commit이 reachable하지 않아 immutable 계획 내용이 같아도 signed build/후속 action이 실패한다. 현재 topic도 실패한다고 표현하지 않는다.
- P2 review comment `4231004797`: finalized verifier는 manifest sourceCommit의 형식만 확인한다. 실제 Git source와 현재 제품/packaging 입력의 동일성 또는 문서-only 차이를 검증하지 않아 옛 Accepted artifact를 변경된 제품의 최신 수용으로 반환할 수 있다.
- 기존 accepted source225 run, request IDs, report/evidence approvals는 역사적 수용으로 유지한다. 보정 후 제품 입력이 달라지므로 옛 artifact를 새 source의 최종 성공으로 사용하지 않는다. 새 실제 signing/Apple 제출/Release는 이번 commit·push 요청에서 자동 승인되지 않는다.

### 정확한 산출물·문서 위치

| 경로 | 변경 | 위치 판단 |
|---|---|---|
| `electron/signedRelease.mjs` | squash-safe immutable plan blob 검증, 공통 Git source/diff proof | 기존 driver에 source 검증을 모아 중복 규칙 방지 |
| `electron/signedRelease.test.ts` | reachable-plan 가정 제거·blob/metadata/source drift 회귀 | 기존 driver 테스트 |
| `smoke/electron-signed-dist-artifacts.mjs` | Apple 조회·mount·runtime 전에 공통 제품 source proof 필수 | 기존 finalized verifier |
| `smoke/electron-signed-dist-artifacts.test.ts` | product/packaging/dirty/unknown source 거부, 문서-only 동일성 수용 | 기존 verifier 테스트 |
| `AGENTS.md` | squash-safe runtime 계획 결박과 final source gate 인덱스 보완 | 이미 승인된 기존 루트 운영 인덱스 |
| `mydocs/working/task_m001_31_stage4.md`, `mydocs/orders/20261008.md` | 리뷰 재현/보정·검증·새 산출물 필요 상태 | 기존 내부 stage/orders 위치 |

이 계획은 기존 `mydocs/plans/task_m001_31_impl.md`에만 추가한다. 수행계획서의 문서 위치 선택은 유지한다. 최종 보고서/orders의 후속 갱신은 Stage 4 결과 승인 뒤 별도 final report/evidence 경계에서 처리한다. package/version/lockfile·entitlement·native signer·React/IPC/Rust/DB·submit 알고리즘 변경은 범위 밖이다.

### 변경 계약

1. 보정 plan-only commit P4의 exact SHA 및 blob B4를 승인 후 source에 pin한다. `APPROVED_PLAN_OID=P4`는 승인 이력/manifest tuple의 anchor로 유지하되 runtime에서 과거 plan commit의 존재/ancestor를 요구하지 않는다. runtime은 승인된 immutable `APPROVED_PLAN_BLOB_OID=B4`와 현재 HEAD/index/working 계획 파일의 mode/blob·bytes가 동일한지 검증한다. 계획 변경을 자유롭게 허용하거나 옛 plan fallback을 추가하지 않는다.
2. 작업 단계의 승인 검증에는 P4의 plan-only 경로·실제 승인·topic ancestor를 계속 확인한다. runtime의 squash-safe 검증과 사람/작업 단계의 승인 검증을 혼동하지 않는다. runtime Git root/override·replace refs·canonical regular0644/single-link·stage0/mode100644와 signing 전 clean source 조건은 유지한다.
3. driver의 source 검증을 canonical 공통 함수로 노출해 finalized verifier에서 재사용한다. verifier는 manifest source object의 존재와 현재 HEAD source snapshot을 검증하고, source→HEAD 및 HEAD→working/index의 변경이 명시적인 문서 경로 subset인지 확인한다. unknown/untracked/non-document 변경은 실패다. 경로 구분은 NUL-separated Git 결과와 literal paths로 처리한다.
4. 문서 허용 subset은 기존 루트 README/AGENTS, 공식 docs의 문서 파일, mydocs의 내부 문서 파일이다. 문서처럼 보이는 package/build/electron/smoke/src/crates 입력, symlink/실행파일, binary 변경은 허용하지 않는다. 계획 파일은 별도의 B4 불변 검증을 통과해야 한다. helper signing·packaging 입력이 하나라도 달라지면 새 run/새 앱·DMG tuple 승인이 필요하다고 실패한다.
5. 제품 source ancestry가 없더라도 squash/rebase된 현재 tree의 제품 입력이 manifest source와 동일한지 Git tree diff로 비교할 수 있다. manifest source 자체가 없거나 비교할 수 없으면 불확실 성공/자동 fetch로 대체하지 않는다. source OID만 같은 형태인지 확인하는 gate를 실제 tree proof로 바꾼다.
6. 기존 manifest를 새 P4/source로 다시 쓰지 않는다. 새 plan pin으로 옛 P manifest가 거부되는 회귀는 유지하고 새 mock manifest로 경계를 검증한다. 최종 actual old run 검증은 그 run의 원 승인 source/검증기에서만 역사적으로 구분하며 최신 보정 수용으로 사용하지 않는다.

### 재현·검증

- 수정 전 P1은 parent history에 plan commit이 없는 실제 임시 Git fixture의 동일 승인 blob으로 재현한다. topic ancestor 통과와 squash history 실패를 구분한다.
- 수정 전 P2는 finalized mock run 뒤 renderer/helper/package/signing/smoke 입력이 달라진 실제 Git fixture에서 과거 artifact가 수용되는 실패 테스트로 재현한다. 버전만 같은 경우도 거부한다.
- 보정 후 동일 B4·HEAD/index/working bytes의 squash-safe signing source proof는 통과해야 한다. 계획 blob/mode/index/symlink/hardlink·root/override/replace/dirty signing 입력은 계속 거부한다.
- source→HEAD 문서-only 및 문서-only working 변경은 final verifier가 수용하되 제품/packaging 변경·삭제·rename·unknown source·비문서 untracked 변경은 Apple/native/mount/runtime 호출 전에 거부한다. source proof 결과와 원본 보존이 final receipt에 결박돼야 한다.
- driver/verifier focused tests, 전체 Vitest, renderer/Electron/helper builds, core/helper tests·fmt check, fresh unsigned dist/artifact·실제 unsigned startup/fault/UI, diff check를 parent가 실행한다. 일반 tests는 live SSH·Apple upload를 호출하지 않는다. 실패/간헐성은 보존하며 timeout/수용 조건을 완화하지 않는다.
- 최신 보정 source의 실제 signed 최종 수용은 새 run·app/DMG 각각 승인/Accepted/staple 뒤만 주장한다. 그 실행은 별도 승인이다.

### commit·게시 경계

```text
Task #31: Codex 리뷰 source provenance 보정계획 확정
Task #31 Stage 4: squash-safe 계획 결박과 signed source drift 검증
```

계획 한 파일 단독 commit·exact SHA/Stage 4 진입 뒤 승인 범위만 구현한다. 제품/report/orders commit과 최종 report/evidence 수용은 기존 단계 승인 경계를 유지한다. 게시 시 PR #32의 최신 exact head/base/title/body와 review 상태를 fresh 조회하고, 승인된 새 exact OID만 기존 publish ref의 exact-old lease·fast-forward로 갱신한다. 본 요청은 merge·issue close·새 Apple 제출·Release 게시를 허용하지 않는다. #31의 명시 본문 참조/별도 close 예외는 유지하고 매뉴얼을 바꾸지 않는다.

### 승인 요청

- 이 Stage 4 보정 내용 승인.
- 이 계획 파일 한 경로 단독 commit 승인. 제품/테스트/AGENTS는 아직 수정하지 않았다.
- plan commit 후 새 exact SHA 확인 및 Stage 4 구현 진입 승인은 별도로 요청한다.
