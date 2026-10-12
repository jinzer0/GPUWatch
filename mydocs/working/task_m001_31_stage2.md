# Task #31 Stage 2 — arm64 앱과 배포 패키지 서명 공증 수용 검증

GitHub Issue: [#31](https://github.com/jinzer0/GPUWatch/issues/31)
구현계획서: [`task_m001_31_impl.md`](../plans/task_m001_31_impl.md)
Stage: 2
상태: 최신 source의 실제 검증 통과, 결과·report/orders 2경로 commit 승인 대기. Task #31은 진행중.

## 단계 목적

승인된 Stage 2.1 보정 source로 새 signing run을 생성하고 앱 ZIP·DMG별 별도 제출 승인에 따라 Developer ID 서명, Apple Accepted, staple, Gatekeeper, ZIP/DMG 동등성과 실제 격리 signed runtime을 검증한다.

- 승인 계획: `810089769e8a1ea1dcbd8476bf250ab8b3eb94d9`
- 계획 blob: `19cd5b13eaf752939f9525cf94c7240d3af7c1d5`
- 승인 source: `225839c2b932adab6899793e62bb04c45bb359d3`
- run: `release/electron/signed/2026-10-09T08-41-34-274Z-e77af24c-ba83-417d-a4d7-25ce76e7502b/`
- identity: `Developer ID Application: Jinyeong Kim (397452Z366)`; Team `397452Z366`; profile `gpuwatcher-notary`; explicit keychain 없음.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| run의 `manifest.json`, `mac-arm64/GPUWatcher.app` | 승인 P/C, identity, signature, app seal과 Apple request/승인 tuple 결박 |
| run의 `app-submission.zip` | 공증 전 signed 앱 제출 ZIP. 배포 ZIP과 구별 |
| run의 `distribution/GPUWatcher-0.2.0-arm64.zip` | Accepted·stapled 앱에서 생성한 배포 ZIP |
| run의 `distribution/GPUWatcher-0.2.0-arm64.dmg` | 동일 앱을 담은 Developer ID signed·Accepted·stapled DMG |
| `.omo/evidence/task-31-stage2-resume-*` | preflight/build/제출/실제 OS 및 runtime 증거. ignored 로컬 산출물 |
| 본 보고서, `mydocs/orders/20261008.md` | 실제 Stage 2 결과·한계·승인 경계 기록 |

바이너리·원문 evidence·인증정보는 commit 대상이 아니다.

## 본문 변경 정도 / 본문 무손실 여부

- 제품 source와 승인 계획은 변경하지 않았다. 계획의 approved commit/HEAD/index/working blob 동일성, ancestor, 깨끗한 source와 승인 10경로 blob을 확인한 코드로 실행했다.
- Stage 2.1 결과·10경로 commit 및 exact source/Stage 2 재개 승인을 순서대로 받았다. 앱 ZIP과 DMG는 각각 출력한 새 exact action tuple을 같은 스레드에서 전달받고 manifest/artifact/app seal을 다시 검증한 뒤 제출했다.
- 기존 source `03e0c22e5c9c2350cdf49f13037f09502d931bca`의 Accepted run과 signed smoke 실패는 역사적 결과로 보존한다. 기존 Apple request를 새 source에 재사용하거나 기존 manifest의 P/C를 다시 쓰지 않았다.
- 원 worktree HEAD·사용자/BMad 변경은 기존 상태와 동일함을 확인했다. 정상 실행은 원본이 아닌 서명·ticket을 보존한 canonical disposable copy에서 수행했다. DB/HOME/cwd는 격리했으며 production DB를 사용하지 않았다.
- 문서 위치는 승인 계획의 내부 단계 보고/오늘할일 위치를 따른다. 제품 문서 변경은 Stage 3에 남긴다.

## 검증 결과

### 실행 경계와 결과

```bash
security find-identity -v -p codesigning
xcrun notarytool history --keychain-profile gpuwatcher-notary --output-format json
npm run electron:pack:signed
node electron/signedRelease.mjs prepare-app --manifest <manifest>
node electron/signedRelease.mjs submit-app --manifest <manifest> --approved-manifest-sha256 <approved hash> --approved-artifact-sha256 <approved hash>
npm run electron:dist:signed -- --manifest <manifest>
node electron/signedRelease.mjs prepare-dmg --manifest <manifest>
node electron/signedRelease.mjs submit-dmg --manifest <manifest> --approved-manifest-sha256 <approved hash> --approved-artifact-sha256 <approved hash>
node smoke/electron-signed-dist-artifacts.mjs --manifest <manifest>
git diff --check
```

각 signing/driver/verifier 실행에는 승인 입력의 CSC_NAME·GPUWATCHER_SIGNING_TEAM_ID·APPLE_KEYCHAIN_PROFILE을 명시적으로 전달했다. 로그에 실제 canonical argv와 hash를 보존한다.

- signing-only build exit0. v0.2.0 arm64 앱/helper의 strict Developer ID·Team·hardened runtime·timestamp, 앱 JIT-only/helper empty entitlement를 확인했다. file·lipo·Info.plist와 격리 HOME/data에서 실제 helper health의 단일 성공 envelope를 확인했다. 이 후보 단계에서는 공증 성공을 주장하지 않았다.
- 앱 제출: **Accepted-and-stapled**, request `3f627a7e-78bc-4a9a-a75b-ce2f57ca8fa3`. 제출된 ZIP SHA와 Apple log의 uploaded SHA 결박을 확인했다.
- DMG 제출: **Accepted-and-stapled**, request `3eb4768e-c9ff-466c-9b31-97603b87e155`. 제출 전 DMG SHA와 Apple log 결박을 확인했다. 승인 없는 재제출은 없었다.
- 앱·helper·DMG strict codesign, 앱/DMG stapler validate, 앱 execute/DMG primary-signature spctl 모두 실제 통과했다. spctl source는 `Notarized Developer ID`였다.
- 최종 verifier는 최신 P/C, 두 승인 tuple/Apple info·log, 모든 artifact hash, DMG mount/ZIP extraction의 동일 앱·helper·signature/ticket을 확인하고 exit0/state=verified를 반환했다. 임시 mount/extraction 정리도 gate에 포함된다.
- signed 정상 startup: 원 helper 유지, guard=false/actions=[], source/copy seal 동일, launch 전 codesign/stapler 통과. 해당 copy에 결박된 CDP renderer·nonblank UI·action-specific bridge·실제 helper v0.2.0를 확인했다. 빈 registry에서 smoke.invalid를 enabled=false로 저장하고 목록/탐색을 검증했다.
- signed fault: 별도 disposable helper chmod-only. 실제 structured `helper_contract/helper_runner_error` EACCES와 가시 오류 UI·관리 화면 탐색성을 확인했다. **faultClass=backend-error**였다. post-fault codesign/stapler도 통과했으므로 이를 OS signature enforcement로 표현하지 않는다. OS-block 분기는 이번 실제 실행에서 관측되지 않았다.
- 정상/오류 app copy·HOME/data/cwd와 owned process 정리가 완료됐다. source app 파일·mode seal과 제출/배포 artifact hash는 최종 검증 뒤에도 일치했다.
- 최초 최종 verifier 실행은 호출 환경에 Team ID를 전달하지 않아 exit1/Missing or invalid signing Team ID였다. 승인 selectors를 전달한 재실행은 제품 수정·새 제출 없이 exit0였다. 최초 실패 로그도 보존한다.
- fault의 scheduler EACCES와 cleanup 시 SIGKILL 로그는 숨기지 않았으며 정상 OS signature-block 증거로 사용하지 않았다. 추가 acceptance JSON 추출 시 필드 시작을 잘못 가정한 로컬 집계 오류도 발생했으나 실제 receipt의 manifestPath 시작 구조를 읽고 집계만 수정했다. 서명/제출/runtime을 재실행하거나 성공 receipt를 변경하지 않았다.

실제 signed runtime 구간은 표시 시각 기준 2026-10-09 18:10:54~18:11:08 (+09:00)이다. 원문 UTC timestamp는 그대로 보존하며 이 표시 시각은 인증된 event-time이나 작업 종료 선언이 아니다.

### 최종 hash

| 대상 | SHA256 |
|---|---|
| 앱 제출 ZIP | `05d9647f6465f80fc7aba7a91518d4ab7c70e9b0f56d05b8ce199a3838a7c925` |
| 앱 staple 전 seal | `c1255955e3668dac3f666b3acfa56b77f595e3f825172c79453b2312a8b13e99` |
| 앱 staple 후 seal | `bb7d350a22aefb0e6f0652b2bdb45ead280b0929ff72ffbce1e14bf038db6b29` |
| 배포 ZIP | `e08d681667cb3ee589c5b249875cbe67a1b4a6d719a9794d3b350e1723774c00` |
| DMG 제출 전 | `fd2fb023e4271316e0112712b63614b0b16482dc4956c53875c038f2cdac6d78` |
| DMG staple 후 | `ae254a7596a0283271988b15a476ea9ce51fa32dcdfa6d501f654c9392a5bfe8` |

ZIP 자체에는 staple하지 않는다. 배포 ZIP은 stapled 앱을 포함한다.

### 핵심 evidence

- `.omo/evidence/task-31-stage2-resume-acceptance.json`: `b015b7875e8574624c8d37185e7b021adccf7cb9a5134c9ff2c3a626e4fa9270`
- `.omo/evidence/task-31-stage2-resume-final-signed-smoke-with-selectors.txt`: `8c9947d7fcae4e2c27acf4a6e0c00419efcc9876b60de18e00976037589c88ca`
- `.omo/evidence/task-31-stage2-resume-final-os-verification.txt`: `5997a99d7497c9cc3a969d9adf5897b7bc7e6791d977740c1a271087ee454e4d`
- 최초 selector 누락: `.omo/evidence/task-31-stage2-resume-final-signed-smoke.txt`
- 각 승인 입력·submit argv/결과: `.omo/evidence/task-31-stage2-resume-{app,dmg}-submit-approval.json`, `.omo/evidence/task-31-stage2-resume-{app,dmg}-submission.txt`

## 잔여 위험

- CDP UI 검증은 실제 OS 입력·알림 또는 live SSH 성공이 아니다. 원격 설치는 추가하지 않았으며 실제 SSH/알림 수용을 이 결과로 대체하지 않는다.
- canonical 격리 app copy의 성공이며 이전 Desktop 원본 위치의 ERR_FAILED 원인을 TCC/entitlement로 확정하거나 해결했다고 주장하지 않는다.
- OS signature-block의 실제 성공 증거는 없다. 해당 분기는 Stage 2.1의 strict mock 회귀로만 검증됐고 이번에는 backend-error 분기로 수용했다.
- Apple Accepted·staple은 GitHub 게시·자동 업데이트·제품 문서/최종 승인 완료를 뜻하지 않는다. Task #31의 외부 배포 준비 전체 완료는 아직 아니다.

## 다음 단계 영향

Stage 2 결과·report/orders commit 승인과 commit exact SHA 확인 뒤 Stage 3 진입 승인을 별도로 받는다. Stage 3 제품 문서·통합 수용, 최종 보고/acceptance, release PR/merge/tag/Release·asset 업로드와 issue close/cleanup은 각각 기존 승인 경계를 유지한다.

## 승인 요청

- Stage 2의 실제 서명·공증·패키지/runtime 검증 결과와 한계 승인.
- 본 보고서와 `mydocs/orders/20261008.md`만 포함하는 2경로 commit 승인.
- 메시지: `Task #31 Stage 2: arm64 앱과 배포 패키지 서명 공증 수용 검증`.
- Stage 3 진입·GitHub mutation·작업 종료는 현재 요청에 포함하지 않는다.
