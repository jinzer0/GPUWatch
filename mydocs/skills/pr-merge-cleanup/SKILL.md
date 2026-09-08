---
name: pr-merge-cleanup
description: |
  PR merge 확인 후 부산물을 정리하는 절차를 적용한다.
  GitHub 이슈 close, publish/task{N} 원격 브랜치 삭제,
  로컬 local/task{N} 브랜치와 분리 worktree 정리, devel 복귀를 수행한다.
  PR이 실제로 merge된 직후에만 호출.
---

# PR merge 후 부산물 정리

## 트리거

- 작업지시자가 "merge 후 정리", "타스크 정리"를 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 작업지시자가 지정한 PR 번호와 이슈 번호를 각각 `PR_NUMBER`, `ISSUE_NUMBER` 환경 변수로 전달
- 대상 PR이 GitHub에서 실제 merged 상태이며 base/head가 `devel` <- `publish/task${ISSUE_NUMBER}`
- 작업지시자의 이슈 close 승인 (또는 PR 본문에 `closes #N` 명시되어 자동 close된 상태)

## 절차

1. PR과 이슈 상태 확인
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   EXPECTED_HEAD_REF="publish/task${ISSUE_NUMBER}"
   EXPECTED_HEAD_REPOSITORY="jinzer0/GPUWatch"
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "$EXPECTED_HEAD_REF"
   test "$PR_HEAD_REPOSITORY" = "$EXPECTED_HEAD_REPOSITORY"
   gh issue view "$ISSUE_NUMBER" --json state
   ```
   - PR 상태, base, head 중 하나라도 다르면 즉시 중단하고 작업지시자에게 보고한다.
2. 안전한 cleanup 실행 위치 확정
   ```bash
   set -euo pipefail
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly ISSUE_NUMBER
   EXPECTED_TASK_BRANCH="local/task${ISSUE_NUMBER}"
   CURRENT_WORKTREE="$(git rev-parse --show-toplevel)"
   COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
   case "$COMMON_DIR" in
     */.git) PRIMARY_WORKTREE="${COMMON_DIR%/.git}" ;;
     *) printf 'Unable to identify the primary worktree\n' >&2; exit 1 ;;
   esac
   TASK_WORKTREE_TO_REMOVE=""
   if test "$CURRENT_WORKTREE" != "$PRIMARY_WORKTREE"; then
     test "$(git branch --show-current)" = "$EXPECTED_TASK_BRANCH"
     TASK_WORKTREE_TO_REMOVE="$CURRENT_WORKTREE"
     cd -- "$PRIMARY_WORKTREE"
   fi
   test "$(git rev-parse --show-toplevel)" = "$PRIMARY_WORKTREE"
   test -z "$(git status --porcelain)"
   PRIMARY_BRANCH="$(git branch --show-current)"
   case "$PRIMARY_BRANCH" in
     devel|"$EXPECTED_TASK_BRANCH") ;;
     *) printf 'Primary worktree is on an unrelated branch\n' >&2; exit 1 ;;
   esac
   git worktree list --porcelain
   ```
   - 기본 worktree에서 시작했지만 별도 `local/task{N}` worktree가 존재하면 위 목록에서 절대 경로를 확인해 `TASK_WORKTREE_TO_REMOVE`에 기록한다.
   - 이후 모든 명령은 기본 worktree에서 실행한다. 기본 worktree가 dirty하거나 경로를 확정할 수 없으면 side effect 전에 중단한다.
   - one-shot shell 도구를 사용하는 agent는 이후 호출의 `workdir`를 기록한 `PRIMARY_WORKTREE`로 지정하고, 제거할 경로가 있으면 기록한 `TASK_WORKTREE_TO_REMOVE`를 환경 변수로 명시 전달한다. 이전 호출의 `cd`나 shell 변수가 유지된다고 가정하지 않는다.
3. devel 최신화
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "publish/task${ISSUE_NUMBER}"
   test "$PR_HEAD_REPOSITORY" = "jinzer0/GPUWatch"
   git fetch origin --prune
   if test "$(git branch --show-current)" != "devel"; then
     git checkout devel
   fi
   git pull --ff-only
   test "$(git branch --show-current)" = "devel"
   ```
