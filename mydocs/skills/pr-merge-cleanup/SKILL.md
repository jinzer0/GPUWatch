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
- 이슈가 `CLOSED`이면 close 단계는 검증된 no-op으로 처리하며 별도 승인을 요구하지 않는다. 단, 각 worktree/원격 ref/로컬 ref 삭제 직전과 close 직전의 재검증에서 `OPEN`으로 관측되면 exact approval tuple이 필요하다.
- 이슈가 `OPEN`이면 read-only preflight가 출력한 exact approval tuple을 작업지시자가 같은 스레드에서 그대로 식별해 승인해야 한다. 산문형 "close 승인"은 무효다.
- GitHub issue close API에는 atomic compare-and-set이 없다. 따라서 cleanup transaction은 최초 관측한 merged PR state/base/head refs/head repository/head OID를 immutable tuple로 고정한다. 각 worktree/원격 ref/로컬 ref 삭제 직전과 close 직전에 live PR/이슈 tuple을 다시 읽어 frozen tuple과 비교하고, 각 경계에서 관측된 `OPEN` 이슈에 대해 frozen tuple의 exact approval을 검증하며, close 후 `CLOSED` 상태를 다시 확인한다.

## 절차

1. 대상과 실행 위치 사전 확인 (read-only)
   - 아래 block은 GitHub/로컬 상태를 조회만 한다. 이슈가 `OPEN`이면 exact approval tuple을 출력하고 중단한다.
   ```bash
   set -euo pipefail
   fail() { printf '%s\n' "$1" >&2; exit 1; }
   validate_decimal() {
     case "$2" in
       ""|*[!0-9]*) fail "$1 must contain decimal digits only" ;;
     esac
   }
   validate_oid() {
     case "$2" in
       ""|*[!0-9a-f]*) fail "$1 must be lowercase hexadecimal" ;;
     esac
     test "${#2}" -eq 40 || fail "$1 must be 40 characters"
   }

   validate_decimal PR_NUMBER "${PR_NUMBER:-}"
   validate_decimal ISSUE_NUMBER "${ISSUE_NUMBER:-}"
   readonly PR_NUMBER ISSUE_NUMBER

   CANONICAL_HOST="github.com"
   CANONICAL_REPOSITORY="jinzer0/GPUWatch"
   CANONICAL_REPOSITORY_ID="1256824919"
   EXPECTED_BASE_REF="devel"
   EXPECTED_HEAD_REF="publish/task${ISSUE_NUMBER}"
   ACTION="close-issue:completed"
   readonly CANONICAL_HOST CANONICAL_REPOSITORY CANONICAL_REPOSITORY_ID EXPECTED_BASE_REF EXPECTED_HEAD_REF ACTION

   test "$(gh api --hostname "$CANONICAL_HOST" "repos/$CANONICAL_REPOSITORY" --jq .id)" = "$CANONICAL_REPOSITORY_ID"
   test "$(GH_HOST="$CANONICAL_HOST" gh repo view "$CANONICAL_REPOSITORY" --json nameWithOwner --jq .nameWithOwner)" = "$CANONICAL_REPOSITORY"
   ORIGIN_FETCH_URLS="$(git remote get-url --all origin)"
   ORIGIN_PUSH_URLS="$(git remote get-url --push --all origin)"
   test -n "$ORIGIN_FETCH_URLS"
   test -n "$ORIGIN_PUSH_URLS"
   while IFS= read -r ORIGIN_URL; do
     case "$ORIGIN_URL" in
       git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
       *) fail 'origin does not target the canonical repository' ;;
     esac
   done <<< "$ORIGIN_FETCH_URLS"$'\n'"$ORIGIN_PUSH_URLS"

   PR_TUPLE="$(GH_HOST="$CANONICAL_HOST" gh pr view "$PR_NUMBER" --repo "$CANONICAL_REPOSITORY" \
     --json state,baseRefName,headRefName,headRefOid,headRepository \
     --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner, .headRefOid] | @tsv')"
   case "$PR_TUPLE" in
     *$'\n'*) fail 'PR identity query returned multiple lines' ;;
   esac
   IFS=$'\t' read -r LIVE_PR_STATE LIVE_PR_BASE_REF LIVE_PR_HEAD_REF LIVE_PR_HEAD_REPOSITORY LIVE_PR_HEAD_OID EXTRA_FIELD <<< "$PR_TUPLE"
   test -z "${EXTRA_FIELD:-}" || fail 'PR identity query returned extra fields'
   test "$LIVE_PR_STATE" = "MERGED" || fail 'PR must be MERGED'
   test "$LIVE_PR_BASE_REF" = "$EXPECTED_BASE_REF" || fail 'PR base ref mismatch'
   test "$LIVE_PR_HEAD_REF" = "$EXPECTED_HEAD_REF" || fail 'PR head ref mismatch'
   test "$LIVE_PR_HEAD_REPOSITORY" = "$CANONICAL_REPOSITORY" || fail 'PR head repository mismatch'
   validate_oid LIVE_PR_HEAD_OID "$LIVE_PR_HEAD_OID"

   FROZEN_PR_STATE="$LIVE_PR_STATE"
   FROZEN_PR_BASE_REF="$LIVE_PR_BASE_REF"
   FROZEN_PR_HEAD_REF="$LIVE_PR_HEAD_REF"
   FROZEN_PR_HEAD_REPOSITORY="$LIVE_PR_HEAD_REPOSITORY"
   FROZEN_MERGED_HEAD_OID="$LIVE_PR_HEAD_OID"
   readonly FROZEN_PR_STATE FROZEN_PR_BASE_REF FROZEN_PR_HEAD_REF FROZEN_PR_HEAD_REPOSITORY FROZEN_MERGED_HEAD_OID

   ISSUE_STATE="$(GH_HOST="$CANONICAL_HOST" gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state --jq .state)"
   case "$ISSUE_STATE" in
     OPEN|CLOSED) ;;
     *) fail 'Issue state must be OPEN or CLOSED' ;;
   esac
   git worktree list --porcelain >/dev/null

   printf 'expected_pr_tuple state=%s base_ref=%s head_ref=%s head_repository=%s merged_head_oid=%s\n' \
     "$FROZEN_PR_STATE" "$FROZEN_PR_BASE_REF" "$FROZEN_PR_HEAD_REF" "$FROZEN_PR_HEAD_REPOSITORY" "$FROZEN_MERGED_HEAD_OID"
   printf 'approval_tuple host=%s repository=%s repository_id=%s pr_number=%s issue_number=%s merged_head_oid=%s base_ref=%s head_ref=%s action=%s\n' \
     "$CANONICAL_HOST" "$CANONICAL_REPOSITORY" "$CANONICAL_REPOSITORY_ID" "$PR_NUMBER" "$ISSUE_NUMBER" "$FROZEN_MERGED_HEAD_OID" "$FROZEN_PR_BASE_REF" "$FROZEN_PR_HEAD_REF" "$ACTION"
   printf 'issue_state=%s\n' "$ISSUE_STATE"
   if test "$ISSUE_STATE" = "OPEN"; then
     printf 'required_same_thread_approval=APPROVE pr-merge-cleanup with the exact approval_tuple line above\n'
     exit 2
   fi
   printf 'issue_already_closed=verified-no-op\n'
   ```
   - 작업지시자가 지정한 PR/이슈 번호, `MERGED`, `devel` <- `publish/taskN`, canonical repository, canonical origin, 기본/분리 worktree 경로를 확인한다.
   - cleanup transaction에는 이슈 상태와 무관하게 `expected_pr_tuple`의 값을 `PREFLIGHT_PR_STATE`, `PREFLIGHT_PR_BASE_REF`, `PREFLIGHT_PR_HEAD_REF`, `PREFLIGHT_PR_HEAD_REPOSITORY`, `PREFLIGHT_MERGED_HEAD_OID`로 그대로 전달한다.
   - `OPEN` 이슈라면 같은 스레드 승인 문장이 `approval_tuple`의 host, repository, repository ID, PR 번호, 이슈 번호, merged head OID, base/head refs, action `close-issue:completed`를 모두 그대로 식별해야 한다.

