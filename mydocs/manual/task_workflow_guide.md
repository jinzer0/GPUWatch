# 타스크 진행 절차 매뉴얼

본 매뉴얼은 하이퍼-워터폴 방법론에서 타스크를 진행하는 절차, 타스크 번호와 커밋 메시지 명명 규칙, 작업 시간 결정 규칙, 승인 간주 조건을 정의한다. GitHub Issue를 받아 작업을 시작하거나 단계 종료, 최종 보고, PR 게시, merge 후 정리를 수행하기 전에 읽는다. 문서 폴더 위치는 `document_structure_guide.md`, 브랜치 세부 운용은 `git_workflow_guide.md`에서 다룬다.

## 핵심 용어

- **수행계획서**: 작업 목적, 범위, 예상 단계, 검증 계획을 정리하고 첫 승인 요청에 사용하는 문서.
- **구현계획서**: 승인된 수행계획을 실제 단계 단위로 나누고 각 단계의 산출물·검증·커밋 메시지를 정리한 문서.
- **단계별 완료보고서**: 한 단계가 끝났을 때 `mydocs/working/`에 남기는 `_stage{N}.md` 보고서.
- **최종 결과보고서**: 모든 단계가 끝난 뒤 `mydocs/report/`에 남기는 `_report.md` 보고서.
- **승인 간주 조건**: 작업지시자가 같은 스레드에서 다음 단계 진행을 명시한 경우에만 해당 단계 승인을 인정하는 기준.

## 문서 출력 형식

계획서, 단계 보고서, 최종 보고서, 오늘할일, 외부 PR 검토 문서는 `mydocs/_templates/`의 중앙 템플릿을 기준으로 작성한다. Skill은 절차와 검증을 정의하고, 중앙 템플릿은 출력 형식을 정의한다. 둘이 어긋나면 같은 PR에서 함께 수정한다.

GitHub Issue와 Pull Request는 GitHub 플랫폼 산출물이다. 새 task 이슈는 `.github/ISSUE_TEMPLATE/task.yml`을 입력 프롬프트 형식으로 사용하고, PR 본문은 `.github/pull_request_template.md`를 출력 형식으로 사용한다.

PR 본문의 `검증` 섹션은 `.github/pull_request_template.md`의 `자동 검증`, `수동/시나리오 검증`, `CI/원격 검증`, `검증 한계` 구조를 따른다. 실행한 명령만 나열하지 않고 검증 결과와 근거를 함께 적으며, 실행하지 않은 검증은 표에 남기지 않고 `검증 한계` 또는 `남은 리스크`로 분리한다.

## 프레임워크 lifecycle 작업

Hyper-Waterfall 방법론 자체를 새 저장소에 설치하거나 기존 적용 저장소를 새 version으로 업데이트하는 작업은 먼저 framework lifecycle 판단을 거친다. GPUWatch app release와 upstream Hyper-Waterfall framework release는 분리한다. 판단 기준과 일반 task 전환 규칙은 [`framework_lifecycle_guide.md`](framework_lifecycle_guide.md)를 따른다.

