# Git 워크플로우 매뉴얼

본 매뉴얼은 본 저장소의 브랜치 정책, Git 워크플로우 다이어그램, 메인테이너/컨트리뷰터 워크플로우 스크립트를 정의한다. 새 타스크 브랜치를 만들거나 PR 게시·merge·정리를 수행하기 전에 읽는다. 문서 파일 위치와 타스크 승인 절차는 각각 `document_structure_guide.md`, `task_workflow_guide.md`에서 다룬다.

## 핵심 용어

- **`devel`**: 모든 작업 PR이 모이는 개발 통합 브랜치. 새 작업 브랜치는 최신 `origin/devel` 기준으로 만든다.
- **`local/taskN`**: 이슈 번호 N의 로컬 작업 브랜치. 단계 커밋과 보고서 커밋은 이 브랜치에 쌓는다.
- **`publish/taskN`**: `local/taskN`을 원격에 게시하기 위한 PR용 브랜치. PR merge 후 삭제한다.
- **Open PR**: 검토 가능한 상태의 PR. 하이퍼-워터폴 최종 보고 후 `devel` 대상으로 만든다.
- **Draft PR**: no-PR publication이 생성한 직후 exact identity와 내용을 검증하기 위한 중간 상태. 같은 uninterrupted publication 실행에서 검증된 PR만 ready로 전환한다.
- **분리 worktree**: 메인 worktree가 다른 작업에 쓰이고 있을 때 별도 디렉터리에서 같은 저장소의 다른 브랜치를 작업하는 방식.
- **GPUWatch app release**: GPUWatcher 앱 자체를 배포하기 위해 `devel`의 검증된 변경을 `main`으로 승격하고 앱 release tag를 만드는 흐름.
- **Upstream framework release**: `postmelee/hyper-waterfall`의 GitHub Release/tag. GPUWatch의 설치본 업데이트 판단은 `.hyper-waterfall/version.json`과 immutable upstream artifact를 비교한다.
- **Hyper-Waterfall 버전 업데이트 PR**: 기존 적용 저장소를 새 upstream Hyper-Waterfall release/tag로 올리기 위해 만드는 issue-backed PR. 상세는 [`release_update_protocol.md`](release_update_protocol.md)와 목표 upstream artifact의 update PR 기준을 따른다.

## 브랜치 관리

| 브랜치 | 용도 |
|--------|------|
| `main` | GPUWatcher 앱 최종 릴리즈. 태그(v0.5.0 등)로 안정 버전 보존 |
| `devel` | 개발 통합 |
| `local/task{num}` | 타스크별 작업 |
| `publish/task{num}` | `devel` 대상 PR 생성을 위한 원격 게시 브랜치. PR merge 후 삭제 |

## Git 워크플로우

```
local/task{N} ── 커밋 · 커밋 · 커밋 ──→ publish/task{N} push
                                          │
                                          └─→ devel 대상 PR → 리뷰 → merge
                                                                       │
                                                                       └─→ devel 누적
                                                                              │
                                                                              └─→ main PR (릴리즈 시점) → 태그
```

병렬 task는 각각 독립적인 `local/task{N}` 브랜치로 위 흐름을 반복한다.

- **타스크 브랜치**: `local/task{N}`에서 잘게 커밋. 작업 단위마다 커밋.
- **원격 게시 브랜치**: `local/task{N}` 작업이 리뷰 가능한 상태가 되면 [`task-final-report`](../skills/task-final-report/SKILL.md)의 두 승인 절차로 `publish/task{N}` exact OID를 게시한다. no-PR 상태에서는 draft를 만들고 반환 identity를 검증한 뒤 ready로 전환하며, 기존 ready 상태는 verification-only로 처리한다.
- **원격 push**: `local/task` 브랜치는 **로컬 유지 (원격 push 금지)**를 원칙으로 한다. 원격에는 `publish/task{N}`와 merge 결과 브랜치만 유지한다.
- **`devel` 대상 PR**: 작업 단위 PR은 기본적으로 Open PR로 생성하고, 최종 보고와 검증 결과를 PR 본문에 반영한 상태에서 review/merge 한다.
- **merge 전략**: `devel` 대상 PR은 merge commit 유지 또는 `--no-ff` 원칙을 기본으로 한다. squash merge는 단계별 커밋 의미가 사라질 수 있으므로 기본값으로 두지 않는다.
- **`main` merge (PR 기반)**: GPUWatch app 릴리즈 시점에 `devel` -> `main` PR 생성 -> 리뷰(approve) -> merge 후 태그 생성.
- **`main` -> `devel` 동기화**: release, hotfix, README 보정처럼 `main`에만 생긴 변경은 같은 턴의 명시 승인 또는 별도 승인된 동기화 단계에서 `main` -> `devel` PR이나 승인된 일반 merge로 되돌려 반영한다. review/approval gate는 생략하지 않는다.

## PR 유형 구분