2. 승인받은 cleanup transaction 실행
   - 이슈가 `CLOSED` 또는 `OPEN`인지와 무관하게 read-only preflight가 출력한 frozen PR tuple을 `PREFLIGHT_PR_STATE`, `PREFLIGHT_PR_BASE_REF`, `PREFLIGHT_PR_HEAD_REF`, `PREFLIGHT_PR_HEAD_REPOSITORY`, `PREFLIGHT_MERGED_HEAD_OID` 환경 변수로 그대로 전달한다.
   - 이슈가 `OPEN`으로 관측된 경우 승인받은 tuple 값을 `APPROVED_HOST`, `APPROVED_REPOSITORY`, `APPROVED_REPOSITORY_ID`, `APPROVED_PR_NUMBER`, `APPROVED_ISSUE_NUMBER`, `APPROVED_MERGED_HEAD_OID`, `APPROVED_BASE_REF`, `APPROVED_HEAD_REF`, `APPROVED_ACTION` 환경 변수로 그대로 전달한다.
   - 이슈가 처음에는 `CLOSED`여서 `APPROVED_*` 입력 없이 시작했더라도, 각 worktree/원격 ref/로컬 ref 삭제 직전 또는 close 직전 재검증에서 `OPEN`으로 바뀌면 complete exact tuple 검증 없이 진행할 수 없다.
   - 아래 전체 block을 한 번의 shell 호출에서 실행한다. 일부만 떼어 실행하거나 중간에 `PR_NUMBER`, `ISSUE_NUMBER`, repository, worktree path를 다시 주입하지 않는다.
   ```bash
   set -euo pipefail
   fail() { printf '%s\n' "$1" >&2; exit 1; }
   validate_decimal() {
     case "$2" in
       ""|*[!0-9]*) fail "$1 must contain decimal digits only" ;;
     esac
   }
   validate_scalar() {
     case "$2" in
       ""|*$'\n'*|*$'\t'*|*=*) fail "$1 must be a non-empty single-line scalar without tab or equals" ;;
     esac
   }
   validate_oid() {
     case "$2" in
       ""|*[!0-9a-f]*) fail "$1 must be lowercase hexadecimal" ;;
     esac
     test "${#2}" -eq 40 || fail "$1 must be 40 characters"
   }
   validate_approved_tuple() {
     validate_scalar APPROVED_HOST "${APPROVED_HOST:-}"
     validate_scalar APPROVED_REPOSITORY "${APPROVED_REPOSITORY:-}"
     validate_decimal APPROVED_REPOSITORY_ID "${APPROVED_REPOSITORY_ID:-}"
     validate_decimal APPROVED_PR_NUMBER "${APPROVED_PR_NUMBER:-}"
     validate_decimal APPROVED_ISSUE_NUMBER "${APPROVED_ISSUE_NUMBER:-}"
     validate_oid APPROVED_MERGED_HEAD_OID "${APPROVED_MERGED_HEAD_OID:-}"
     validate_scalar APPROVED_BASE_REF "${APPROVED_BASE_REF:-}"
     validate_scalar APPROVED_HEAD_REF "${APPROVED_HEAD_REF:-}"
     validate_scalar APPROVED_ACTION "${APPROVED_ACTION:-}"
     test "$APPROVED_HOST" = "$CANONICAL_HOST" || fail 'approved host mismatch'
     test "$APPROVED_REPOSITORY" = "$CANONICAL_REPOSITORY" || fail 'approved repository mismatch'
     test "$APPROVED_REPOSITORY_ID" = "$CANONICAL_REPOSITORY_ID" || fail 'approved repository ID mismatch'
     test "$APPROVED_PR_NUMBER" = "$PR_NUMBER" || fail 'approved PR number mismatch'
     test "$APPROVED_ISSUE_NUMBER" = "$ISSUE_NUMBER" || fail 'approved issue number mismatch'
     test "$APPROVED_MERGED_HEAD_OID" = "$FROZEN_MERGED_HEAD_OID" || fail 'approved merged head OID mismatch'
     test "$APPROVED_BASE_REF" = "$FROZEN_PR_BASE_REF" || fail 'approved base ref mismatch'
     test "$APPROVED_HEAD_REF" = "$FROZEN_PR_HEAD_REF" || fail 'approved head ref mismatch'
     test "$APPROVED_ACTION" = "$ACTION" || fail 'approved action mismatch'
   }
   require_approved_tuple_if_issue_open() {
     if test "$ISSUE_STATE" = "OPEN"; then
       validate_approved_tuple
     fi
   }
   observe_pr_issue_tuple() {
     test "$(gh api --hostname "$CANONICAL_HOST" "repos/$CANONICAL_REPOSITORY" --jq .id)" = "$CANONICAL_REPOSITORY_ID"
     test "$(GH_HOST="$CANONICAL_HOST" gh repo view "$CANONICAL_REPOSITORY" --json nameWithOwner --jq .nameWithOwner)" = "$CANONICAL_REPOSITORY"
     PR_TUPLE="$(GH_HOST="$CANONICAL_HOST" gh pr view "$PR_NUMBER" --repo "$CANONICAL_REPOSITORY" \
       --json state,baseRefName,headRefName,headRefOid,headRepository \
       --jq '[.state, .baseRefName, .headRefName, .headRepository.nameWithOwner, .headRefOid] | @tsv')"
     case "$PR_TUPLE" in
       *$'\n'*) fail 'PR identity query returned multiple lines' ;;
     esac
     IFS=$'\t' read -r LIVE_PR_STATE LIVE_PR_BASE_REF LIVE_PR_HEAD_REF LIVE_PR_HEAD_REPOSITORY LIVE_PR_HEAD_OID EXTRA_FIELD <<< "$PR_TUPLE"
     test -z "${EXTRA_FIELD:-}" || fail 'PR identity query returned extra fields'
     test "$LIVE_PR_STATE" = "MERGED" || fail 'PR must stay MERGED'
     test "$LIVE_PR_BASE_REF" = "$EXPECTED_BASE_REF" || fail 'PR base ref mismatch'
     test "$LIVE_PR_HEAD_REF" = "$EXPECTED_HEAD_REF" || fail 'PR head ref mismatch'
     test "$LIVE_PR_HEAD_REPOSITORY" = "$CANONICAL_REPOSITORY" || fail 'PR head repository mismatch'
     validate_oid LIVE_PR_HEAD_OID "$LIVE_PR_HEAD_OID"
     ISSUE_STATE="$(GH_HOST="$CANONICAL_HOST" gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state --jq .state)"
     case "$ISSUE_STATE" in
       OPEN|CLOSED) ;;
       *) fail 'Issue state must be OPEN or CLOSED' ;;
     esac
   }
   revalidate_pr_issue_tuple() {
     observe_pr_issue_tuple
     test "$LIVE_PR_STATE" = "$FROZEN_PR_STATE" || fail 'PR state changed after preflight'
     test "$LIVE_PR_BASE_REF" = "$FROZEN_PR_BASE_REF" || fail 'PR base ref changed after preflight'
     test "$LIVE_PR_HEAD_REF" = "$FROZEN_PR_HEAD_REF" || fail 'PR head ref changed after preflight'
     test "$LIVE_PR_HEAD_REPOSITORY" = "$FROZEN_PR_HEAD_REPOSITORY" || fail 'PR head repository changed after preflight'
     test "$LIVE_PR_HEAD_OID" = "$FROZEN_MERGED_HEAD_OID" || fail 'PR merged head OID changed after preflight'
   }

   validate_decimal PR_NUMBER "${PR_NUMBER:-}"
   validate_decimal ISSUE_NUMBER "${ISSUE_NUMBER:-}"
   readonly PR_NUMBER ISSUE_NUMBER

   CANONICAL_HOST="github.com"
   CANONICAL_REPOSITORY="jinzer0/GPUWatch"
   CANONICAL_REPOSITORY_ID="1256824919"
   EXPECTED_BASE_REF="devel"
   EXPECTED_HEAD_REF="publish/task${ISSUE_NUMBER}"
   EXPECTED_TASK_BRANCH="local/task${ISSUE_NUMBER}"
   ACTION="close-issue:completed"
   readonly CANONICAL_HOST CANONICAL_REPOSITORY CANONICAL_REPOSITORY_ID EXPECTED_BASE_REF EXPECTED_HEAD_REF EXPECTED_TASK_BRANCH ACTION

   validate_scalar PREFLIGHT_PR_STATE "${PREFLIGHT_PR_STATE:-}"
   validate_scalar PREFLIGHT_PR_BASE_REF "${PREFLIGHT_PR_BASE_REF:-}"
   validate_scalar PREFLIGHT_PR_HEAD_REF "${PREFLIGHT_PR_HEAD_REF:-}"
   validate_scalar PREFLIGHT_PR_HEAD_REPOSITORY "${PREFLIGHT_PR_HEAD_REPOSITORY:-}"
   validate_oid PREFLIGHT_MERGED_HEAD_OID "${PREFLIGHT_MERGED_HEAD_OID:-}"
   test "$PREFLIGHT_PR_STATE" = "MERGED" || fail 'preflight PR state mismatch'
   test "$PREFLIGHT_PR_BASE_REF" = "$EXPECTED_BASE_REF" || fail 'preflight PR base ref mismatch'
   test "$PREFLIGHT_PR_HEAD_REF" = "$EXPECTED_HEAD_REF" || fail 'preflight PR head ref mismatch'
   test "$PREFLIGHT_PR_HEAD_REPOSITORY" = "$CANONICAL_REPOSITORY" || fail 'preflight PR head repository mismatch'
   FROZEN_PR_STATE="$PREFLIGHT_PR_STATE"
   FROZEN_PR_BASE_REF="$PREFLIGHT_PR_BASE_REF"
   FROZEN_PR_HEAD_REF="$PREFLIGHT_PR_HEAD_REF"
   FROZEN_PR_HEAD_REPOSITORY="$PREFLIGHT_PR_HEAD_REPOSITORY"
   FROZEN_MERGED_HEAD_OID="$PREFLIGHT_MERGED_HEAD_OID"
   readonly FROZEN_PR_STATE FROZEN_PR_BASE_REF FROZEN_PR_HEAD_REF FROZEN_PR_HEAD_REPOSITORY FROZEN_MERGED_HEAD_OID
   revalidate_pr_issue_tuple
   require_approved_tuple_if_issue_open

   ORIGIN_FETCH_URLS="$(git remote get-url --all origin)"
   ORIGIN_PUSH_URLS="$(git remote get-url --push --all origin)"
   test -n "$ORIGIN_FETCH_URLS"
   test -n "$ORIGIN_PUSH_URLS"
   while IFS= read -r ORIGIN_URL; do
     case "$ORIGIN_URL" in
       git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
       *) fail 'origin does not target the canonical repository' ;;
     esac
   done <<< "$ORIGIN_FETCH_URLS"$'\n'"$ORIGIN_PUSH_URLS"

   CURRENT_WORKTREE="$(git rev-parse --show-toplevel)"
   COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
   case "$COMMON_DIR" in
     */.git) PRIMARY_WORKTREE="${COMMON_DIR%/.git}" ;;
     *) fail 'Unable to identify the primary worktree' ;;
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
     *) fail 'Primary worktree is on an unrelated branch' ;;
   esac

   git fetch --prune origin "refs/heads/devel:refs/remotes/origin/devel"
   git merge-base --is-ancestor "$FROZEN_MERGED_HEAD_OID" origin/devel
   if test "$PRIMARY_BRANCH" != "devel"; then
     git checkout devel
   fi
   test "$(git branch --show-current)" = "devel"
   if git merge-base --is-ancestor devel origin/devel; then
     git merge --ff-only origin/devel
     DEVEL_RELATION="fast-forwarded"
   elif git merge-base --is-ancestor origin/devel devel; then
     DEVEL_RELATION="local-ahead-preserved"
   else
     DEVEL_RELATION="diverged-preserved"
   fi
   readonly DEVEL_RELATION
   printf 'devel_relation=%s\n' "$DEVEL_RELATION"

   LOCAL_TASK_REF="refs/heads/${EXPECTED_TASK_BRANCH}"
   LOCAL_TASK_OID=""
   if git show-ref --verify --quiet "$LOCAL_TASK_REF"; then
     LOCAL_TASK_OID="$(git rev-parse --verify "${LOCAL_TASK_REF}^{commit}")"
     test "$LOCAL_TASK_OID" = "$FROZEN_MERGED_HEAD_OID"
     git merge-base --is-ancestor "$LOCAL_TASK_OID" origin/devel
   fi
   REMOTE_PUBLISH_REF="$(git ls-remote --heads origin "refs/heads/${EXPECTED_HEAD_REF}")"
   if test -n "$REMOTE_PUBLISH_REF"; then
     case "$REMOTE_PUBLISH_REF" in
       *$'\n'*) fail 'Remote publish query returned multiple refs' ;;
     esac
     IFS=$'\t' read -r REMOTE_PUBLISH_OID REMOTE_PUBLISH_NAME EXTRA_REMOTE_FIELD <<< "$REMOTE_PUBLISH_REF"
     test -z "${EXTRA_REMOTE_FIELD:-}"
     test "$REMOTE_PUBLISH_OID" = "$FROZEN_MERGED_HEAD_OID"
     test "$REMOTE_PUBLISH_NAME" = "refs/heads/${EXPECTED_HEAD_REF}"
   fi

   revalidate_pr_issue_tuple
   require_approved_tuple_if_issue_open

   if test -n "$TASK_WORKTREE_TO_REMOVE"; then
     TARGET_COMMON_DIR="$(git -C "$TASK_WORKTREE_TO_REMOVE" rev-parse --path-format=absolute --git-common-dir)"
     test "$TASK_WORKTREE_TO_REMOVE" != "$PRIMARY_WORKTREE"
     test "$TARGET_COMMON_DIR" = "$COMMON_DIR"
     test "$(git -C "$TASK_WORKTREE_TO_REMOVE" branch --show-current)" = "$EXPECTED_TASK_BRANCH"
     git worktree remove "$TASK_WORKTREE_TO_REMOVE"
     git worktree prune
   fi

   if test -n "$REMOTE_PUBLISH_REF"; then
     revalidate_pr_issue_tuple
     require_approved_tuple_if_issue_open
     git push --force-with-lease="refs/heads/${EXPECTED_HEAD_REF}:${FROZEN_MERGED_HEAD_OID}" \
       origin ":refs/heads/${EXPECTED_HEAD_REF}"
   fi
   if test -n "$LOCAL_TASK_OID"; then
     revalidate_pr_issue_tuple
     require_approved_tuple_if_issue_open
     git update-ref -d "refs/heads/${EXPECTED_TASK_BRANCH}" "$LOCAL_TASK_OID"
   fi

   revalidate_pr_issue_tuple
   require_approved_tuple_if_issue_open
   if test "$ISSUE_STATE" = "OPEN"; then
     GH_HOST="$CANONICAL_HOST" gh issue close "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --reason completed
     POST_CLOSE_STATE="$(GH_HOST="$CANONICAL_HOST" gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state --jq .state)"
     test "$POST_CLOSE_STATE" = "CLOSED" || fail 'issue close did not produce CLOSED state'
   elif test "$ISSUE_STATE" = "CLOSED"; then
     POST_CLOSE_STATE="$(GH_HOST="$CANONICAL_HOST" gh issue view "$ISSUE_NUMBER" --repo "$CANONICAL_REPOSITORY" --json state --jq .state)"
     test "$POST_CLOSE_STATE" = "CLOSED" || fail 'issue no-op verification failed'
     printf 'issue_close=verified-no-op\n'
   fi
   ```
   - dirty/locked worktree, unrelated primary branch, repository/PR tuple 불일치, 가능한 canonical origin fast-forward 실패, local task의 `origin/devel` ancestry 실패, remote publish SHA 불일치, delete 실패는 transaction을 중단한다. `--force` 삭제로 우회하지 않는다.
   - local `devel`이 `origin/devel`보다 앞서거나 서로 갈라졌으면 unpublished commit을 reset/rebase하지 않고 그대로 보존한다. 출력된 `devel_relation`을 결과 보고에 기록한다.
   - read-only preflight의 merged PR tuple을 frozen tuple로 고정 -> local task/remote publish ref 검증 -> frozen PR/이슈 tuple과 현재 `OPEN` 이슈의 exact approval을 각 경계에서 재검증 -> worktree 제거 -> 재검증 -> 원격 publish branch 삭제 -> 재검증 -> 로컬 task branch 삭제 -> 재검증 -> 이슈 close 또는 `CLOSED` no-op 검증 순서를 유지한다.
   - 처음 `CLOSED`였던 이슈가 어느 destructive boundary 직전 재검증에서 `OPEN`이면 `APPROVED_*` tuple 누락 또는 불일치로 다음 삭제나 close 전에 중단한다. frozen PR tuple의 state/base/head refs/head repository/head OID 중 하나라도 달라지면 이슈 상태와 무관하게 다음 destructive action 전에 중단한다. artifact 정리 후 close 직전 검증에 실패하면 close 없이 중단한다. 이 경우 standalone close를 실행하지 말고 read-only preflight와 cleanup transaction 전체를 다시 실행한다. 승인된 `OPEN` 이슈가 `CLOSED`로 바뀌면 close를 생략하고 `CLOSED` 상태를 다시 확인한다.
   - worktree 제거, 원격 publish branch 삭제, 로컬 task branch 삭제 중 하나라도 실패하면 `set -e`로 중단되어 이슈 close에 도달하지 않는다.
   - 이슈 close는 `--reason completed`로만 수행한다.