- 신규 적용 판단: upstream [`docs/agent-entrypoint.md`](https://github.com/postmelee/hyper-waterfall/blob/83836828a4da24385d0410515d35ee43946b981f/docs/agent-entrypoint.md)와 [`docs/lifecycle/adoption.md`](https://github.com/postmelee/hyper-waterfall/blob/83836828a4da24385d0410515d35ee43946b981f/docs/lifecycle/adoption.md)
- 기존 업데이트 판단: `.hyper-waterfall/version.json`, 목표 upstream release artifact, 적용 저장소 사용자 수정 diff
- 업데이트 PR 전환: 목표 upstream release artifact와 적용 저장소 `.github/pull_request_template.md` 설치본
- release/tag와 update protocol: [`release_update_protocol.md`](release_update_protocol.md)

Lifecycle 판단 결과가 승인되어 실제 파일 변경으로 넘어가면, 그때부터 이 매뉴얼의 일반 타스크 절차를 적용한다. 승인 전에는 목표 upstream artifact와 설치본 diff에 포함된 파일을 대상 저장소에 적용하지 않는다.

## 타스크 번호 관리

- **GitHub Issues**를 타스크 번호로 사용한다. 자동 채번으로 중복 방지.
- **milestone_name**: GitHub milestone title 그대로 사용하며 `^M[0-9]+x?$`에 맞아야 한다. 예: `M100`, `M05x`
- **milestone_slug**: `milestone_name`의 앞 `M`만 소문자로 바꾸고 숫자와 선택적 `x`는 보존한다. 예: `M100` -> `m100`, `M05x` -> `m05x`
- 새 타스크 등록: 이슈가 없는 작업은 [`task-register`](../skills/task-register/SKILL.md) Skill로 중복 이슈, milestone, label을 확인하고 생성 전 승인을 받은 뒤 GitHub Issue를 만든다.
- 타스크 시작: 이미 생성된 이슈 번호가 있으면 [`task-start`](../skills/task-start/SKILL.md) Skill로 브랜치, 오늘할일, 수행계획서를 만든다.
- 브랜치명: `local/task{issue번호}` (예: `local/task1`)
- PR 생성용 원격 브랜치명: `publish/task{issue번호}` (예: `publish/task1`)
- 커밋 메시지 규칙:
  - 기본형: `Task #{issue번호}: 내용`
  - 단계 커밋: `Task #{issue번호} Stage {N}: 내용`
  - 세부 하위 단계 허용: `Task #{issue번호} [Stage {N.M}]: 내용`
  - 단계 완료보고서 또는 최종 보고서와 함께 묶는 커밋: `Task #{issue번호} Stage {N} + 최종 보고서: 내용`
- `mydocs/orders/`에서 `M100 #1` 형식으로 마일스톤+이슈 참조
- 타스크 완료 시: `gh issue close {번호}` 또는 커밋 메시지에 `closes #번호`

## 타스크 진행 절차

1. 이슈가 없는 작업은 `task-register`로 GitHub Issue 등록. 기존 이슈가 있으면 해당 번호 사용
2. 작업지시자가 지정한 이슈를 `task-start`로 시작하고 `local/task{issue번호}` 브랜치 생성 후 진행
3. 수행 전 수행계획서 작성 → 승인 요청
4. 구현 계획서 작성 (최소 3단계, 최대 6단계) → 내용 승인 요청. 승인 후 Stage 1 시작 전에 승인본을 독립 커밋으로 기록
   ```bash
   git add "mydocs/plans/task_{milestone_slug}_{issue번호}_impl.md"
   git commit -m "Task #{issue번호}: 승인된 구현 계획서 확정" \
      -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
      -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   git rev-parse HEAD
   ```
   - 출력된 exact commit SHA를 작업지시자에게 보고하고 같은 스레드에서 SHA 확인을 받은 뒤 Stage 1에 진입한다. 이후 검증에서 commit message 검색으로 승인 commit을 다시 추론하지 않는다.
   - 구현계획서 내용 승인과 exact SHA 확인은 승인본 커밋과 Stage 1 진입만 허용한다. 이후 단계 진입, 최종 게시, merge 승인을 대신하지 않는다.
   - Stage 1 이후 계획서를 변경해야 하면 현재 단계를 멈추고 변경본 내용을 다시 승인받아 `_impl.md`만 새 독립 commit으로 기록한다. 새 exact SHA까지 확인받은 뒤 이후 단계에서 그 SHA와 현재 plan blob의 일치를 검증한다.
5. 단계별 진행 시작
   - 각 Stage와 최종 통합 검증 명령을 실행하기 전에 작업지시자가 확인한 최신 구현계획서 exact SHA를 입력으로 사용한다.
   - 승인 commit이 `_impl.md` 하나만 변경하고 현재 HEAD의 ancestor인지 확인한다.
   - 승인 commit, HEAD, index의 `_impl.md` mode가 모두 `100644`인지, working tree의 `_impl.md`가 symlink가 아닌지 확인한다.
   - 승인 commit의 plan blob이 HEAD와 실제 working-tree file hash 모두와 동일한지 확인한다. 하나라도 실패하면 계획서의 검증 명령을 실행하지 않는다.
6. 각 단계 완료 후 단계별 완료보고서 작성 → 승인 요청
7. **단계별 완료보고서(`_stage{N}.md`)는 해당 단계 소스 커밋과 함께 타스크 브랜치에서 커밋한다.**
8. 승인 후 다음 단계 진행
9. 모든 단계 완료 시 최종 결과보고서 작성·검증과 오늘할일 갱신을 수행한다.
10. **최종 결과보고서(`_report.md`)와 오늘할일(`orders/`) 갱신을 타스크 브랜치에서 커밋한다.**
11. 커밋 직후 즉시 멈추고, 같은 스레드에서 커밋된 최종 보고서와 수용 기준 검증 근거 승인 요청. 이전 단계 승인이나 task-final-report 호출 지시는 이 승인으로 대체되지 않는다.
12. 새 승인을 받은 뒤 `publish/task{issue번호}`로 원격 push 후 `devel` 대상 Open PR 생성. PR 생성 전 반드시 `git status`로 미커밋 파일이 없는지 확인한다.
13. 승인 요청 시 작업지시자가 피드백 문서를 `mydocs/feedback/`에 등록
14. 모든 테스트 통과 시 피드백 없음
15. PR merge 확인 후 이슈 close와 오늘할일 상태를 최종 정리하고, merge 완료된 `publish/task{issue번호}` 원격 브랜치와 재생성 가능한 로컬 부산물을 정리

## 작업 규칙

- 작업 시간의 시작과 종료는 작업지시자가 결정한다. 에이전트가 임의로 작업 종료를 제안하거나 시간을 한정하지 않는다.

## 승인 간주 조건

- 작업지시자가 같은 스레드에서 "계속 진행", "다음 단계 진행"처럼 명시 지시한 경우에만 해당 단계 승인으로 간주한다.

## FAQ / 흔한 실수

### 단계 검증이 실패했을 때

검증 실패 상태로 단계 보고서와 커밋을 만들지 않는다. 실패한 명령, 오류 요약, 수정 방향을 먼저 확인하고 같은 단계 안에서 회복한다. 단계 범위가 커져 계획서와 맞지 않게 되면 작업지시자에게 단계 재분할 또는 구현계획서 보정을 요청한다.

### 단계를 몇 개로 나눌지 애매할 때

기본은 3~6단계다. 한 단계는 한 번에 검증하고 보고할 수 있는 크기로 둔다. 공유 규칙 변경, 코드 변경, 문서/검증 정리처럼 위험도가 다른 작업은 단계로 분리하는 편이 추적하기 쉽다. 단순 문서 보강처럼 위험이 낮은 작업은 문서 단위로 단계를 나눌 수 있다.

### 단계 승인 없이 다음 단계 작업을 시작했을 때

즉시 멈추고 현재 변경 범위를 확인한다. 아직 커밋 전이면 변경을 분리해 현재 승인된 단계에 속하는 것만 남긴다. 이미 커밋했다면 작업지시자에게 상황을 보고하고 보정 커밋 또는 계획서 갱신 방향을 확인한다.

### 승인된 구현계획서를 커밋하지 않고 Stage 1을 시작했을 때

즉시 Stage 작업을 멈추고 구현계획서 승인본과 working tree 상태를 확인한다. Stage 산출물과 섞지 말고 승인된 `_impl.md`만 독립 커밋한 뒤 Stage 1을 다시 시작한다.

## SKILL 호출 표시 안내

하이퍼-워터폴 SKILL 절차를 적용할 때는 실제 절차 실행 전에 사용자에게 한 줄로 알린다. 이는 묵시 호출을 허용한다는 뜻이 아니라, 작업지시자의 명시 지시나 단계 승인에 따라 해당 절차를 적용한다는 사실을 투명하게 표시하는 안내다.

권장 형식:

- `task-register 스킬을 호출합니다.`
- `task-start 스킬을 호출합니다.`
- `task-stage-report 스킬을 호출합니다.`
- `task-final-report 스킬로 진행합니다.`
- `pr-merge-cleanup 스킬을 호출합니다.`
- `external-pr-review 스킬을 호출합니다.`
- `todo 스킬을 호출합니다.`

이 표시는 해당 하이퍼-워터폴 절차를 적용할 때 사용한다.

Skill 목록이나 사용자-facing 요약 문서가 별도 승인된 task로 존재하는 경우, 이 섹션은 실제 호출 표시 원칙으로 남기고 해당 요약 문서와 함께 확인한다. 현재 GPUWatch 루트 README는 제품 전용 문서이므로 Hyper-Waterfall Skill 표가 있다고 가정하지 않는다.

문서 구조 정책 검토나 manual 문서 중립성 판단은 그 자체로 별도 SKILL 호출 표시 대상이 아니다. 그 판단 결과로 이슈 등록, 타스크 시작, 단계 종료 같은 core Skill 절차를 실행할 때만 해당 Skill 호출 표시를 사용한다.

`task-final-report`는 최종 보고서뿐 아니라 위 PR 본문 검증 구조까지 맞춰 Open PR을 게시하는 절차다.

최종 보고서와 오늘할일 커밋 뒤에는 반드시 멈춘다. 작업지시자가 같은 스레드에서 최종 보고서와 수용 기준 검증 근거를 승인한 뒤에만 원격 push와 PR 생성을 시작한다.

설치·업데이트 lifecycle 판단 자체는 별도 하이퍼-워터폴 절차 호출 표시 대상이 아니다. 다만 그 결과로 GitHub Issue를 등록하거나 타스크를 시작하면 `task-register`, `task-start` 등 실제로 적용하는 core Skill의 호출 표시 원칙을 따른다.

GPUWatch app release, hotfix, README 보정처럼 `main`에만 변경이 생기면 별도 승인된 동기화 단계에서 `main` -> `devel` 반영을 수행한다. 이 동기화도 review/approval gate를 보존한다.

## 관련 매뉴얼

- [`document_structure_guide.md`](document_structure_guide.md): 수행계획서, 단계 보고서, 최종 보고서 위치, 파일명, 중앙 템플릿 정책.
- [`git_workflow_guide.md`](git_workflow_guide.md): `local/taskN`, `publish/taskN`, `devel` 브랜치 운용과 PR 게시.
- [`framework_lifecycle_guide.md`](framework_lifecycle_guide.md): 신규 적용, 기존 업데이트, 업데이트 PR 전환 기준.
- [`release_update_protocol.md`](release_update_protocol.md): release/tag와 update protocol.
- [`agent_code_hyperfall_rule_conflict.md`](agent_code_hyperfall_rule_conflict.md): 하이퍼-워터폴 규칙과 에이전트 기본 동작이 충돌하는 지점.
