# Task #31 Stage 2.1 — 서명 보존 startup과 fault 검증 분리

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
구현계획서: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 2.1
승인 계획 commit: `810089769e8a1ea1dcbd8476bf250ab8b3eb94d9`
승인 계획 blob: `19cd5b13eaf752939f9525cf94c7240d3af7c1d5`
상태: 보정 구현·mock/전체/unsigned 실제 검증 통과, 결과·10경로 commit 승인 대기. Stage 2 전체 수용은 미완료.

## 단계 목적

signed 정상 startup에서 helper guard가 서명을 깨뜨리던 검증기 문제를 해결한다. canonical 임시 복사본에서 원 helper와 bundle signature/ticket을 보존하며, unsigned guard와 signed backend/OS fault 증거를 분리한다. 이번 승인은 보정 코드·검증·보고 범위이고 실제 새 signed build·Apple 제출·GitHub mutation을 포함하지 않는다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `smoke/scenarios/packaged-app.mjs` | artifactMode 기본 unsigned, signed는 explicit app 필수. mode-aware evidence·structured runtime receipt, source seal 보존 |
| `smoke/scenarios/packaged-app/startup.mjs` | canonical temp copy/HOME/data/cwd. signed copy seal/codesign/stapler 확인 후 원 helper로 launch; unsigned rename/guard 유지. signed CDP URL을 해당 copy의 renderer에 결박 |
| `smoke/scenarios/packaged-app/helper-error.mjs` | disposable chmod-only fault. signed baseline/ticket·post-fault signature 기록, backend error와 정확한 PID/launch 시간창 내 OS enforcement JSON record를 분리. 다른 CDP renderer·불명확한 종료/timeout 거부 |
| `smoke/scenarios/packaged-app/evidence.mjs` | unsigned/signed·explicit discovery·guard 유무·copy proof·fault classification을 사실대로 출력. OS branch에 backend/UI 성공을 꾸미지 않음 |
| `smoke/scenarios/packaged-app.test.ts` | 신규 Node mock 회귀. signed 무교체·canonical copy·launch 전 검증·unsigned guard·오류/정리·PID-prefix/시각/receipt metadata·CDP 결박 |
| `smoke/electron-signed-dist-artifacts.mjs` | artifactMode signed 전달. signature-preserving receipt, 실제 helper version/disabled registry/cleanup·fault baseline·OS 재분류 필수. 원본/hash/ZIP/DMG/Apple/OS 기존 gate 유지 |
| `smoke/electron-signed-dist-artifacts.test.ts` | misleading/incomplete runtime receipt·예전 plan manifest 거부·source 보존 회귀 |
| `electron/signedRelease.mjs` | APPROVED_PLAN_OID 한 항목만 최신 승인 plan CID로 갱신. 다른 signing/submit logic 불변 |
| 본 보고서, `mydocs/orders/20261008.md` | Stage 2.1 결과/위험/승인 범위 기록. Task #31은 진행중 유지 |

## 본문 변경 정도 / 본문 무손실 여부

- 최신 승인 plan 파일은 내용·HEAD/index/working blob·regular0644/single-link를 확인하고 수정하지 않았다. 변경은 계획의 코드 8경로와 내부 report/orders 2경로만이다.
- package/version/lockfile, React/Electron runtime/preload/IPC, Rust/DB, native signer와 entitlement를 변경하지 않았다. 원 worktree/BMad/사용자 변경 및 기존 source03의 signed app/DMG/ZIP·Apple 성공/실패 증거를 보존한다.
- 원 plan42/Stage 1 source03·기존 Accepted ID는 역사적 기록이며 최신 plan/source 수용으로 재라벨하지 않았다. 최신 driver는 예전 plan manifest를 거부한다.
- 제품 안내 README/checklist/AGENTS 갱신은 기존 Stage 3 경계를 유지한다. 이번 단계에는 공식 제품 문서·새 formatter/의존성을 추가하지 않았다.

## 검증 결과

### 실행·관측

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

- post-review 13명령 모두 exit0. 마지막 signed-only failure/exit metadata 엄격화 뒤 focused/전체 Vitest·실제 unsigned packaged UI·diff check를 4명령으로 다시 실행해 모두 exit0였다. 빌드/Rust/unsigned artifact 입력은 이 마지막 변경에서 불변이다.
- 최신 focused: **4 files / 232 tests passed**. 전체: **31 files / 656 tests passed**. 최초 222/646, URL 보완 후 223/647은 당시 통과로 보존하며 최신 수치로 사용하지 않는다.
- Rust core: **151 passed, 기존 live SSH 2 ignored**. helper: **25 passed**. 두 cargo fmt check, renderer/Electron/helper build 통과. 정상 tests에 live SSH/Apple/실제 서명 실행을 넣지 않았다.
- unsigned freshness는 해당 build 직전 캡처했다. 새 arm64 DMG/ZIP의 내용/helper/mode/ad-hoc 상태 검증·mount detach/extraction 정리 통과. signed namespace는 unsigned 탐색에서 제외됐다.
- 실제 unsigned packaged UI: guard 유지, action-specific bridge·local helper v0.2.0, 빈 registry에서 disabled smoke.invalid 저장/list/navigation, nonexec helper EACCES의 structured error·가시 UI·관리 탐색성 검증 통과. 정상/오류 시나리오는 별도 temp HOME/data/cwd/app copy를 사용했고 정리했다.
- unsigned helper fault의 scheduler reset EACCES 출력과 process cleanup의 SIGKILL 로그를 숨기지 않았다. 이를 signed OS enforcement 또는 실제 SSH/알림 성공으로 해석하지 않는다. default Electron icon/identity:null signing skipped 경고도 원문에 보존했다.
- 저장소에 JS formatter 설정/명령이 없어 새 formatter 정책을 만들지 않았다. 기존 cargo fmt check와 diff whitespace gate는 실행했다.