4. 원격 publish 브랜치 삭제 (이미 삭제된 경우 skip)
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "publish/task${ISSUE_NUMBER}"
   test "$PR_HEAD_REPOSITORY" = "jinzer0/GPUWatch"
   PUBLISH_REF="publish/task${ISSUE_NUMBER}"
   REMOTE_PUBLISH_REF="$(git ls-remote --heads origin "refs/heads/${PUBLISH_REF}")"
   if test -n "$REMOTE_PUBLISH_REF"; then
     git push origin --delete "$PUBLISH_REF"
   fi
   ```
5. 분리 worktree 사용했다면 기본 worktree에서 제거
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "publish/task${ISSUE_NUMBER}"
   test "$PR_HEAD_REPOSITORY" = "jinzer0/GPUWatch"
   if test -n "${TASK_WORKTREE_TO_REMOVE:-}"; then
     CURRENT_ROOT="$(git rev-parse --show-toplevel)"
     CURRENT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
     TARGET_COMMON_DIR="$(git -C "$TASK_WORKTREE_TO_REMOVE" rev-parse --path-format=absolute --git-common-dir)"
     test "$TASK_WORKTREE_TO_REMOVE" != "$CURRENT_ROOT"
     test "$TARGET_COMMON_DIR" = "$CURRENT_COMMON_DIR"
     test "$(git -C "$TASK_WORKTREE_TO_REMOVE" branch --show-current)" = "local/task${ISSUE_NUMBER}"
     git worktree remove "$TASK_WORKTREE_TO_REMOVE"
     git worktree prune
   fi
   ```
   - dirty 또는 locked worktree는 강제 제거하지 않고 중단해 작업지시자에게 보고한다.
6. 로컬 작업 브랜치 삭제 (재사용 가능성 없을 때만)
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "publish/task${ISSUE_NUMBER}"
   test "$PR_HEAD_REPOSITORY" = "jinzer0/GPUWatch"
   if git show-ref --verify --quiet "refs/heads/local/task${ISSUE_NUMBER}"; then
     git branch -d "local/task${ISSUE_NUMBER}"
   fi
   # 강제 삭제는 작업지시자 명시 승인 후에만: git branch -D "local/task${ISSUE_NUMBER}"
   ```
7. 이슈 close (앞 단계가 모두 성공했고 자동 close되지 않은 경우만)
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER
   read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY < <(
     gh pr view "$PR_NUMBER" --json state,baseRefName,headRefName,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv'
   )
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "publish/task${ISSUE_NUMBER}"
   test "$PR_HEAD_REPOSITORY" = "jinzer0/GPUWatch"
   if test "$(gh issue view "$ISSUE_NUMBER" --json state --jq .state)" = "OPEN"; then
     gh issue close "$ISSUE_NUMBER"
   fi
   ```
8. 오늘할일 최종 정리: `mydocs/orders/{yyyymmdd}.md`의 `#${ISSUE_NUMBER}` 행이 `완료` + 시각 기록되어 있는지 재확인
9. 결과 보고: 정리된 항목 목록을 작업지시자에게 짧게 회신

## 검증

- `gh pr view "$PR_NUMBER"`가 `MERGED`, base `devel`, head `publish/task${ISSUE_NUMBER}`임을 확인
- `git branch -vv | grep "local/task${ISSUE_NUMBER}"` 출력 없음 (삭제된 경우)
- `git ls-remote origin "publish/task${ISSUE_NUMBER}"` 빈 출력 (원격 삭제 확인)
- `git worktree list` 출력에 정리 대상 worktree 미존재
- `git branch --show-current`가 `devel`
- `git rev-parse --show-toplevel`이 기본 worktree 절대 경로와 일치

## 절대 하지 말 것

- PR이 merged 상태가 아닌데 이슈 close
- 작업지시자 다른 task 브랜치(`local/task{다른번호}`)나 메인 worktree 삭제
- `git branch -D` 강제 삭제 무단 사용 (병합 안 된 커밋이 있을 때 손실 위험)
- 다른 작업자의 stash 삭제
- 분리 task worktree 안에서 `devel` checkout 또는 자기 자신 제거 실행
- 기본 worktree를 제거 대상으로 지정하거나 dirty/locked task worktree 강제 제거
- cleanup 대상과 다른 PR/이슈 번호, base, head 조합으로 이슈 close 또는 브랜치 삭제
- cleanup과 branch 삭제가 끝나기 전에 이슈 close

## 호출 방법

- Codex: `$pr-merge-cleanup` 또는 `/skills` 메뉴
- Claude Code: `/pr-merge-cleanup`
