# GPUWatcher Phase 6: Settings Console 리팩토링

GPUWatcher의 `Settings` 화면을 Supabase/Vercel 스타일의 서버 관리 콘솔로 리팩토링해라.

이전 단계에서 다음 작업이 완료되었다.

* macOS Native Frame과 Full-bleed Console shell
* 공통 디자인 토큰과 UI primitives
* Overview fleet console
* Server Detail과 Live Monitor workspace
* Process Table과 Process Detail inspector

이번 단계에서는 서버 registry, 서버 편집 폼, SSH 연결 테스트, enable/disable, 삭제, OpenSSH config import를 하나의 명확한 관리 경험으로 정리한다.

백엔드, DTO, IPC 또는 SSH 동작을 변경하는 작업이 아니다.

## 작업 전 확인

다음 파일과 관련 테스트를 먼저 읽어라.

* `AGENTS.md`
* `src/AGENTS.md`
* `src/features/settings/SettingsScreen.tsx`
* `src/features/settings/ConfiguredServersPanel.tsx`
* `src/features/settings/SettingsServerForm.tsx`
* `src/features/settings/SettingsImportPanel.tsx`
* `src/features/settings/settingsModel.ts`
* `src/features/settings/settingsModel.test.ts`
* `src/features/settings/useSettingsController.ts`
* `src/features/settings/SettingsScreen.test.tsx`
* `src/components/ui/`
* `src/styles/components.css`
* `src/styles/screens.css`
* `src/styles/drawers.css`
* Phase 1~5에서 변경된 shell, Button, form control, feedback, status 컴포넌트

기존 디자인 시스템과 Full-bleed shell을 유지하고 이전 floating dashboard 스타일을 되살리지 마라.

# 핵심 목표

Settings 화면은 다음 작업을 쉽게 수행할 수 있어야 한다.

1. 등록된 서버 목록과 활성 상태 확인
2. 새 서버 생성
3. 기존 서버 선택과 수정
4. SSH 연결 테스트
5. polling 활성화 또는 비활성화
6. 서버 삭제
7. OpenSSH config 후보 확인
8. 단일 후보를 수동 폼에 적용
9. 여러 유효 후보를 disabled 상태로 bulk 저장
10. import 경고, 중복, 누락 정보 확인

# 화면 정보 구조

다음 구조를 사용한다.

```text
Page header
Registry summary and page actions

Server registry workspace
├── Server list
└── Server editor

SSH config import workspace
```

SSH config import는 서버 편집 form 안에 포함하지 않는다.

현재 `SettingsImportPanel`을 독립적인 page section으로 이동해 서버 편집과 import preview가 서로의 문맥을 방해하지 않게 한다.

# Page header

기존 `Settings / Server registry` identity를 유지한다.

권장 구조:

```text
Settings

Server registry                    [Import SSH config] [New server]
Manage SSH-backed NVIDIA GPU hosts and polling behavior.
```

조건:

* 큰 floating panel로 감싸지 않는다
* 다른 화면과 동일한 heading 계층 사용
* `New server`는 편집 상태를 초기화하는 명확한 action
* `Import SSH config`는 import workspace로 이동하거나 import action을 실행
* button accessible name 유지
* page header에 form validation이나 mutation error를 몰아넣지 않는다

# Registry summary

현재 서버 배열에서 파생 가능한 compact summary를 표시할 수 있다.

권장 정보:

* Total servers
* Enabled
* Disabled
* 현재 편집 중인 서버

예:

```text
5 servers · 4 enabled · 1 disabled
```

조건:

* pure helper로 계산
* summary가 화면의 주인공이 되지 않음
* 빈 배열에서 숫자와 empty state가 모순되지 않음
* 별도의 backend API 추가 금지

필요하면 `settingsModel.ts`에 다음과 유사한 helper를 추가한다.

```ts
type ServerRegistrySummary = {
  total: number;
  enabled: number;
  disabled: number;
};
```

# Registry workspace