3. 오늘할일 최종 정리: `mydocs/orders/{yyyymmdd}.md`의 `#${ISSUE_NUMBER}` 행이 `완료` + 시각 기록되어 있는지 재확인
4. 결과 보고: 정리된 항목 목록, `devel_relation`, 이슈 close 결과 또는 `verified-no-op`을 작업지시자에게 짧게 회신

## 검증

- `GH_HOST=github.com gh pr view "$PR_NUMBER" --repo jinzer0/GPUWatch`가 `MERGED`, base `devel`, head `publish/task${ISSUE_NUMBER}`, head repository `jinzer0/GPUWatch`임을 확인
- 각 worktree/원격 ref/로컬 ref 삭제 직전과 close 직전에 live PR tuple이 최초 frozen merged PR state/base/head refs/head repository/head OID와 일치하고, 그 경계에서 `OPEN`으로 관측된 이슈는 같은 스레드 승인 문장이 host, repository, repository ID, PR 번호, 이슈 번호, frozen merged head OID, base/head refs, action `close-issue:completed` exact tuple을 모두 식별했음을 확인
- `git show-ref --verify --quiet "refs/heads/local/task${ISSUE_NUMBER}"`가 nonzero 종료 (삭제된 경우)
- `git ls-remote origin "publish/task${ISSUE_NUMBER}"` 빈 출력 (원격 삭제 확인)
- `git worktree list` 출력에 정리 대상 worktree 미존재
- `git branch --show-current`가 `devel`
- `devel_relation`이 `fast-forwarded`, `local-ahead-preserved`, `diverged-preserved` 중 하나이며 뒤의 두 상태는 보존된 local commit과 함께 결과 보고에 기록됨
- `git rev-parse --show-toplevel`이 기본 worktree 절대 경로와 일치
- close 실행 후 `GH_HOST=github.com gh issue view "$ISSUE_NUMBER" --repo jinzer0/GPUWatch --json state --jq .state`가 `CLOSED`이며 close 명령은 `--reason completed`를 사용
- cleanup 도중 이슈가 `CLOSED`가 되었으면 close 명령을 생략하고 `CLOSED` 상태를 다시 확인
- 처음 `CLOSED`였던 이슈가 어느 destructive boundary 직전 `OPEN`으로 관측되면 complete exact tuple 검증 없이는 다음 삭제 또는 close에 도달하지 않음을 확인
- artifact 정리 후 `CLOSED`에서 `OPEN`으로 바뀌어 close 전 exact tuple 검증에 실패하면 close 없이 중단하고, standalone close 대신 read-only preflight와 cleanup transaction 전체를 다시 실행함을 확인