일반 task PR, GPUWatch app release PR, upstream Hyper-Waterfall framework release는 분리한다. task PR은 `local/taskN -> publish/taskN -> devel` 흐름을 따르고, app release PR은 `devel -> main` 흐름을 따른다. 기존 적용 저장소 업데이트는 upstream framework release 이후 별도 Hyper-Waterfall 버전 업데이트 PR로 수행한다. Release/tag와 update protocol 상세는 [`release_update_protocol.md`](release_update_protocol.md)를 따른다.

| 유형 | 목적 | 브랜치 흐름 | PR 제목 |
|---|---|---|---|
| task PR | 저장소 기능, 문서, 운영 작업을 이슈 단위로 반영 | `local/task{N}` -> `publish/task{N}` -> `devel` | `Task #{N}: {작업 제목}` |
| release PR | `devel`에 누적된 GPUWatch app 변경을 `main`로 승격하고 app tag 기준을 만든다 | `devel` -> `main` | `Release: {version}` |
| Hyper-Waterfall 버전 업데이트 PR | 기존 적용 저장소를 현재 version에서 목표 release/tag로 올린다 | `local/task{N}` -> `publish/task{N}` -> `devel` | `Task #{N}: Hyper-Waterfall {fromVersion} -> {toVersion} 버전 업데이트` |

Hyper-Waterfall 최초 bootstrap을 `main`에 반영하는 PR은 app release가 아니므로 `chore(workflow): {요약}` 제목을 사용할 수 있다. 이후 GPUWatch app release PR은 `Release: {version}` 형식을 따른다.

## 메인테이너 워크플로우

이 절의 목적은 브랜치 흐름을 설명하는 것이며, GitHub 변경 명령을 복사해 실행하는 위치가 아니다. host, repository, remote ref, PR head는 승인 대기 중에도 변할 수 있으므로 ambient repository 또는 현재 `HEAD`를 기준으로 `gh` 명령을 실행하지 않는다.

1. task PR의 publish와 Open PR 생성은 [`task-final-report`](../skills/task-final-report/SKILL.md)만 사용한다. 이 절차는 final report/evidence 승인과 publication 승인을 분리한다. 첫 승인이 있기 전에는 publication input을 만들지 않고, 둘째 승인이 있기 전에는 원격 mutation(`push`, `gh api --method POST`, PR 생성 또는 재개)을 하지 않는다. Publication 준비 단계의 canonical identity, issue, ref, Open PR 상태 조회는 read-only로만 수행한다.
2. task publication은 `branch-absent-pr-absent`, `branch-exact-pr-absent`, `branch-exact-pr-draft`, `branch-exact-pr-ready`만 유효 상태로 분류하고 모든 state의 matching PR을 조회한다. 실행 시작 state는 승인 state와 exact하게 같아야 하며 absent 승인은 concurrent PR을 adopt하지 않는다. no-PR 상태는 생성 직전 absence를 재검증한 뒤 draft 생성, POST 반환 number/node ID 결박, exact draft GET, 같은 node ready 전환, exact non-draft GET, closing linkage 순으로 진행한다. ready 상태는 verification-only다. duplicate, closed, mismatch, create/ready interruption 또는 state drift는 fresh preparation과 replacement publication 승인을 요구하며 manifest나 fuzzy resume를 사용하지 않는다.
3. 리뷰 및 merge는 [`pr_process_guide.md`](pr_process_guide.md)의 승인 절차를 따른다. 이 매뉴얼에 `gh pr review`나 `gh pr merge`의 축약 예시를 두지 않는다. 직접 실행이 불가피한 자동화는 승인된 PR 번호, canonical repository, base/head tuple, head OID를 REST로 다시 읽고, merge REST 요청의 `sha`에 확인한 head OID를 넣어야 한다. 확인값이 하나라도 달라지면 review/merge하지 않는다.
4. merged task PR의 branch, worktree, issue 정리는 [`pr-merge-cleanup`](../skills/pr-merge-cleanup/SKILL.md)만 사용한다. merge 자체는 현재 `OPEN` 이슈 close 승인이 아니다. 이 절차는 read-only preflight에서 merged PR tuple과 issue 상태를 확인하고, 이슈가 `OPEN`이면 exact approval tuple을 요구한다. 삭제 직전과 close 직전에도 같은 PR/이슈 tuple을 다시 읽고, 그 경계에서 `OPEN`이면 같은 exact approval tuple 없이는 삭제 또는 close로 진행하지 않는다. 이전 관측에서 `CLOSED`였다는 이유만으로 현재 `OPEN` 이슈를 닫을 수 없다.
5. `devel -> main` release PR과 `main -> devel` 동기화 PR은 승인된 release operation에 한해 별도 작업지시자 승인과 canonical repository/PR tuple/head OID/REST `sha` precondition을 갖춘 절차로 수행한다. 이 release 전용 직접 PR mechanics는 ordinary issue-based task PR의 우회로가 아니며, task PR의 승인이나 이전 release 승인을 재사용하지 않는다.