현재 우측 고정 `25rem` panel 구조를 다음과 같은 master-detail layout으로 변경한다.

```text
┌──────────────────────┬───────────────────────────────────┐
│ Configured servers   │ Add server / Edit server          │
│                      │                                   │
│ ● Training Rig       │ Identity                          │
│   alice@train:22     │ SSH connection                    │
│                      │ Polling                           │
│ ○ Render Box         │                                   │
│   bob@render:22      │ [Test connection] [Save]          │
└──────────────────────┴───────────────────────────────────┘
```

권장 desktop 구조:

* 왼쪽 server list: 약 17rem~20rem
* 오른쪽 editor: `minmax(0, 1fr)`
* 양쪽은 하나의 workspace surface 또는 separator 기반 layout
* 각 pane를 독립적인 거대한 floating card로 만들지 않음
* 최소 창 크기에서는 list가 editor 위로 이동할 수 있음

## Server list

Configured server row에서 다음 정보를 표시한다.

* server name
* `username@host:port`
* enabled / disabled 상태
* polling interval 또는 updated timestamp 중 유용한 metadata
* 현재 편집 선택 상태

조건:

* server row 전체를 선택 가능한 button으로 만들 수 있음
* 선택된 row에 `aria-current` 또는 적절한 상태 노출
* 색상만으로 선택 상태를 구분하지 않음
* 현재 서버 name과 connection identity가 긴 경우 truncate 또는 wrap
* enable/disable action이 row 선택과 충돌하지 않음
* 전체 row마다 거대한 Enable/Disable 버튼을 배치하지 않음
* enable/disable은 compact trailing button 또는 accessible switch 형태 사용
* status badge를 유지
* mutation pending 중 관련 action만 disabled
* 모든 서버 action을 전역적으로 막지 않도록 가능한 범위에서 개선

서버 목록을 클릭하면 기존 `editServer(server.id)` 동작을 유지한다.

새로운 routing이나 URL state를 추가하지 않는다.

## Empty registry

서버가 없을 때 다음을 명확히 표시한다.

* 아직 등록된 서버가 없음
* 오른쪽에는 새 서버 form 유지
* `New server` 또는 form을 통해 바로 추가 가능
* 존재하지 않는 onboarding API를 만들지 않음

# Server editor

편집 form을 의미 중심 section으로 나눈다.

```text
Add server / Edit server

Identity
- Name

SSH connection
- Host
- Port
- Username
- SSH key path

Polling
- Polling interval
- Enabled

Remote requirements

Connection test result

Form actions
```

## Identity

* Name
* editing 시 server identity 또는 ID를 secondary metadata로 보여줄 수 있음
* ID를 사용자가 편집할 수 있게 하지 않음

## SSH connection

다음 필드를 유지한다.

* Host
* SSH port
* Username
* SSH key path

조건:

* native input 유지
* label과 input 연결
* helper text를 적절히 추가
* SSH key path는 파일 내용 입력란처럼 보이지 않게 함
* key path는 optional임을 표시 가능
* private key material을 붙여 넣어도 된다는 인상을 주지 않음
* host alias도 유효한 값임을 SSH import 문맥과 일치시킴
* 입력값이나 민감한 path를 로그 또는 UI 다른 영역에 복제하지 않음

추천 helper text:

```text
Path to a local private key file. Key material itself is never stored here.
```

문구는 실제 제품 계약과 일치하게 작성한다.

## Polling

다음을 유지한다.

* Polling interval seconds
* Enabled

Enabled checkbox는 공통 control 또는 switch 스타일로 정리할 수 있다.

조건:

* native checkbox semantics 또는 동등한 accessible switch semantics
* label 클릭 가능
* checked 상태 노출
* interval이 비어 있을 때 기존 null 의미 유지
* 0을 valid 값처럼 허용하지 않음
* validation 범위 변경 금지

## Remote host requirements

현재 no-install 요구사항을 유지한다.

반드시 포함할 의미:

* 원격 GPUWatcher 설치 불필요
* nvitop 설치 불필요
* NVIDIA driver와 `nvidia-smi`
* key-based SSH
* POSIX shell
* `ps`

조건:

* form 중간의 큰 중첩 card가 아니라 compact informational callout 또는 expandable help 사용
* `gpuwatcher --json` 문구 추가 금지
* collector command UI 추가 금지
* installed collector / no-install mode selector 추가 금지
* copy가 지나치게 길어 form의 주 작업을 방해하지 않게 함

# Form actions

action 계층을 명확히 한다.

권장 구성:

```text
[Test SSH connection]                     [Cancel/New] [Save server]
```

편집 상태에서만 별도 danger zone을 표시한다.

조건:

* Save server는 primary
* Test SSH connection은 secondary
* New 또는 Cancel editing은 ghost/secondary
* Delete는 일반 form action row에서 분리
* pending 상태를 button label 또는 feedback과 연결
* action 순서는 다른 화면의 Button 문법과 일치
* Enter submit 동작 유지
* 모든 button의 기본 type을 명확히 지정

## Save

기존 동작을 유지한다.

* trim 처리
* 빈 key path는 null
* 빈 polling interval은 null
* 저장 성공 시 selected server와 editing server 갱신
* 관련 query invalidation
* API가 허용하는 필드만 전달
* preview metadata를 저장 payload에 포함하지 않음

save 성공 feedback을 추가할 수 있지만 backend message를 조작하거나 새로운 API를 만들지 않는다.

## Validation

현재 validation 규칙을 유지한다.

* SSH port: 정수 1~65535
* polling interval: 빈 값 또는 정수 1~86400
* SSH key path: 한 줄 filesystem path
* private key material 금지

개선 사항:

* global ErrorState 하나보다 관련 form section 또는 field 가까이에 validation 표시
* invalid field에 `aria-invalid`
* error message에 `aria-describedby`
* 첫 invalid field로 focus 이동을 고려할 수 있음
* validation message 문구의 계약을 불필요하게 변경하지 않음
* HTML native validation과 custom validation이 충돌하지 않게 함

## Connection test

기존 `testConnection` mutation을 유지한다.

조건:

* 저장된 server ID가 있을 때만 실행
* 아직 저장되지 않은 새 form에서는 disabled 상태와 이유가 이해 가능
* pending, success, failure 상태를 editor 안에 표시
* server identity와 result가 연결되어 보임
* 성공은 compact success feedback
* 실패는 DiagnosticPanel
* diagnostic type, message, guidance 유지
* local path와 token redaction 유지
* server 선택이 바뀌면 기존처럼 test result reset
* test 오류를 page 상단 global error로 중복 표시하지 않음

## Delete danger zone

현재 삭제 action은 editor 하단의 별도 danger zone으로 이동한다.

예:

```text
Danger zone

Delete Training Rig
This removes the saved server configuration from this Mac.

[Delete server]
```

삭제 전 명시적인 확인 단계를 추가한다.

허용되는 구현:

* inline confirmation
* accessible confirmation dialog
* 공통 dialog가 없으면 단순한 2단계 confirmation state

금지:

* 브라우저 native `window.confirm`에 전적으로 의존
* server name 확인 없이 즉시 삭제
* delete API 계약 변경

확인 UI는 최소한 다음을 표시한다.

* 삭제할 server name
* local saved configuration 삭제임
* remote host의 파일이나 process를 삭제하지 않는다는 점
* Cancel
* Confirm delete

조건:

* 새 server form에서는 danger zone 없음
* pending 중 중복 submit 방지
* 성공 시 기존처럼 editing과 selection 초기화
* 삭제 실패는 danger zone 내부에 표시
* delete error를 save/test error와 혼합하지 않음
* confirm dialog를 사용하면 focus management와 Escape/Cancel 처리

# Enable / disable

server list에서 기존 mutation을 유지한다.