## 절대 하지 말 것

- PR이 merged 상태가 아닌데 이슈 close
- 작업지시자 다른 task 브랜치(`local/task{다른번호}`)나 메인 worktree 삭제
- `git branch -D` 강제 삭제 무단 사용 (병합 안 된 커밋이 있을 때 손실 위험)
- 다른 작업자의 stash 삭제
- local `devel`의 unpublished commit을 임의로 reset, rebase, 삭제
- 분리 task worktree 안에서 `devel` checkout 또는 자기 자신 제거 실행
- 기본 worktree를 제거 대상으로 지정하거나 dirty/locked task worktree 강제 제거
- cleanup 대상과 다른 PR/이슈 번호, base, head, merged head OID, action 조합으로 이슈 close 또는 브랜치 삭제
- ambient `GH_HOST` 또는 canonical repository ID 검증 없이 GitHub 조회·이슈 close 수행
- cleanup과 branch 삭제가 끝나기 전에 이슈 close
- `OPEN` 이슈에 대해 같은 스레드에서 exact tuple 승인 없이 close
- exact tuple 승인 외의 별도 승인 부산물 생성
- cleanup 실패 후 수동으로 close 단계만 따로 실행
- cleanup transaction의 일부 command만 분리 실행하거나 target 변수를 중간에 다시 주입

## 호출 방법

- Codex: `$pr-merge-cleanup` 또는 `/skills` 메뉴
- Claude Code: `/pr-merge-cleanup`
