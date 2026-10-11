# Framework Lifecycle 작업 가이드

이 문서는 Hyper-Waterfall 방법론 자체를 새 저장소에 설치하거나 기존 적용 저장소를 새 version으로 업데이트할 때의 판단 기준과 일반 task 전환 규칙을 정의한다. GPUWatch 안의 파일은 설치된 사본이며, upstream framework source는 `postmelee/hyper-waterfall` v0.3.0 release(`https://github.com/postmelee/hyper-waterfall/releases/tag/v0.3.0`)와 immutable commit `83836828a4da24385d0410515d35ee43946b981f`(`https://github.com/postmelee/hyper-waterfall/tree/83836828a4da24385d0410515d35ee43946b981f`)를 기준으로 확인한다. 일반 기능 task의 단계 진행 절차는 `task_workflow_guide.md`를 따른다.

## 적용 시점

- 대상 저장소에 Hyper-Waterfall을 처음 적용할 때
- 이미 적용된 저장소를 새 GitHub Release/tag 기준으로 업데이트할 때
- npm CLI, plugin, agent prompt가 lifecycle 판단 결과를 출력하고 실제 파일 변경으로 전환할 때
- Hyper-Waterfall 버전 업데이트 PR 후보를 일반 task로 추적해야 할 때

## Core Skill 경계

여기서 core Skill은 이슈, 브랜치, 계획서, 단계 보고, 최종 보고, PR 게시, merge 후 정리처럼 하이퍼-워터폴 타스크 진행 시점에 직접 쓰이는 Skill을 뜻한다.

설치·업데이트 lifecycle은 core Skill 목록을 늘리지 않는다. 먼저 `.hyper-waterfall/version.json`, 목표 upstream release의 immutable artifact, 적용 저장소의 사용자 수정 diff를 기준으로 판단한 뒤, 실제 변경은 일반 타스크 흐름으로 수행한다. GPUWatch 안에 `templates/manifest.json`이나 `docs/migrations/` 원본이 있다고 가정하지 않는다.

## 판단 기준 문서