* `setServerEnabled(id, enabled)`
* 성공 후 settings 관련 query invalidation

조건:

* enabled/disabled 상태를 색상만으로 표현하지 않음
* mutation pending 상태 표시
* enable/disable은 server 삭제나 form 저장과 다른 동작임이 명확
* disable이 remote server를 종료한다는 오해를 주지 않음
* 필요한 경우 helper tooltip 또는 accessible description 제공
* optimistic update를 새로 추가하지 않아도 됨

# SSH config import workspace

SSH import UI를 server form 내부에서 제거하고 독립 section으로 이동한다.

권장 구조:

```text
SSH config import

Preview aliases from local OpenSSH configuration.
Imported servers are created disabled.

[Scan SSH config]

Import summary and warnings

[ ] gpu-prod-a     alice@gpu-a:22       Ready
[ ] gpu-prod-b     bob@gpu-b:2202       Ready
[ ] missing-user   gpu-c:22              Missing username

[Select all valid] [Save selected hosts]
```

## Import action

기존 `listSshConfigHosts` 동작을 유지한다.

* Import from SSH config
* pending feedback
* backend error
* browser fallback/backend unavailable
* candidates와 global warnings

manual server form은 import 실패 또는 backend unavailable 상태에서도 계속 사용할 수 있어야 한다.

## Candidate presentation

현재 큰 candidate card 목록을 compact selection list 또는 table 형태로 정리한다.

각 candidate에 표시:

* host alias
* resolved hostname 또는 draft host
* username
* port
* key path 존재 여부를 노출해야 한다면 민감하지 않은 방식
* selectable 상태
* skip reason
* candidate warnings
* `Use <alias>` 또는 `Use in form` action
* bulk selection checkbox

조건:

* checkbox accessible name 유지
* disabled candidate는 선택 불가
* disabled 이유가 `aria-describedby`로 연결
* Missing username
* Already saved as configured server
* Duplicate import candidate
* warning과 skip reason을 서로 구분
* host alias에 거대한 display typography 사용 금지
* 각 candidate를 거대한 nested card로 만들지 않음
* 긴 alias와 hostname 처리
* 후보 순서나 중복 판정 의미 변경 금지

## Single candidate import

`Use candidate` 동작을 유지한다.

* candidate draft를 manual form에 복사
* 저장하지는 않음
* `hostname`, `ProxyJump`, `ProxyCommand`, warning metadata 등을 form payload에 포함하지 않음
* imported candidate의 existing enabled 값 의미 유지
* 사용 후 editor가 화면상 명확히 보이도록 scroll/focus 개선 가능
* 자동 저장 금지

## Bulk selection

기존 bulk import 동작을 유지한다.

* Select all valid hosts
* individual toggle
* selected count
* Save selected hosts
* valid candidate만 저장
* invalid candidate는 skipped
* 각 save 실패를 독립적으로 수집
* 일부 성공 시에도 나머지 실패 결과 표시
* saved / skipped / failed summary 유지

중요:

* bulk imported server는 기존대로 `enabled: false`
* 저장 전 자동 연결 테스트 금지
* 저장 순서와 backend API 의미 변경 금지
* 새로운 bulk backend action 추가 금지

## Bulk result

결과를 다음처럼 읽기 쉽게 정리한다.

```text
Bulk import complete
3 saved · 1 skipped · 1 failed

Skipped
- gpu-prod-copy: Duplicate import candidate

Failed
- gpu-lab: sanitized error message
```

조건:

* role=status와 live region 유지
* 실패 정보는 sanitize
* raw local path, token, private key material 노출 금지
* 성공·경고·실패를 색상만으로 구분하지 않음
* bulk 결과가 candidate list 전체를 밀어내지 않게 compact하게 표현

# Error architecture

현재 page 상단에 모든 mutation error를 쌓는 방식 대신 오류를 관련 영역에 배치한다.

권장:

* server list load error: registry workspace
* save validation/save error: editor
* test error: connection test panel
* delete error: danger zone
* enable error: 해당 server row 또는 registry feedback
* SSH import error: import workspace
* bulk save error: bulk result