### 독립 검토·보완

1. read-only 검토가 **P1 PID prefix/집계 로그 오인**과 **P2 불완전 command receipt 수용**을 발견했다. 서명 보존·unsigned 분리·cleanup 구조 자체는 유지했다.
2. OS 진단을 JSON으로 받고 launch PID·시간창과 같은 event record의 enforcement 메시지가 모두 맞아야 수용하도록 수정했다. PID1234/12345, 과거/미래·서로 다른 record, malformed JSON은 unresolved다.
3. success receipt는 code0/signal=null/timedOut=false와 string stdout/stderr가 필수다. signature failure와 child 종료에도 명시적 완료 상태를 요구해 success의 부정을 failure proof로 쓰지 않는다.
4. read-only macOS log query syntax 확인에서 fraction timestamp가 실제 exit64로 거부됐다. 지원되는 second-precision UTC+0000 query로 보완해 exit0/JSON array를 확인했다. 정확한 millisecond launch 시간창은 classifier에 유지한다. 이 확인의 빈 JSON array는 enforcement 증거가 아니다.
5. 재검토 결과 P1/P2 및 failure receipt 문제 해결·검토 범위 잔여 blocker 없음. reviewer는 static read-only이며 tests/build/network/서명을 실행하지 않았다. 최신 gate는 parent가 직접 수행했다.

### 증거

- 13 gate: `.omo/evidence/task-31-stage2.1-post-review-verification.txt`
  - SHA256 `d64f43dca489823f184b66f12005497131c56b3a4ab5034ca0df53fdae62375b`
- 최종 signed-only metadata 보완 후 4 gate: `.omo/evidence/task-31-stage2.1-final-metadata-verification.txt`
  - SHA256 `c8ab26b47fe371a94c36b758ce0dd855babcf8f0c549756570403beae09f6693`
- macOS log syntax before exit64: `.omo/evidence/task-31-stage2.1-os-log-syntax.txt`
  - SHA256 `44cbd01fb0ec27afe059749b92dea99f1858545e42a1a4d3d18dfddb886b920e`
- syntax after exit0: `.omo/evidence/task-31-stage2.1-os-log-syntax-after.txt`
  - SHA256 `78e55ada926f1169bafdbd7970c9e7c1a9de68581644822fe6944ef803fb0eec`
- 기존 실제 Stage 2 partial status: `.omo/evidence/task-31-stage2-partial-status.json`
  - SHA256 `5aa8b6e82b9b2712b0160d977824734d80ed80d8c3c79474c0a2b60de322252b`

원문은 ignored 로컬 증거다. report에는 결과/경로/hash만 기록하며 바이너리/인증정보/원문 로그를 commit하지 않는다. 원문 UTC timestamp는 그대로 보존하며 최종 metadata gate 실행은 로컬 표시 기준 2026-10-09 00:19~00:20이다. 이는 검증 표시 시각이고 작업 종료 선언이나 인증된 event-time이 아니다.

## 잔여 위험

- **최신 source의 실제 signed UI·copy ticket·backend/OS fault 수용은 아직 없다.** 이번 signed 경로는 mock 검증이며 실제 unsigned UI와 구별한다. 기존 source03 signed temp copy 성공도 최신 보정 성공을 대신하지 않는다.
- OS 진단이 누락/불명확하거나 signature/프로세스 결과가 완결되지 않으면 의도적으로 전체 gate를 실패시킨다. entitlement 확대·로그 권한 승격·arbitrary timeout 성공 처리로 우회하지 않는다.
- Desktop 원본 위치의 renderer ERR_FAILED와 canonical temp copy 성공을 서로 다른 관측으로 유지한다. TCC나 entitlement 원인으로 확정하지 않았다.
- Task #31 Stage 2 전체와 외부 배포 준비 완료는 미수용이다. 이번에는 새 Developer ID signing·Apple history/info/submit·새 notarization·GitHub 작업을 실행하지 않았다. native OS log의 좁은 read-only 문법 확인과 unsigned GUI는 위에 별도 구분했다.
- 기존 dependency/install-script 정책·기존 helper timeout PID assertion 간헐성의 근본 수정은 범위 밖이다. 최신 전체656 통과로 과거 이력을 삭제하지 않는다.

## 다음 단계 영향

- 이 보정 결과·10경로 제품/report/orders commit 승인 후 새 제품 commit C의 exact SHA를 확인하고 실제 Stage 2 재개 승인을 별도로 받는다.
- 재개 시 승인 plan810/C에 결박된 새 unique signing run을 생성한다. 기존 run의 manifest/Apple ID/산출물은 그대로 두며 최신 run으로 재사용하지 않는다.
- 앱 ZIP/DMG는 각각 새 hash-bound exact tuple 승인 후만 제출한다. 실제 signature/staple/Gatekeeper·원본/ZIP/DMG app 동등성·signed 정상 UI/원 helper·분리된 fault 수용을 모두 검증해야 Stage 2를 마무리한다.
- Stage 3 문서/최종 수용과 GitHub publish/merge/close/release는 별도 승인이다.

## 승인 요청

- Stage 2.1 보정 결과·최신 검증·한계 승인.
- 위 8개 코드/test/plan binding 파일과 report/orders 2파일 총10경로만의 `Task #31 [Stage 2.1]: 서명 보존 startup과 fault 검증 분리` commit 승인.
- 실제 Stage 2 재개·새 signing·Apple 제출·Stage 3 진입은 현재 요청에 포함하지 않는다.