| 작업 | 기준 문서 |
|---|---|
| 신규 적용 | upstream [`docs/agent-entrypoint.md`](https://github.com/postmelee/hyper-waterfall/blob/83836828a4da24385d0410515d35ee43946b981f/docs/agent-entrypoint.md), [`docs/lifecycle/adoption.md`](https://github.com/postmelee/hyper-waterfall/blob/83836828a4da24385d0410515d35ee43946b981f/docs/lifecycle/adoption.md), v0.3.0 release artifact |
| 기존 업데이트 | `.hyper-waterfall/version.json`, 목표 upstream release artifact, 적용 저장소 사용자 수정 diff |
| 업데이트 PR 전환 | 목표 upstream release artifact, 적용 저장소 `.github/pull_request_template.md` 설치본 |
| release/tag protocol | `release_update_protocol.md` |

## 파일 변경 전 판단

Lifecycle 판단 결과는 파일 변경 전 non-blocking Checkpoint다. 신규 적용이나 기존 업데이트 모두 다음 정보를 먼저 기록·보고한다. [`agent_code_hyperfall_rule_conflict.md`](agent_code_hyperfall_rule_conflict.md)에 따라 명확한 LOW/MEDIUM 요청은 해당 Scope의 안전한 적용 권한이며, 계획이나 routine Stage마다 재승인받지 않는다. locale 전환, 중대한 정책 변경, Scope 확장 등 위험 결정은 해당 결정/행동 직전에 관련 명시 승인을 받는다.

- 대상 저장소
- 목표 release/tag
- 현재 version (기존 업데이트)
- 현재 locale (기존 업데이트)
- 요청 locale 또는 locale 전환 요청
- 목표 release locale 지원
- 목표 upstream artifact와 설치본의 diff
- locale 관련 artifact diff
- locale 보존/전환 판단
- 자동 적용 가능 항목
- 수동 확인 필요 항목
- conflict 항목
- Hyper-Waterfall 버전 업데이트 PR 후보
- 위험 결정이 있는 경우 해당 대상·영향·범위와 승인 요청

기존 사용자 수정 파일이 감지되면 즉시 덮어쓰지 않는다. `.hyper-waterfall/version.json`, 목표 upstream artifact, 적용 저장소 diff로 자동 적용 가능 항목, 수동 확인 필요 항목, conflict 항목을 구분한다. Scope 내 가역적이며 사용자 작업을 덮어쓰지 않는 충돌 회복은 기록 후 자율 수행하고, 사용자 변경 보존 여부가 불명확하거나 위험 결정이 필요한 항목만 확인한다. 적용 파일 집합은 목표 upstream manifest 경계를 유지하며, lifecycle 요청을 upstream artifact 범위 밖 변경이나 release/tag 권한으로 확대하지 않는다.

## 일반 task 흐름 전환

판단 Checkpoint를 기록하고 필요한 위험 결정 승인을 확보한 범위에서 다음처럼 일반 타스크 흐름으로 전환한다.

1. 이슈가 없으면 `task-register`로 lifecycle 반영 이슈를 먼저 등록한다.
2. 이미 이슈가 있으면 `task-start`로 브랜치, 오늘할일, 수행계획서를 만든다.
3. Hyper-Waterfall 버전 업데이트 PR 후보가 여러 묶음이면 승인된 Scope 내에서 이슈 또는 Stage 분리를 기록하고 자율 진행한다. Scope 확장이나 위험 결정만 별도 확인한다.
4. 명확한 요청 범위의 안전한 변경은 판단 Checkpoint 후 적용한다. 승인이 필요한 위험 항목은 해당 승인 전 적용하지 않으며, 독립적인 안전 작업은 계속한다. 커밋은 명시 요청된 경우에만 수행한다.

## Hyper-Waterfall 버전 업데이트 PR 명명 규칙

- 작업 브랜치: `local/task{issue번호}`
- PR 게시 브랜치: `publish/task{issue번호}`
- 커밋 메시지: `Task #{issue번호}: Hyper-Waterfall {fromVersion} -> {toVersion} 버전 업데이트`
- 단계 커밋: `Task #{issue번호} Stage {N}: Hyper-Waterfall 버전 업데이트 {내용}`
- PR 제목: `Task #{issue번호}: Hyper-Waterfall {fromVersion} -> {toVersion} 버전 업데이트`

Hyper-Waterfall 버전 업데이트 PR은 GPUWatch app release PR과 다르다. Upstream framework release PR은 upstream 프레임워크 저장소의 `devel` 변경을 `main`로 승격해 tag 기준을 만드는 작업이고, Hyper-Waterfall 버전 업데이트 PR은 이미 적용된 저장소가 그 upstream release/tag를 따라가도록 변경 후보를 리뷰하는 작업이다.

Hyper-Waterfall 버전 업데이트 PR은 일반 task PR과 같은 계획·Stage·최종 Evidence의 non-blocking Checkpoint와 단일 exact publication Human 승인 게이트를 사용한다. Merge/Release 및 현재 OPEN 이슈 close의 별도 exact tuple 권한과 재검증은 유지한다.

## README와 CLI 경계

루트 README의 lifecycle 진입 안내는 선택 사항이며, 제품 전용 README에 Hyper-Waterfall 섹션을 추가하거나 수정해야 한다면 명확히 요청된 Scope 내에서 처리하고 Scope 밖 변경은 별도 확인한다. 상세 lifecycle 판단 기준은 루트 README가 아니라 `.hyper-waterfall/version.json`과 목표 upstream release artifact를 우선한다.

CLI가 `init`, `update`, `doctor` 결과를 만들더라도 이 결과는 파일 변경 전 판단 Checkpoint이며 자체로 요청 범위를 넓히거나 위험 행동을 승인하지 않는다. CLI 출력은 선택 locale, `.hyper-waterfall/version.json`의 `locale` 기록 계획, 현재 version, 현재 locale, 요청 locale 또는 locale 전환 요청, 목표 release/tag, 목표 release locale 지원, 목표 upstream artifact와 설치본 diff, locale 관련 artifact diff, 자동 적용 가능, 수동 확인 필요, conflict, 보류, 검증 및 필요한 위험 결정의 승인 요청을 포함한다. 명확한 요청 범위의 안전한 항목은 대기 없이 적용하고, locale 전환·중대한 정책 변경·Scope 결정 등 관련 승인이 필요한 항목은 승인 전 적용하지 않는다.

## 관련 문서

- upstream v0.3.0 release: `https://github.com/postmelee/hyper-waterfall/releases/tag/v0.3.0`
- upstream commit `83836828a4da24385d0410515d35ee43946b981f`: `https://github.com/postmelee/hyper-waterfall/tree/83836828a4da24385d0410515d35ee43946b981f`
- `release_update_protocol.md`: release/tag와 update protocol.
- `task_workflow_guide.md`: 요청 Scope 내 일반 task 진행과 위험 결정 승인 절차.