이를 위해 controller가 mutation error를 별도 필드로 노출하도록 리팩토링할 수 있다.

단, mutation 동작과 API는 변경하지 않는다.

모든 error message에 기존 sanitization 규칙을 적용한다.

# Responsive layout

desktop:

```text
server list | editor
```

최소 창 크기:

```text
server list
editor
```

조건:

* 고정 `25rem` 때문에 editor가 눌리지 않게 함
* CSS grid `minmax(0, 1fr)` 사용
* 긴 host, path, warning이 horizontal overflow를 만들지 않음
* import candidate list가 content 폭을 밀지 않음
* shell content 영역만 스크롤
* editor footer가 필요하다면 sticky 가능하지만 shell titlebar와 충돌 금지

# Density

full / compact 모드를 모두 지원한다.

component 변수로 제어:

* workspace gap
* list row padding
* editor section gap
* form control gap
* action footer padding
* import candidate row height

compact 모드에서도 field, warning 또는 action을 제거하지 않는다.

# 접근성

* Settings page `h2`
* registry, editor, import workspace에 명확한 heading
* label/input 연결
* helper/error text의 `aria-describedby`
* invalid field의 `aria-invalid`
* enabled checkbox/switch state
* selected server state
* mutation pending live region
* connection failure alert
* bulk result status
* delete confirmation dialog 또는 confirmation section label
* delete confirm 후 focus 관리
* candidate checkbox accessible name과 disabled reason
* keyboard만으로 server 선택, form 편집, import, 삭제 가능
* focus-visible 유지
* 색상만으로 status를 표현하지 않음

# 보안 및 제품 불변조건

다음을 절대 변경하지 마라.

* key-based system SSH
* no-install remote collection
* 원격 GPUWatcher 설치 불필요
* 원격 nvitop 설치 불필요
* `nvidia-smi`, POSIX shell, `ps` 요구사항
* SSH key path만 저장
* private key material 저장 금지
* preview metadata 저장 금지
* unsupported ProxyJump / ProxyCommand 무시 및 warning
* local path와 token sanitization
* bulk imported servers는 disabled
* duplicate key: host + username + port
* action-specific preload/IPC
* generic renderer invoke 금지
* scheduler ownership
* server input contract
* query invalidation 범위
* browser fallback

다음을 새로 추가하지 마라.

* collector command
* `gpuwatcher --json`
* installed/no-install mode selector
* remote setup command editor
* password SSH 입력
* private key textarea
* remote process action
* generic backend invocation

# Controller 리팩토링

UI 구조 개선을 위해 `useSettingsController`를 정리할 수 있다.

허용:

* mutation error를 영역별로 노출
* selected/editing state helper
* registry summary
* delete confirmation을 위한 local UI state
* pending server ID 추적
* candidate/import presentation helper
* form validation metadata

금지:

* API call 순서 또는 payload 변경
* query key 변경
* store semantics 변경
* bulk import의 sequential save 의미 변경
* selection과 editing side effect 변경
* backend unavailable fallback 변경

복잡한 presentation logic은 pure helper로 분리하고 test를 작성한다.

# 수정 범위

주요 수정 대상:

* `src/features/settings/SettingsScreen.tsx`
* `src/features/settings/ConfiguredServersPanel.tsx`
* `src/features/settings/SettingsServerForm.tsx`
* `src/features/settings/SettingsImportPanel.tsx`
* `src/features/settings/settingsModel.ts`
* `src/features/settings/settingsModel.test.ts`
* `src/features/settings/useSettingsController.ts`
* `src/features/settings/SettingsScreen.test.tsx`
* `src/styles/screens.css`
* 필요한 경우 공통 dialog/form primitive
* 관련 공통 component tests

Overview, Detail, History, Processes의 화면 구조는 이번 작업에서 재설계하지 마라.

# 테스트

