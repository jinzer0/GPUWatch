# 스모크 체크리스트

아래는 내부 인계 시 실행할 시나리오이며, 통과·실행 기록이 아닙니다. 운영 DB 대신 `GPUWATCHER_TEST_DATA_DIR`로 격리한 데이터를 사용합니다. 실제 SSH·OS 알림·물리 macOS 키보드/VoiceOver 확인은 별도 승인 후 수행하고, renderer QA와 unsigned/signed 패키지 검증 결과를 구분해 기록합니다.

## 로컬 회귀 시나리오

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test -- --run
npm run build
npm run electron:build
npm run helper:build
```

확인 기준: 각 명령 exit 0, 일반 테스트는 live SSH와 `tml-server`에 의존하지 않음. fixture·fake notifier는 테스트 증거일 뿐 실제 수집·OS 배너 증거가 아닙니다.

## Electron 개발 화면·관리 흐름

1. `npm run dev`로 `http://127.0.0.1:5173`을 열고 별도 터미널에서 격리 데이터 경로를 설정해 `npm run electron:dev`를 실행합니다.
2. 앱 식별 정보와 서버 사이드바를 확인합니다. `+ → 직접 추가`에서 저장한 로컬 설정이 남는지 확인하되, 저장을 SSH 테스트 성공으로 표시하지 않는지 확인합니다.
3. 서버 A를 선택한 채 서버 B 행의 `…`를 열어 편집·삭제·연결 테스트가 B를 대상으로 하는지 확인합니다. 삭제는 확인을 거치며 Mac의 서버 설정만 삭제하고 원격 호스트를 변경하지 않아야 합니다.
4. 관리 시트에서 미저장 입력을 둔 채 닫기·서버 전환을 시도해 변경 폐기 확인과 입력 보존을 확인합니다. 저장/삭제 처리 중 중복 실행·닫기를 막고, 실패를 표시하며 재시도가 가능해야 합니다.
5. `+ → SSH config 가져오기`에서 후보 선택·필터·저장을 확인합니다. 부분 성공 후 성공 항목은 유지하고 실패 항목만 재시도하며, 가져온 서버는 모니터링 off여야 합니다. 모니터링 시작/중지는 행 메뉴에서 확인합니다.
6. 서버 상세에서 여러 GPU를 동시에 펼치고 각 GPU의 추가 지표도 독립적으로 펼칩니다. 한 카드 조작으로 다른 카드가 닫히지 않아야 합니다. 현재 프로세스와 GPU 지표가 남고 History 탭/최근 24시간 화면은 없어야 합니다.
7. unknown·0·stale을 각각 구분합니다. `N/A`·`-`를 0으로 바꾸지 않고, 실패 시 이전 성공을 stale와 오류로 표시합니다. MIG/드라이버 차이, 선택적 `pmon`/`dmon` 저하, 프로세스 정보 한계가 과장 없이 드러나야 합니다.
8. 설정 아이콘과 앱 메뉴 설정(`Cmd+,`)을 반복해 열어 외형 전용 창 하나만 유지하는지 확인합니다. 시스템/라이트/다크 변경을 확인하며 서버 관리나 수집을 설정 창에서 실행하지 않아야 합니다.
9. 일반 브라우저에서도 정적 앱 식별 정보·빈 상태를 유지하고 backend 동작은 명시적인 `backend_unavailable`로 실패해야 합니다. 저장·연결 성공 또는 가짜 지표를 만들지 않아야 합니다. Electron은 동작별 preload/IPC를 사용하며 임의 helper dispatch를 노출하지 않습니다.

## 기본 가용 관측·알림 시나리오

시간 경계는 격리 DB와 제어된 성공/실패 관측으로 검증합니다. fixture 시간 이동을 실제 5분 관측이나 실제 OS 알림으로 보고하지 않습니다.

