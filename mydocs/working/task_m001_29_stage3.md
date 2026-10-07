# Task #29 Stage 3 단계 보고서

GitHub Issue: [#29](https://github.com/jinzer0/GPUWatch/issues/29)
구현계획서: [`task_m001_29_impl.md`](../plans/task_m001_29_impl.md)
Stage: 3 — 서버 관리 시트와 실패 회복
상태: 구현·검증 완료, 산출물·단계 커밋 승인 완료

## 단계 목적

선택 서버의 GPU 상세를 유지한 채 사이드바 `+`와 서버별 `…` 메뉴에서 추가·가져오기·편집·삭제·monitoring·SSH 연결 테스트를 수행한다. 관리 대상과 상세 선택을 분리하고, 저장·삭제·가져오기 실패에 입력·목록·확인 상태가 유실되지 않게 한다.

- Stage 3 착수 승인 범위에서 `/Users/kjy/Desktop/Codes/projects/GPUWatch-task29`, `local/task29`에 구현했다.
- 구현 기준 HEAD는 Stage 2 커밋 `5f463b5ed434fa2dcba8ee9f628e7438e5356c22`이다. 검증·보고 시점에는 이번 단계의 커밋·push를 하지 않았다.
- 승인된 구현계획 `6a4f059a5961c86b398bfeeab285d7835a8632a3`는 HEAD ancestor다. 승인본·HEAD·index·working tree의 계획서 blob `3c251ff0354d3e24472fabff3013a6d3c23ec9a1`이 동일하다. 계획서와 문서 위치 판단은 변경하지 않았다.

## 산출물

| 파일 | 변경 요약 |
|---|---|
| `src/lib/store.ts`, `src/lib/store.test.ts` | add/edit/delete/test/import 요청과 명시적 대상 ID, request fence, 선택과 관리 상태의 독립성 |
| `src/components/Shell.tsx`, `src/components/Shell.test.tsx` | `+` 메뉴·서버별 `…`, 메뉴 키보드·focus·viewport 경계, monitoring pending·실패 보존 |
| `src/features/settings/ConfiguredServersPanel.tsx` | 종전 전체 registry 패널을 제거하고 기존 파일에서 전용 서버 메뉴 primitives 제공 |
| `src/features/settings/ServerManagerSheet.tsx`, `src/features/settings/ServerManagerSheet.test.tsx` | 모드별 관리 시트, body portal, focus trap·복귀, 미저장 보호, pending close 방지, 삭제·연결 결과 |
| `src/features/settings/SettingsScreen.tsx`, `src/features/settings/SettingsScreen.test.tsx`, `src/features/settings/SettingsAccessibility.test.tsx` | 기존 광범위 관리 화면을 시트 진입 wrapper로 대체, controller·필드 접근성·가져오기 회귀 보존 |
| `src/features/settings/useSettingsController.ts` | 실제 form/baseline dirty 비교, 저장·삭제·test의 요청/대상 fence, confirmed ID만 cache 제거, 부분 가져오기 누적 성공·실패와 실패만 재시도 |
| `src/features/settings/SettingsServerForm.tsx` | pending 중 변경·중복 실행 차단, Cancel-first 삭제, 로컬 저장 전용 피드백과 보이는 위치로 scroll, 필드 오류·키 경로/no-install 안내 보존 |
| `src/features/settings/SettingsImportPanel.tsx` | 읽기·저장 pending, 후보 validation·중복·경고·부분 실패, focusable 가로 스크롤 표 |
| `src/features/settings/settingsModel.ts`, `src/features/settings/settingsModel.test.ts` | form 비교·가져오기 중복 판정 정합화, 폐기된 registry summary helper와 전용 테스트 제거 |
| `src/App.tsx`, `src/App.test.tsx` | GPU 상세 배경 유지와 관리 시트 결합, 명시적 close 이후 탐색 회귀 |
| `src/index.css` | 작은 sidebar controls·경계 내 popover, 중앙 관리 시트·내부 세로/표 가로 scroll·평탄한 editor |
| `mydocs/orders/20261005.md`, 이 보고서 | Stage 3 진행 상태와 검증·잔여 위험 기록 |

### 핵심 동작

- 편집·삭제·test는 해당 `…` 행의 ID로 수행한다. 상세 선택을 바꿔도 관리 draft를 암묵적으로 버리지 않는다. 늦은 결과가 다른 요청의 form·결과를 덮지 않는다.
- 저장 성공은 로컬 설정 저장만 뜻한다. `Local configuration saved. SSH connection has not been tested by saving.`을 표시하며 저장 때문에 SSH를 test하지 않는다. 다시 편집하면 이전 성공 표시를 지운다.
- 삭제는 저장된 ID·이름을 확인하고 safe default Cancel에 focus한다. 실패하면 대상·확인·목록·별도 상세 선택을 보존하고 성공한 ID만 제거한다.
- 실제 saved enabled 상태만 표시한다. monitoring 실패 시 서버 목록을 optimistic 변경하지 않는다.
- SSH config 읽기 실패는 재시도할 수 있다. 부분 성공은 즉시 재선택 대상에서 제외하고 query refresh가 늦어도 재저장하지 않는다. failed 후보만 재시도하고 누적 결과를 표시한다. 가져온 서버는 disabled로 저장한다.
- 미저장 form/선택 후보는 안전한 `계속 편집`을 기본으로 둔다. 저장·삭제 처리 중 닫기는 명시적 안내와 함께 막는다. invoker 삭제 시 `+`로 focus를 복귀하며 새 시트의 focus를 가로채지 않는다.

## 본문 변경 정도 / 본문 무손실 여부

- 작업 기록을 제외한 제품 문서·승인 설계 사본·구현계획은 변경하지 않았다. README·기존 smoke의 통합 갱신은 승인 계획의 Stage 4 범위다.
- action-specific backend bridge와 별도 `gpuwatcherUi` 외형 bridge, Electron/helper/SSH/SQLite 계약은 변경하지 않았다. `electron/`, `crates/`, `fixtures/`, package/lockfile, `src/AGENTS.md`의 Stage 3 diff가 없음을 확인했다.
- 기존 필드 validation·saved SSH test·import warning/중복 처리·원격 no-install·로컬 키 파일 경로 안내를 유지했다. 비밀키 내용·임의 원격 명령·설치형 collector·generic invoke를 추가하지 않았다.
- 폐기한 registry 전체 패널·요약 helper·중복 monitoring controller 경로의 테스트는 새 메뉴/시트의 관찰 가능한 행동 회귀로 대체했다. backend 기능 테스트를 삭제하거나 skip하지 않았다.

## 검증 결과

최종 제품 변경을 모두 반영한 실행 명령:

```bash
npm run test -- --run src/features/settings/ServerManagerSheet.test.tsx src/features/settings/SettingsScreen.test.tsx src/features/settings/SettingsAccessibility.test.tsx src/features/settings/settingsModel.test.ts src/components/Shell.test.tsx src/lib/store.test.ts src/App.test.tsx electron/ipc.test.ts
npm run test -- --run
npm run build
npm run electron:build
git diff --check
```

- **OK** focused **8 files / 129 tests**, 전체 **27 files / 379 tests**. 최종 Vitest 시작 출력은 각각 13:11:26, 13:11:29다.
- **OK** renderer TypeScript/Vite build와 Electron TypeScript build, whitespace 검증.
- 대상≠선택, 메뉴 키보드·bounds, dirty 원복·안전한 discard, pending close·중복 실행, 요청/대상 변경 뒤 늦은 결과, local save≠SSH 성공, null SSH success message의 unknown, 삭제 cancel·실패·cache 제거, stale query와 partial import retry, required-field/error ARIA를 포함한다.
- 초기 accessible-name 모호성, safe discard focus race, nullable connection message TypeScript 오류를 수정한 뒤 최종 gates를 통과했다. portal 이후 최종 검증이다.
- JS/TS formatter가 프로젝트에 설정되어 있지 않아 임의 formatter 설치·대규모 재포맷을 하지 않았다. Rust 변경이 없어 Cargo tests/format은 이번 단계에서 실행하지 않았다.

### 격리 Electron renderer QA

owned 임시 HOME·SQLite·Electron userData, 실제 release helper로 demo + disabled 서버 12개를 준비했다. 별도 Vite/CDP 61025/61026에서 guard가 실패/SSH 진단/SSH config 후보를 주입하며 실제 SSH transport를 막았다. 사용자 SSH config·운영 DB를 사용하지 않았다.

```bash
node /var/folders/17/pstbgvvx179d3c10ln70s7g00000gn/T/GPUWatch-task29-stage3-w4y5u8gw/verify.mjs
```

- **OK** 실제 renderer에 전달한 Home/Enter·Escape·Space·문자 입력: 명시적 다른 행 대상 편집, 입력 중 focus 유지, Escape의 safe continue와 draft 보존.
- **OK** 저장 실패 후 form·실제 로컬 registry 보존, 로컬 저장 성공 표시. light screenshot에서 success 문구가 시트 내부에 보임을 확인했다.
- **OK** 삭제 cancel → injected failure → 재시도 성공, 다른 상세 선택 보존, 삭제된 invoker의 `+` fallback.
- **OK** monitoring injected failure 후 실제 saved enabled state 보존, saved 대상 SSH 인증 진단 한 번, 직접 추가.
- **OK** config 읽기 실패 후 복구, A 성공/B 실패 후 failed B만 retry. guard 호출 A 저장 **1회**, B 저장 **2회**.
- **OK** 880×708에서 하단 메뉴 top 491/bottom 627, 문서 폭 880. dark import 시트 right 760/bottom 692, 내부 scrollHeight 866/clientHeight 642, 표 scrollWidth 928/clientWidth 604. overflow는 시트·표 안에 국한했다.
- **OK** SSH collector 요청 (`refresh_server`, `poll_due_servers`) **0**, simulated `test_connection` **1**(정확한 saved ID), real SSH transports **0**, History 요청 **0**, notification 관측 **0**.
- harness의 safe continue 뒤 다음 동작은 복귀 focus가 완료될 때까지 기다리도록 수정했다. 기존 잘못된 피드백 문자열·guard error envelope·브라우저 평가식도 바로잡았다. harness timing/selector 오류를 제품 성공으로 집계하지 않았다.

### 로컬 부산물

- 최종 harness는 `finally`에서 소유 CDP/socket·Vite/Electron을 종료했다. 61025/61026 LISTEN **0**, owned Electron/Node process **0**을 별도로 확인했다.
- 이 검증의 receipt는 보고서에 보존했다. 다음 단계에 필요 없는 owned Stage 3 임시 HOME·DB·userData·guard/harness·로그·스크린샷만 정리했다. 기존 worktree·사용자 자료·기존 smoke는 삭제하지 않았다.
- 검증·보고 시점의 index는 비어 있었고 커밋·push·PR·이슈 상태 변경은 하지 않았다.

## 잔여 위험

- 검증 입력은 CDP를 통한 **renderer 키보드 입력**이다. physical OS mouse/shortcut, native titlebar drag, VoiceOver 검증으로 주장하지 않는다. CDP mouse 시도는 메뉴를 열지 못했고 desktop capture도 `COMPUTER_SCREENSHOT_FAILED`였다.
- SSH 진단·config 후보·저장/삭제/monitoring/partial import 실패는 격리 guard 주입이다. 실제 SSH 인증·GUI SSH 환경·실제 OS 알림 허용/거부/Focus·unsigned packaged smoke는 이번 단계에서 검증하지 않았다.
- 기존 Fleet/History 전제 smoke는 Stage 4 갱신 대상이며 현재 제품의 통합 완료를 주장하지 않는다.

## 다음 단계 영향

- Stage 4는 승인 후 freshness/continuous availability·watch 저장 조건·cooldown·lifecycle 계약, 통합 smoke와 사용자 문서를 수행한다. 이번 단계가 backend 관측/알림 규칙을 대신 승인하거나 구현한 것은 아니다.
- 메뉴 monitoring은 saved 상태, 관리 시트는 명시적 요청 ID/target, appearance 창은 별도 UI bridge를 유지해야 한다. 사용자 저장≠SSH 성공, 실패 시 stale 성공 telemetry 보존, import success 재저장 금지를 통합 회귀에 포함한다.
- physical OS 입력·VoiceOver·실제 SSH·OS 알림·packaged 검증의 미완료 상태를 이어받는다.

## 승인 요청

- 작업지시자가 같은 스레드에서 `Stage 3 산출물·단계 커밋 승인`을 명시했다. 승인된 산출물과 이 보고서를 하나의 단계 커밋으로 기록한다.
- Stage 4 착수, push·PR 생성·merge·이슈 close는 별도 승인 사항이며 실행하지 않았다.