기존 Settings 테스트의 행동 계약을 유지한다.

최소 검증:

* page와 registry identity
* initial server loading
* server query error
* no servers
* new server form
* existing server 선택과 form population
* server input trim
* 빈 key path → null
* 빈 polling interval → null
* enabled 값
* API에 허용된 field만 전송
* collectorCommand 없음
* `gpuwatcher --json` 없음
* port validation
* polling interval validation
* private key material rejection
* save success와 query invalidation
* save error sanitization
* connection test pending/success/failure
* server 변경 시 test result reset
* enable/disable mutation
* delete와 selection 초기화
* delete confirmation
* delete cancel
* delete failure
* no-install remote requirements
* SSH config import pending/error/success
* backend unavailable에서도 manual form 사용 가능
* candidate를 form에 적용
* candidate preview metadata는 저장 payload에 없음
* candidate warnings sanitization
* valid candidate checkbox
* invalid candidate disabled reason
* duplicate saved server
* duplicate import candidate
* missing username
* select all valid
* individual selection toggle
* bulk save
* partial bulk save failure
* bulk saved/skipped/failed summary
* bulk imports disabled
* full/compact density
* minimum width layout

추가 검증:

* registry summary
* selected server accessible state
* editor section headings
* field helper와 error 연결
* delete danger zone은 edit 상태에서만 표시
* confirm 전 delete API가 호출되지 않음
* import workspace가 server form 밖에 존재
* long hostname, path, alias, warning 렌더링
* import error가 manual editor를 숨기지 않음
* area-specific errors가 중복 표시되지 않음

구현 class 문자열보다 role, accessible name, visible text, focus와 사용자 동작을 우선한다.

# 검증 명령

```bash
npm run test -- --run
npm run build
npm run electron:build
```

가능하면:

```bash
npm run electron:dev
```

# 수동 QA

1. server 없음
2. server 한 개
3. server 여러 개
4. 긴 server name과 hostname
5. enabled/disabled 혼합
6. new server form
7. edit server form
8. invalid port
9. invalid polling interval
10. private key material paste
11. save pending/success/error
12. test connection pending/success/failure
13. server 선택 변경 후 result reset
14. enable/disable
15. delete cancel
16. delete confirm
17. delete failure
18. SSH import candidate 없음
19. 유효 candidate 여러 개
20. missing username
21. saved duplicate
22. import duplicate
23. warning과 sensitive path/token
24. single candidate를 form에 적용
25. bulk import 일부 성공/일부 실패
26. backend unavailable import
27. manual form은 계속 사용 가능
28. full density
29. compact density
30. minimum window size

# 완료 기준

* Settings가 폼과 카드의 무작위 모음이 아니라 server management console처럼 보인다.
* server list와 editor의 관계가 명확하다.
* 새 server와 edit server 상태가 혼동되지 않는다.
* save, test, enable, delete action의 위험도와 계층이 분명하다.
* 삭제에는 명시적 확인이 있다.
* SSH import가 form과 분리된 독립 workspace로 보인다.
* 후보 선택과 skip reason을 빠르게 이해할 수 있다.
* manual settings는 import 오류와 무관하게 계속 사용 가능하다.
* 민감정보 redaction과 no-install 제품 계약이 유지된다.
* backend, DTO, IPC 변경이 없다.

# 완료 보고 형식

1. Settings 정보 구조 변경
2. registry master-detail layout
3. editor field grouping
4. save/test/delete action 계층
5. delete confirmation 방식
6. SSH import workspace 구조
7. candidate와 bulk result 표현
8. 영역별 error 처리
9. responsive 및 density 처리
10. 접근성 개선
11. 수정 파일 목록
12. 테스트와 빌드 결과
13. 수동 QA 항목
14. Phase 7에 남길 작업

명시적으로 요청받지 않는 한 commit이나 push를 하지 마라. 기존 Phase 1~5 변경을 되돌리지 말고 작업 범위를 벗어난 파일을 수정하지 마라.