- [ ] 알림 off라도 기본 가용 관측이 동작함. 알려진 UTIL ≤5% **AND** VRAM ≤1024MiB에서 299초는 후보, 연속 성공 관측 300초부터 가용. 두 임계값의 등호와 한 값만 초과/unknown인 경우를 각각 확인.
- [ ] 실패·unknown·조건 이탈·GPU 사라짐·서버 설정 변경·모니터링 off·stale이면 현재 가용을 반환하지 않음. 재시작·절전/복귀 뒤 새 구간부터 관측하고 화면에서 경과시간만 더해 가용을 만들지 않음.
- [ ] 관측 간 공백이 `2 × pollingIntervalSeconds + 60초`를 넘으면 구간 재시작. 마지막 성공이 이보다 오래되면 unknown. 중복 timestamp는 지속시간을 늘리지 않으며 시간 역행·잘못된 timestamp도 확인 불가.
- [ ] 기본 가용 카드와 opt-in 사용자 지정 알림 조건을 구분함. 기본 조건과 다른 저장 조건의 알림은 “설정한 조건 충족”을 뜻하고 GPU 가용을 단정하지 않음.
- [ ] 기존 알림 off/on에서 rule id·임계값·지속시간·저장 cooldown을 보존함. 읽기/저장 실패가 성공으로 표시되거나 기존 조건을 신규 기본값으로 대체하지 않음.
- [ ] 연속 유휴에는 1회만 알림. 관측된 사용 재개(저장 조건 이탈) 후 재준비하며 지속 조건과 실효 cooldown을 모두 만족해야 재알림. 899/900초 경계와 더 큰 저장 cooldown도 확인.
- [ ] 저장 cooldown이 900초 미만이어도 저장값은 그대로이고 실효 발송 제한은 최소 900초. off/on·저장·failed/unknown·재시작/절전으로 이전 발송 이력이나 재준비 상태를 임의 초기화해 반복 제한을 우회하지 않음.
- [ ] OS 권한 확인 불가는 `unknown`으로 남음. opt-in 성공·outbox 소비·fake notifier 호출을 권한 허용 또는 배너 노출 증거로 취급하지 않음.

## Renderer 키보드 QA

격리 Electron/renderer에서 다음 포커스·DOM 동작을 확인합니다. 자동 이벤트/CDP 결과만으로 물리 키보드·macOS 메뉴 accelerator·VoiceOver 검증을 완료 처리하지 않습니다.

- [ ] 서버 선택, `+`, 행 `…`, GPU/추가 지표 펼침, 관리 시트, 알림 토글을 Tab·Enter·Space로 조작 가능.
- [ ] 메뉴의 화살표·Home/End 이동과 Escape 닫기, 메뉴/시트 닫기 후 trigger로 포커스 복귀.
- [ ] 관리 시트의 포커스 제한, 미저장 변경/삭제 확인, pending/error 안내와 중복 실행 방지.
- [ ] 설정 재호출 시 singleton 유지와 포커스 이동, light/dark/system에서 focus ring·상태·unknown의 구분.

## 별도 물리 macOS·VoiceOver·OS 알림 확인

승인된 Mac에서 실제 키보드로 `Cmd+,`와 앱 메뉴를 확인하고, VoiceOver로 서버 이름·메뉴·펼침 상태·시트·오류·알림 토글을 탐색합니다. 물리 sleep/wake와 앱 재실행 뒤 관측 초기화도 별도로 확인합니다. 실제 OS 알림은 승인된 격리 대상에서만 확인하며 macOS 알림 설정·집중 모드 등에 따른 배너 미표시를 기록합니다. 권한이 unknown이면 unknown 그대로 보고하고 배너를 보장하지 않습니다.

## Unsigned 패키지 시나리오

1. `npm run electron:pack` 후 실제 출력에서 앱 경로를 찾습니다.

```bash
APP_PATH="$(find release/electron -path 'release/electron/signed' -prune -o -name 'GPUWatcher.app' -type d -print -quit)"
test -n "$APP_PATH"
open "$APP_PATH"
```

2. 최초 창·새 서버 탐색·관리 시트·외형 창과 로컬 helper 실행을 확인합니다. helper는 ASAR 밖 app resources의 `gpuwatcher-helper/gpuwatcher-helper`에 있어야 하며 찾지 못하면 경로/리소스 오류가 명확해야 합니다.
3. `npm run electron:dist:unsigned` 후 `release/electron/`에서 실제 DMG/ZIP을 확인합니다. `mac`/`mac-arm64`를 하드코딩하지 않고 비어 있지 않은 파일과 `GPUWatcher.app`, ASAR 밖 helper를 확인합니다.

```bash
node smoke/electron-unsigned-dist-artifacts.mjs
```