## 컨트리뷰터 워크플로우 (Fork 기반)

```bash
# 1. 원본 저장소 Fork (GitHub에서 1회)
# 2. Fork한 저장소에서 작업
git clone https://github.com/{contributor}/GPUWatch.git
git checkout -b feature/my-task
# ... 작업 + 커밋 ...
git push origin feature/my-task

# 3. 원본 저장소의 devel로 PR 생성
CANONICAL_REPOSITORY="jinzer0/GPUWatch"
CANONICAL_REPOSITORY_ID="1256824919"
test "$(GH_HOST=github.com gh api --hostname github.com "repos/$CANONICAL_REPOSITORY" --jq .id)" = "$CANONICAL_REPOSITORY_ID" || exit 1
test "$(GH_HOST=github.com gh api --hostname github.com "repos/$CANONICAL_REPOSITORY" --jq .full_name)" = "$CANONICAL_REPOSITORY" || exit 1
GH_HOST=github.com gh pr create --repo "$CANONICAL_REPOSITORY" --base devel --head {contributor}:feature/my-task --title "제목"

# 4. 메인테이너가 리뷰 + merge
```

## FAQ / 흔한 실수

### 다른 에이전트와 메인 worktree가 충돌할 때

먼저 `git status --short --branch`로 현재 브랜치와 미커밋 변경을 확인한다. 다른 작업자의 변경이 있으면 되돌리지 말고, 새 작업은 분리 worktree에서 시작하는 쪽을 우선 검토한다. 이미 진행 중인 타스크와 같은 파일을 건드려야 한다면 작업지시자에게 충돌 범위를 공유하고 순서를 정한다.

### `devel`에 rebase가 필요해 보일 때

기본 흐름은 `git fetch origin` 후 새 `local/taskN` 브랜치를 정확한 최신 `origin/devel`에서 만드는 것이다. local `devel`의 unpublished commit은 새 task에 포함하거나 임의로 reset/rebase하지 않는다. PR 충돌이나 오래된 기준 브랜치 문제가 생기면 충돌 파일과 local/remote branch 관계를 확인하고, rebase/merge 중 어떤 방식으로 회복할지 작업지시자 승인 후 진행한다.

### 잘못된 브랜치를 원격에 push했을 때

원격에 `local/taskN`을 직접 올렸거나 잘못된 이름으로 push한 경우 즉시 추가 push를 멈춘다. 아직 PR을 만들지 않았다면 올바른 `publish/taskN` 브랜치를 새로 push하고, 잘못 올라간 원격 브랜치는 작업지시자 확인 후 삭제한다. 이미 PR을 만들었다면 PR base/head와 diff를 확인한 뒤, 새 PR을 만들지 기존 PR head를 보정할지 결정한다.

### PR 본문에 문서 링크를 넣을 때

내부 task PR의 게시 절차는 [`task-final-report`](../skills/task-final-report/SKILL.md), SHA 고정 문서 링크 형식은 [`pr_command_guide.md`](pr_command_guide.md)를 따른다.

### merge 후에도 로컬 브랜치가 남아 있을 때

PR이 `MERGED` 상태이고 base/head가 대상 task와 일치하는지 read-only preflight로 먼저 확인한다. 분리 task worktree에서 cleanup을 시작했다면 `git worktree list --porcelain`로 기본 worktree를 확인하고 그 경로로 이동한 뒤 `devel`로 복귀한다. local `devel`이 안전하게 fast-forward 가능할 때만 `origin/devel`로 갱신하고, unpublished commit 때문에 앞서거나 갈라졌으면 이력을 보존해 결과에 기록한다. 별도 task worktree는 기본 worktree에서 non-force로 제거하고, 원격 `publish/taskN`과 로컬 `local/taskN`을 정리한 뒤 마지막에 이슈를 close한다. 단, 이슈 close는 삭제 직전과 close 직전 재검증에서 현재 `OPEN`으로 관측된 이슈에 대해 exact approval tuple이 있을 때만 가능하다. 상세 명령과 중단 조건은 [`pr-merge-cleanup`](../skills/pr-merge-cleanup/SKILL.md)을 따른다.

## 관련 매뉴얼

- [`task_workflow_guide.md`](task_workflow_guide.md): 이슈 기반 타스크 시작, 단계 승인, 최종 보고, PR 게시 순서.
- [`document_structure_guide.md`](document_structure_guide.md): 계획서, 단계 보고서, 최종 보고서의 문서 위치와 파일명.
- [`pr_command_guide.md`](pr_command_guide.md): PR 생성 명령과 문서 링크 규칙.
- [`pr_process_guide.md`](pr_process_guide.md): PR 처리 entrypoint.
- [`release_update_protocol.md`](release_update_protocol.md): release/tag와 update protocol.
