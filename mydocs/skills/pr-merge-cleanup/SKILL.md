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

1. 대상과 실행 위치 사전 확인 (read-only)
   ```bash
   gh pr view "$PR_NUMBER" --repo jinzer0/GPUWatch \
     --json state,baseRefName,headRefName,headRepository,mergedAt,mergeCommit
   gh issue view "$ISSUE_NUMBER" --repo jinzer0/GPUWatch --json state
   git remote get-url origin
   git remote get-url --push origin
   git worktree list --porcelain
   ```
   - 작업지시자가 지정한 PR/이슈 번호, `MERGED`, `devel` <- `publish/taskN`, canonical repository, 기본/분리 worktree 경로를 확인한다.
2. 승인받은 cleanup transaction 실행
   - 아래 전체 block을 한 번의 shell 호출에서 실행한다. 일부만 떼어 실행하거나 중간에 `PR_NUMBER`, `ISSUE_NUMBER`, repository, worktree path를 다시 주입하지 않는다.
   ```bash
   set -euo pipefail
   case "${PR_NUMBER:-}" in
     ""|*[!0-9]*) printf 'PR_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   case "${ISSUE_NUMBER:-}" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must contain decimal digits only\n' >&2; exit 1 ;;
   esac
   readonly PR_NUMBER ISSUE_NUMBER

   CANONICAL_REPOSITORY="jinzer0/GPUWatch"
   EXPECTED_HEAD_REF="publish/task${ISSUE_NUMBER}"
   EXPECTED_TASK_BRANCH="local/task${ISSUE_NUMBER}"
   readonly CANONICAL_REPOSITORY EXPECTED_HEAD_REF EXPECTED_TASK_BRANCH

   test "$(gh repo view "$CANONICAL_REPOSITORY" --json nameWithOwner --jq .nameWithOwner)" = "$CANONICAL_REPOSITORY"
   for ORIGIN_URL in "$(git remote get-url origin)" "$(git remote get-url --push origin)"; do
     case "$ORIGIN_URL" in
       git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
       *) printf 'origin does not target the canonical repository\n' >&2; exit 1 ;;
     esac
   done

   PR_TUPLE="$(gh pr view "$PR_NUMBER" --repo "$CANONICAL_REPOSITORY" \
     --json state,baseRefName,headRefName,headRepository \
     --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner] | @tsv')"
   case "$PR_TUPLE" in
     *$'\n'*) printf 'PR identity query returned multiple lines\n' >&2; exit 1 ;;
   esac
   IFS=$'\t' read -r PR_STATE PR_BASE_REF PR_HEAD_REF PR_HEAD_REPOSITORY EXTRA_FIELD <<< "$PR_TUPLE"
   test -z "${EXTRA_FIELD:-}"
   test "$PR_STATE" = "MERGED"
   test "$PR_BASE_REF" = "devel"
   test "$PR_HEAD_REF" = "$EXPECTED_HEAD_REF"
   test "$PR_HEAD_REPOSITORY" = "$CANONICAL_REPOSITORY"
   gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state >/dev/null

   CURRENT_WORKTREE="$(git rev-parse --show-toplevel)"
   COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
   case "$COMMON_DIR" in
     */.git) PRIMARY_WORKTREE="${COMMON_DIR%/.git}" ;;
     *) printf 'Unable to identify the primary worktree\n' >&2; exit 1 ;;
   esac

   WORKTREE_LIST="$(git worktree list --porcelain)"
   TASK_WORKTREE_TO_REMOVE=""
   CANDIDATE_WORKTREE=""
   MATCH_COUNT=0
   while IFS= read -r WORKTREE_LINE; do
     case "$WORKTREE_LINE" in
       worktree\ *) CANDIDATE_WORKTREE="${WORKTREE_LINE#worktree }" ;;
       "branch refs/heads/${EXPECTED_TASK_BRANCH}")
         TASK_WORKTREE_TO_REMOVE="$CANDIDATE_WORKTREE"
         MATCH_COUNT=$((MATCH_COUNT + 1))
         ;;
     esac
   done <<< "$WORKTREE_LIST"
   test "$MATCH_COUNT" -le 1
   if test "$TASK_WORKTREE_TO_REMOVE" = "$PRIMARY_WORKTREE"; then
     test "$CURRENT_WORKTREE" = "$PRIMARY_WORKTREE"
     TASK_WORKTREE_TO_REMOVE=""
   fi

   if test "$CURRENT_WORKTREE" != "$PRIMARY_WORKTREE"; then
     test "$(git branch --show-current)" = "$EXPECTED_TASK_BRANCH"
     test "$TASK_WORKTREE_TO_REMOVE" = "$CURRENT_WORKTREE"
     cd -- "$PRIMARY_WORKTREE"
   fi
   test "$(git rev-parse --show-toplevel)" = "$PRIMARY_WORKTREE"
   test -z "$(git status --porcelain)"
   PRIMARY_BRANCH="$(git branch --show-current)"
   case "$PRIMARY_BRANCH" in
     devel|"$EXPECTED_TASK_BRANCH") ;;
     *) printf 'Primary worktree is on an unrelated branch\n' >&2; exit 1 ;;
   esac

   git fetch origin --prune
   if test "$PRIMARY_BRANCH" != "devel"; then
     git checkout devel
   fi
   git pull --ff-only
   test "$(git branch --show-current)" = "devel"

   if test -n "$TASK_WORKTREE_TO_REMOVE"; then
     TARGET_COMMON_DIR="$(git -C "$TASK_WORKTREE_TO_REMOVE" rev-parse --path-format=absolute --git-common-dir)"
     test "$TASK_WORKTREE_TO_REMOVE" != "$PRIMARY_WORKTREE"
     test "$TARGET_COMMON_DIR" = "$COMMON_DIR"
     test "$(git -C "$TASK_WORKTREE_TO_REMOVE" branch --show-current)" = "$EXPECTED_TASK_BRANCH"
     git worktree remove "$TASK_WORKTREE_TO_REMOVE"
     git worktree prune
   fi

   REMOTE_PUBLISH_REF="$(git ls-remote --heads origin "refs/heads/${EXPECTED_HEAD_REF}")"
   if test -n "$REMOTE_PUBLISH_REF"; then
     git push origin --delete "$EXPECTED_HEAD_REF"
   fi
   if git show-ref --verify --quiet "refs/heads/${EXPECTED_TASK_BRANCH}"; then
     git branch -d "$EXPECTED_TASK_BRANCH"
   fi

   if test "$(gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state --jq .state)" = "OPEN"; then
     gh issue close "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY"
   fi
   ```
   - dirty/locked worktree, unrelated primary branch, repository/PR tuple 불일치, fetch/pull/delete 실패는 transaction을 중단한다. `--force` 삭제로 우회하지 않는다.
   - worktree 제거 → 원격 publish branch 삭제 → 로컬 task branch 삭제 → 이슈 close 순서를 유지한다.
3. 오늘할일 최종 정리: `mydocs/orders/{yyyymmdd}.md`의 `#${ISSUE_NUMBER}` 행이 `완료` + 시각 기록되어 있는지 재확인
4. 결과 보고: 정리된 항목 목록을 작업지시자에게 짧게 회신

## 검증

- `gh pr view "$PR_NUMBER" --repo jinzer0/GPUWatch`가 `MERGED`, base `devel`, head `publish/task${ISSUE_NUMBER}`, head repository `jinzer0/GPUWatch`임을 확인
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
- cleanup transaction의 일부 command만 분리 실행하거나 target 변수를 중간에 다시 주입

## 호출 방법

- Codex: `$pr-merge-cleanup` 또는 `/skills` 메뉴
- Claude Code: `/pr-merge-cleanup`