확인 기준: 로컬 `.app`과 내부 테스트 DMG/ZIP은 unsigned이며 signed/notarized/uploaded/auto-updated/production release-ready/external distribution-ready 산출물이 아닙니다. Gatekeeper·quarantine 차단은 unsigned 산출물 한계로 기록하며 서명 검증 통과로 보고하지 않습니다. 패키지 검증은 물리 키보드·VoiceOver·live SSH·OS 배너 검증을 대체하지 않습니다.

## Signed 패키지 시나리오

unsigned 명령/탐색을 signed 결과로 대체하지 않습니다. unsigned 배포 회귀에서는 빌드 직전 `GPUWATCHER_ARTIFACT_STARTED_AT_MS`를 epoch milliseconds로 설정하고 같은 값을 artifact verifier에 전달해 이전 파일을 수용하지 않도록 합니다.

1. 승인 계획과 깨끗한 source commit, Developer ID 인증서의 CN/Team, `xcrun notarytool`/`stapler`, Keychain profile 인증을 확인합니다. 검증한 `CSC_NAME`, `GPUWATCHER_SIGNING_TEAM_ID`, `APPLE_KEYCHAIN_PROFILE`을 설정하고 필요한 경우에만 `APPLE_KEYCHAIN`을 지정합니다. 인증 mixing·missing identity·unsigned/ad-hoc fallback은 허용하지 않습니다. 앱 entitlement는 JIT-only, helper는 empty이며 테스트를 위해 권한을 넓히지 않습니다.
2. 아래 build는 서명만 된 새 후보를 생성합니다. 출력 manifest의 canonical 경로를 `SIGNED_MANIFEST`에 지정합니다. run은 `release/electron/signed/` 아래이며 signed 검증은 무인자 자동 탐색을 사용하지 않습니다. 승인 계획/source가 바뀌면 새 run이 필요합니다.

```bash
npm run electron:pack:signed
```

3. 앱 strict signature·Team·timestamp·hardened runtime·arm64·v0.2.0·실제 helper envelope를 확인하고 제출 ZIP tuple을 준비합니다.

```bash
: "${SIGNED_MANIFEST:?해당 run의 canonical manifest 경로를 지정하세요}"
node electron/signedRelease.mjs prepare-app --manifest "$SIGNED_MANIFEST"
```

4. 출력된 exact tuple을 승인받은 후에만 제출합니다. 해당 tuple의 manifest/artifact SHA256을 각각 `APPROVED_MANIFEST_SHA256`, `APPROVED_ARTIFACT_SHA256`에 지정합니다. submission timeout/Invalid/불확실 상태는 실패로 보존하며 자동 재제출하지 않습니다.

```bash
: "${APPROVED_MANIFEST_SHA256:?승인된 manifest SHA256을 지정하세요}"
: "${APPROVED_ARTIFACT_SHA256:?승인된 앱 ZIP SHA256을 지정하세요}"
APPROVED_APP_MANIFEST_SHA256="$APPROVED_MANIFEST_SHA256"
node electron/signedRelease.mjs submit-app --manifest "$SIGNED_MANIFEST" --approved-manifest-sha256 "$APPROVED_MANIFEST_SHA256" --approved-artifact-sha256 "$APPROVED_ARTIFACT_SHA256"
```

5. Apple request ID/Accepted/log의 uploaded SHA 결박, app staple·strict codesign·spctl 통과 후 동일 stapled 앱으로 배포 ZIP과 Developer ID DMG를 만듭니다. 앱 재패킹/재서명은 하지 않습니다. ZIP 자체에는 staple하지 않습니다.

```bash
npm run electron:dist:signed -- --manifest "$SIGNED_MANIFEST"
node electron/signedRelease.mjs prepare-dmg --manifest "$SIGNED_MANIFEST"
```

6. 새 DMG tuple을 **별도로 승인**받습니다. 위 두 SHA 변수는 DMG tuple의 최신 값으로 다시 지정합니다. 앱 제출 승인을 DMG에 전파하지 않습니다.

```bash
: "${APPROVED_MANIFEST_SHA256:?승인된 DMG manifest SHA256을 지정하세요}"
: "${APPROVED_ARTIFACT_SHA256:?승인된 DMG SHA256을 지정하세요}"
APPROVED_DMG_MANIFEST_SHA256="$APPROVED_MANIFEST_SHA256"
node electron/signedRelease.mjs submit-dmg --manifest "$SIGNED_MANIFEST" --approved-manifest-sha256 "$APPROVED_MANIFEST_SHA256" --approved-artifact-sha256 "$APPROVED_ARTIFACT_SHA256"
: "${APPROVED_APP_MANIFEST_SHA256:?원 앱 tuple에서 승인한 manifest SHA256을 보존하세요}"
node smoke/electron-signed-dist-artifacts.mjs --manifest "$SIGNED_MANIFEST" --approved-app-manifest-sha256 "$APPROVED_APP_MANIFEST_SHA256" --approved-dmg-manifest-sha256 "$APPROVED_DMG_MANIFEST_SHA256"
```

최종 verifier에도 같은 승인 identity/Team/profile selectors가 필요합니다. app/DMG codesign·stapler·Gatekeeper, Apple info/log, 최종 hash와 ZIP extraction/DMG mount의 앱·helper 동등성, source 보존·owned cleanup을 모두 확인합니다. 현재 task의 문서-only 변경은 artifact source와 구별하고 제품/packaging 입력이 바뀌면 기존 Accepted 결과를 재사용하지 않습니다.

submit은 state 변경/Apple upload 전에 승인된 pre-submit manifest의 원문을 해당 run의 `approval-app-manifest.json`, `approval-dmg-manifest.json`에 exclusive-create로 보존합니다. 최종 검증은 **원 승인 tuple의 두 hash를 독립 입력**으로 요구하며 snapshots·현재 manifest·approval/source/artifact/seal을 비교합니다. mutable finalized manifest에서 hash를 자동 추출하거나 source label을 문서-only HEAD로 재라벨하지 않습니다. snapshot이 없거나 hash/mode/link/내용이 다르면 실패이며 overwrite·자동 복구하지 않습니다. read-only 파일 자체가 승인 증거는 아니고 외부 승인 hash가 trust anchor입니다. 기존 snapshot 없는 산출물을 새 provenance로 수선하거나 최신 run 성공으로 표현하지 않습니다.

signed 정상 startup은 canonical temp HOME/data/cwd·앱 copy에 원 helper를 유지하며 source/copy seal·signature/ticket을 launch 전에 확인합니다. guard/rename/chmod로 정상 앱을 변경하지 않습니다. action-specific bridge·실제 helper version·빈 registry·disabled smoke.invalid 저장/list/navigation을 확인합니다. fault는 별도 copy의 chmod-only 결과이며 structured backend error/가시 UI/탐색성 또는 exact PID·launch 시간창·동일 JSON record로 입증한 OS signature-block을 구분합니다. 모호한 SIGKILL/timeout·불완전 receipt는 성공이 아닙니다.

로컬 Accepted·staple과 실제 signed smoke 성공도 GitHub 업로드·자동 업데이트·최종 외부 배포 승인, live SSH·물리 입력·VoiceOver·OS 알림 성공을 뜻하지 않습니다. 실행 기록에는 run·P/C·각 승인 tuple·request ID·최종 hash와 검증하지 않은 항목을 별도로 남깁니다.

## 별도 Live SSH 시나리오

실제 접속이 승인된 경우에만 `USER@HOST`를 실제 대상으로 바꿔 Terminal에서 확인합니다.

```bash
ssh -o BatchMode=yes USER@HOST true
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
```

GUI의 `SSH_AUTH_SOCK`, 첫 `known_hosts`, 키 passphrase, 비대화형 원격 `PATH`가 Terminal과 다를 수 있습니다. 프롬프트 없는 키 기반 SSH와 base GPU CSV 성공을 확인한 뒤 행 메뉴의 연결 테스트와 모니터링/새로고침을 별도로 확인합니다.

승인된 `tml-server` 전용 검증은 ignored/env-gated로만 실행합니다.

```bash
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml live_tml_server -- --ignored --nocapture
```

원격 서버 요구사항은 NVIDIA 드라이버/`nvidia-smi`, POSIX shell, `ps`, Mac의 키 기반 SSH뿐입니다. GPUWatcher·nvitop·Python·collector·저장소 파일을 원격에 설치하지 않습니다. 선택적 지표 저하와 PID/권한/수집 시점 한계는 별도로 기록하고 nvitop/NVML+psutil과 정확히 같다고 주장하지 않습니다.
