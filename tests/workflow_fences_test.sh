#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd -P -- "$(dirname -- "$0")/.." && pwd -P)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gpuwatcher-workflow-fences.XXXXXX")"
trap 'rm -rf -- "$TMP_ROOT"' EXIT HUP INT TERM
REAL_PATH=$PATH

pass_count=0
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
pass() { pass_count=$((pass_count + 1)); printf 'ok %d - %s\n' "$pass_count" "$1"; }
expect_success() { "$@" || fail "$1"; }
expect_failure() { if "$@"; then fail "$1 unexpectedly succeeded"; fi; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || fail "missing $2 in $1"; }
assert_absent() { if grep -F -- "$2" "$1" >/dev/null; then fail "forbidden $2 in $1"; fi; }

suppressed_git() (
  GIT_CONFIG_COUNT=1
  GIT_CONFIG_KEY_0=core.hooksPath
  GIT_CONFIG_VALUE_0=/dev/null
  export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
  GIT_MASTER=1 git "$@"
)

new_hook_canary_repo() {
  local name=$1 repo=$TMP_ROOT/$1
  mkdir "$repo"
  GIT_MASTER=1 git -C "$repo" init -q
  printf '%s\n' initial > "$repo/initial"
  GIT_MASTER=1 git -C "$repo" add initial
  GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test GIT_MASTER=1 git -C "$repo" commit -qm initial
  printf '%s' "$repo"
}

commit_canary_change() {
  local repo=$1 message=$2
  printf '%s\n' "$message" >> "$repo/initial"
  GIT_MASTER=1 git -C "$repo" add initial
  GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test GIT_MASTER=1 git -C "$repo" commit -qm "$message"
}

install_hook() {
  local repo=$1 hook_name=$2 marker=$3
  cat > "$repo/.git/hooks/$hook_name" <<EOF
#!/bin/sh
printf '%s\\n' '$hook_name' >> '$marker'
EOF
  chmod 700 "$repo/.git/hooks/$hook_name"
}

assert_hook_suppression() {
  local hook_name=$1 repo marker remote
  repo="$(new_hook_canary_repo "hook-$hook_name")"
  marker="$repo/$hook_name.log"

  case "$hook_name" in
    pre-push)
      remote="$TMP_ROOT/hook-pre-push-remote.git"
      GIT_MASTER=1 git init --bare -q "$remote"
      GIT_MASTER=1 git -C "$repo" remote add origin "$remote"
      install_hook "$repo" "$hook_name" "$marker"
      GIT_MASTER=1 git -C "$repo" push -q origin HEAD:refs/heads/main
      test "$(cat "$marker")" = "$hook_name" || fail "$hook_name hook did not fire without suppression"
      rm "$marker"
      commit_canary_change "$repo" suppressed-push
      suppressed_git -C "$repo" push -q origin HEAD:refs/heads/main
      test ! -e "$marker" || fail "$hook_name hook fired with suppression"
      ;;
    post-checkout)
      GIT_MASTER=1 git -C "$repo" branch canary
      install_hook "$repo" "$hook_name" "$marker"
      GIT_MASTER=1 git -C "$repo" checkout -q canary
      test "$(cat "$marker")" = "$hook_name" || fail "$hook_name hook did not fire without suppression"
      rm "$marker"
      suppressed_git -C "$repo" checkout -q master
      test ! -e "$marker" || fail "$hook_name hook fired with suppression"
      ;;
    post-merge)
      GIT_MASTER=1 git -C "$repo" checkout -qb canary
      commit_canary_change "$repo" canary-change
      GIT_MASTER=1 git -C "$repo" checkout -q master
      install_hook "$repo" "$hook_name" "$marker"
      GIT_MASTER=1 git -C "$repo" merge --no-edit -q canary
      test "$(cat "$marker")" = "$hook_name" || fail "$hook_name hook did not fire without suppression"
      rm "$marker"
      repo="$(new_hook_canary_repo "hook-$hook_name-suppressed")"
      marker="$repo/$hook_name.log"
      GIT_MASTER=1 git -C "$repo" checkout -qb canary
      commit_canary_change "$repo" canary-change
      GIT_MASTER=1 git -C "$repo" checkout -q master
      install_hook "$repo" "$hook_name" "$marker"
      suppressed_git -C "$repo" merge --no-edit -q canary
      test ! -e "$marker" || fail "$hook_name hook fired with suppression"
      ;;
    reference-transaction)
      install_hook "$repo" "$hook_name" "$marker"
      GIT_MASTER=1 git -C "$repo" update-ref refs/canary/hook "$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
      test -s "$marker" || fail "$hook_name hook did not fire without suppression"
      rm "$marker"
      suppressed_git -C "$repo" update-ref refs/canary/suppressed "$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
      test ! -e "$marker" || fail "$hook_name hook fired with suppression"
      ;;
    *) fail "unknown hook canary $hook_name" ;;
  esac
}

extract_git_fence_count() {
  awk '
    function report(message) { printf "%s:%d: %s\\n", FILENAME, fence_start, message > "/dev/stderr"; invalid = 1 }
    /^[[:space:]]*```bash[[:space:]]*$/ {
      in_fence = 1
      fence_start = NR
      has_git = 0
      first_git = 0
      count_line = key_line = value_line = export_line = 0
      next
    }
    in_fence && /^[[:space:]]*```[[:space:]]*$/ {
      if (has_git) {
        if (!count_line) report("missing GIT_CONFIG_COUNT=1 before first git")
        if (!key_line) report("missing GIT_CONFIG_KEY_0=core.hooksPath before first git")
        if (!value_line) report("missing GIT_CONFIG_VALUE_0=/dev/null before first git")
        if (!export_line) report("missing GIT_CONFIG tuple export before first git")
        if (count_line && count_line > first_git) report("GIT_CONFIG_COUNT follows first git")
        if (key_line && key_line > first_git) report("GIT_CONFIG_KEY_0 follows first git")
        if (value_line && value_line > first_git) report("GIT_CONFIG_VALUE_0 follows first git")
        if (export_line && export_line > first_git) report("GIT_CONFIG export follows first git")
        fence_count++
      }
      in_fence = 0
      next
    }
    in_fence {
      if ($0 ~ /git[[:space:]]/ && !first_git) {
        has_git = 1
        first_git = NR
      }
      if ($0 ~ /^[[:space:]]*GIT_CONFIG_COUNT=1[[:space:]]*$/) count_line = NR
      if ($0 ~ /^[[:space:]]*GIT_CONFIG_KEY_0=core\.hooksPath[[:space:]]*$/) key_line = NR
      if ($0 ~ /^[[:space:]]*GIT_CONFIG_VALUE_0=\/dev\/null[[:space:]]*$/) value_line = NR
      if ($0 ~ /^[[:space:]]*export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0[[:space:]]*$/) export_line = NR
    }
    END {
      if (in_fence) { print "unterminated bash fence" > "/dev/stderr"; exit 1 }
      if (invalid) exit 1
      print fence_count + 0
    }
  ' "$@"
}

check_required_fence_structure() {
  local actual_count
  actual_count="$(extract_git_fence_count "$START_SKILL" "$STAGE_SKILL" "$FINAL_SKILL" "$EXTERNAL_SKILL" "$CLEANUP_SKILL" "$WORKFLOW_MANUAL")" || return 1
  test "$actual_count" = 21 || { printf 'expected 21 Git-bearing security fences, found %s\n' "$actual_count" >&2; return 1; }
  if rg -n -- '-c core\.hooksPath=/dev/null' "$START_SKILL" "$STAGE_SKILL" "$FINAL_SKILL" "$EXTERNAL_SKILL" "$WORKFLOW_MANUAL"; then
    printf 'command-local hooksPath remains in a canonical fence\n' >&2
    return 1
  fi
  assert_contains "$CLEANUP_SKILL" 'PREFLIGHT_ISSUE_UPDATED_AT'
  assert_contains "$CLEANUP_SKILL" 'APPROVED_ISSUE_UPDATED_AT'
  assert_contains "$CLEANUP_SKILL" 'LIVE_ISSUE_UPDATED_AT'
  assert_contains "$CLEANUP_SKILL" 'read_local_task_ref()'
  assert_contains "$CLEANUP_SKILL" 'git update-ref --no-deref -d "refs/heads/${EXPECTED_TASK_BRANCH}" "$LOCAL_TASK_OID"'
  assert_contains "$EXTERNAL_SKILL" 'git -C "$REPO_ROOT" update-ref --no-deref -d "$ref" "$oid"'
  assert_contains "$EXTERNAL_SKILL" '! git -C "$REPO_ROOT" symbolic-ref --quiet "$ref" >/dev/null'
  assert_contains "$EXTERNAL_SKILL" 'cleanup_snapshot_root()'
  assert_absent "$EXTERNAL_SKILL" 'rm -rf -- "$SNAPSHOT_ROOT"'
  assert_absent "$EXTERNAL_SKILL" 'rm -rf -- "$root"'
  assert_absent "$EXTERNAL_GUIDE" 'hook 실행 뒤'
  assert_absent "$PR_README" 'hook 실행 뒤'
  assert_absent "$WORKFLOW_MANUAL" 'pre-hook tree/blob'
  assert_contains "$AGENTS_FILE" 'updated_at'
}

extract_all_bash_fences() {
  local source_file=$1 output_dir=$2
  mkdir -p "$output_dir"
  awk -v output_dir="$output_dir" '
    /^[[:space:]]*```bash[[:space:]]*$/ {
      active = 1
      fence += 1
      target = sprintf("%s/fence-%03d.sh", output_dir, fence)
      next
    }
    active && /^[[:space:]]*```[[:space:]]*$/ {
      close(target)
      active = 0
      next
    }
    active { print > target }
    END { if (active) exit 1 }
  ' "$source_file"
}

assert_all_workflow_fences_parse() {
  local source_file source_name fence_dir fence_file
  for source_file in "$AGENTS_FILE" "$START_SKILL" "$STAGE_SKILL" "$FINAL_SKILL" "$EXTERNAL_SKILL" "$CLEANUP_SKILL" "$WORKFLOW_MANUAL" "$EXTERNAL_GUIDE" "$GIT_WORKFLOW_MANUAL" "$PR_README"; do
    source_name="$(basename "$(dirname "$source_file")")-$(basename "$source_file")"
    fence_dir="$TMP_ROOT/fences/$source_name"
    extract_all_bash_fences "$source_file" "$fence_dir" || return 1
    for fence_file in "$fence_dir"/*.sh; do
      test -e "$fence_file" || continue
      /bin/bash -n "$fence_file" || return 1
    done
  done
}

run_delete_ref_cas() (
  export GIT_MASTER=1
  REPO_ROOT=$1
  source "$TMP_ROOT/delete-ref-cas.sh"
  delete_ref_cas "$2" "$3"
)

ref_exists() { GIT_MASTER=1 git -C "$1" show-ref --verify --quiet "$2"; }
symbolic_ref_exists() { GIT_MASTER=1 git -C "$1" symbolic-ref --quiet "$2" >/dev/null; }

run_local_task_ref() (
  export GIT_MASTER=1
  REPO_ROOT=$1
  cd "$REPO_ROOT"
  EXPECTED_TASK_BRANCH=local/task7
  FROZEN_MERGED_HEAD_OID=0123456789012345678901234567890123456789
  fail() { return 1; }
  source "$TMP_ROOT/read-local-task-ref.sh"
  read_local_task_ref
)

run_cleanup_revalidation() (
  export GIT_MASTER=1
  PATH="$TMP_ROOT/cleanup-gh-bin:$PATH"
  export PATH
  fail() { return 1; }
  validate_oid() { case "$2" in ""|*[!0-9a-f]*) return 1 ;; esac; test "${#2}" = 40; }
  validate_scalar() { case "$2" in ""|*$'\n'*|*$'\t'*|*=*) return 1 ;; esac; }
  source "$TMP_ROOT/observe-pr-issue.sh"
  source "$TMP_ROOT/revalidate-pr-issue.sh"
  CANONICAL_HOST=github.com
  CANONICAL_REPOSITORY=jinzer0/GPUWatch
  CANONICAL_REPOSITORY_ID=1256824919
  EXPECTED_BASE_REF=devel
  EXPECTED_HEAD_REF=publish/task7
  PR_NUMBER=41
  ISSUE_NUMBER=7
  FROZEN_PR_STATE=MERGED
  FROZEN_PR_BASE_REF=devel
  FROZEN_PR_HEAD_REF=publish/task7
  FROZEN_PR_HEAD_REPOSITORY=jinzer0/GPUWatch
  FROZEN_MERGED_HEAD_OID=0123456789012345678901234567890123456789
  FROZEN_ISSUE_STATE=OPEN
  FROZEN_ISSUE_UPDATED_AT=2026-09-10T00:00:00Z
  revalidate_pr_issue_tuple
)

setup_snapshot_root() {
  local root=$1 artifact
  mkdir "$root"
  chmod 700 "$root"
  for artifact in $SNAPSHOT_ARTIFACTS; do
    printf '%s\n' "$artifact" > "$root/$artifact"
    chmod 600 "$root/$artifact"
  done
}

run_snapshot_cleanup() (
  SNAPSHOT_ROOT=$1
  CURRENT_UID="$(id -u)"
  export SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/snapshot-cleanup.sh"
  cleanup_snapshot_root
)

run_failure_cleanup() (
  ROOT=$1
  SNAPSHOT_ROOT=$ROOT
  CURRENT_UID="$(id -u)"
  export ROOT SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  valid_root() { test "$1" = "$ROOT"; }
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/failure-cleanup-root.sh"
  cleanup_root "$ROOT"
)

assert_cleanup_revalidation_boundaries() {
  awk '
    /^[[:space:]]*```bash[[:space:]]*$/ { fence += 1; active = (fence == 2); next }
    active && /^[[:space:]]*```[[:space:]]*$/ { active = 0; next }
    active && /^[[:space:]]*revalidate_pr_issue_tuple[[:space:]]*$/ { last_revalidation = NR }
    active && /git worktree remove|git push --force-with-lease|git update-ref --no-deref -d|gh issue close/ {
      boundary_count++
      if (!last_revalidation || NR - last_revalidation > 10) {
        printf "destructive boundary lacks immediate replay revalidation at line %d\\n", NR > "/dev/stderr"
        invalid = 1
      }
    }
    END { if (boundary_count != 4) { printf "expected four destructive boundaries, found %d\\n", boundary_count > "/dev/stderr"; invalid = 1 }; exit invalid }
  ' "$CLEANUP_SKILL"
}

MOCK_BIN="$TMP_ROOT/bin"
MOCK_LOG="$TMP_ROOT/mock.log"
mkdir "$MOCK_BIN"
cat > "$MOCK_BIN/gh" <<'EOF'
#!/bin/bash
printf 'gh %s\n' "$*" >> "$MOCK_LOG"
case "$*" in
  *--paginate*--slurp*--jq*) exit 96 ;;
  *'repo view '*) exit 97 ;;
  *' graphql '*) printf '%s' "${MOCK_CLOSING_PAGES:?}" ;;
  *'pulls?state=all'*) printf '%s' "${MOCK_GH_PAGES:?}" ;;
  *'--method GET'*) printf '%s\n' '{"id":1256824919,"full_name":"jinzer0/GPUWatch"}' ;;
  *) exit 98 ;;
esac
EOF
cat > "$MOCK_BIN/git" <<'EOF'
#!/bin/bash
printf 'git %s\n' "$*" >> "$MOCK_LOG"
case " $* " in
  *' for-each-ref '* ) printf '%s\n' "${MOCK_REPLACE_REF:-}" ;;
  *' -c core.hooksPath=/dev/null commit '* ) exit 0 ;;
  * ) exit 99 ;;
esac
EOF
chmod 700 "$MOCK_BIN/gh" "$MOCK_BIN/git"

FINAL_SKILL="$REPO_ROOT/mydocs/skills/task-final-report/SKILL.md"
START_SKILL="$REPO_ROOT/mydocs/skills/task-start/SKILL.md"

extract_function() {
  local source_file=$1 function_name=$2 occurrence=$3 target_file=$4
  awk -v function_name="$function_name" -v occurrence="$occurrence" '
    $0 ~ "^[[:space:]]*" function_name "\\(\\)[[:space:]]*\\{" {
      found++
      if (found == occurrence) {
        active = 1
        indent = $0
        sub(/[^[:space:]].*/, "", indent)
      }
    }
    active {
      print
      if ($0 ~ /^[[:space:]]*}$/) {
        closing_indent = $0
        sub(/[^[:space:]].*/, "", closing_indent)
        if (length(closing_indent) <= length(indent)) exit
      }
    }
    END { if (!active || found < occurrence) exit 1 }
  ' "$source_file" > "$target_file"
  /bin/bash -n "$target_file"
}

extract_replacement_fence() {
  awk '
    /export GIT_NO_REPLACE_OBJECTS=1/ {
      print
      getline
      print
      exit
    }
    END { if (NR == 0) exit 1 }
  ' "$START_SKILL" > "$TMP_ROOT/replacement-fence.sh"
  /bin/bash -n "$TMP_ROOT/replacement-fence.sh"
}

extract_function "$FINAL_SKILL" list_matching_pr 1 "$TMP_ROOT/list-first.sh"
extract_function "$FINAL_SKILL" list_matching_pr 2 "$TMP_ROOT/list-second.sh"
extract_function "$FINAL_SKILL" validate_publication_dir 1 "$TMP_ROOT/directory-first.sh"
extract_function "$FINAL_SKILL" validate_publication_dir 2 "$TMP_ROOT/directory-second.sh"
extract_function "$FINAL_SKILL" validate_publication_input_membership 1 "$TMP_ROOT/membership-first.sh"
extract_function "$FINAL_SKILL" validate_publication_input_membership 2 "$TMP_ROOT/membership-second.sh"
extract_function "$FINAL_SKILL" read_publication_inputs 1 "$TMP_ROOT/reader-first.sh"
extract_function "$FINAL_SKILL" read_publication_inputs 2 "$TMP_ROOT/reader-second.sh"
extract_function "$FINAL_SKILL" verify_closing_issue_evidence 1 "$TMP_ROOT/closing.sh"
extract_replacement_fence

run_first_list() (
  source "$TMP_ROOT/list-first.sh"
  ISSUE_NUMBER=7
  PUBLISH_BRANCH=publish/task7
  list_matching_pr
  printf '%s' "$PUBLICATION_PR_NUMBER"
)

run_second_list() (
  source "$TMP_ROOT/list-second.sh"
  ISSUE_NUMBER=7
  APPROVED_PUBLISH_BRANCH=publish/task7
  list_matching_pr
  printf '%s' "$CURRENT_PR_NUMBER"
)

run_closing_evidence() (
  source "$TMP_ROOT/closing.sh"
  ISSUE_NUMBER=7
  CURRENT_PR_NUMBER=41
  verify_closing_issue_evidence
)

run_reader() {
  bash -euo pipefail -c '
    validate_utf8() { iconv -f UTF-8 -t UTF-8 "$1" >/dev/null; }
    source "$1"
    source "$2"
    source "$3"
    ISSUE_NUMBER=7
    TMPDIR="$4"
    PUBLICATION_DIR="$4/gpuwatcher-task7-publication.123456"
    read_publication_inputs
  ' -- "$1" "$2" "$3" "$TMP_ROOT"
}

setup_publication_input() {
  rm -rf -- "$TMP_ROOT/gpuwatcher-task7-publication.123456"
  mkdir "$TMP_ROOT/gpuwatcher-task7-publication.123456"
  printf 'Task #7: title\n' > "$TMP_ROOT/gpuwatcher-task7-publication.123456/title"
  printf 'note\nCloses #7\n' > "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"
  chmod 700 "$TMP_ROOT/gpuwatcher-task7-publication.123456"
  chmod 600 "$TMP_ROOT/gpuwatcher-task7-publication.123456/title" "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"
}

run_replacement_fence() (
  source "$TMP_ROOT/replacement-fence.sh"
)

PATH="$MOCK_BIN:$PATH" MOCK_LOG="$MOCK_LOG" MOCK_GH_PAGES='[[]]' gh api --hostname github.com --method GET repos/jinzer0/GPUWatch >/dev/null
expect_failure env PATH="$MOCK_BIN:$PATH" MOCK_LOG="$MOCK_LOG" gh repo view jinzer0/GPUWatch --json databaseId
assert_contains "$MOCK_LOG" 'gh api --hostname github.com --method GET repos/jinzer0/GPUWatch'
pass 'mocked gh rejects unsupported repo-view field and accepts explicit GET'

PATH="$MOCK_BIN:$PATH" MOCK_LOG="$MOCK_LOG" git -c core.hooksPath=/dev/null commit -m administrative >/dev/null
assert_contains "$MOCK_LOG" 'git -c core.hooksPath=/dev/null commit -m administrative'
PATH="$MOCK_BIN:$PATH"
export PATH MOCK_LOG
MOCK_REPLACE_REF=
export MOCK_REPLACE_REF
run_replacement_fence
MOCK_REPLACE_REF=refs/replace/evil
expect_failure run_replacement_fence
MOCK_REPLACE_REF=
pass 'mocked git records hook suppression and rejects replacement refs'

MOCK_GH_PAGES='[[],[]]'
export MOCK_GH_PAGES
test "$(run_first_list)" = none || fail 'first canonical empty paginated PR lookup'
MOCK_GH_PAGES='[[{"number":41}],[]]'
test "$(run_second_list)" = 41 || fail 'second canonical multi-page PR lookup'
MOCK_GH_PAGES='[[{"number":41}],[{"number":42}]]'
expect_failure run_first_list
MOCK_GH_PAGES='[[{"number":41},{"number":41}]]'
expect_failure run_second_list
MOCK_GH_PAGES='[{"number":41}]'
expect_failure run_first_list
assert_absent "$MOCK_LOG" '--jq'
pass 'extracted canonical PR lookups validate multi-page, duplicates, and malformed pages'

VALID_CLOSING='[{"data":{"repository":{"pullRequest":{"closingIssuesReferences":{"nodes":[{"number":7,"repository":{"nameWithOwner":"jinzer0/GPUWatch"}}],"pageInfo":{"hasNextPage":true,"endCursor":"cursor-1"}}}}}},{"data":{"repository":{"pullRequest":{"closingIssuesReferences":{"nodes":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}}}}}]'
MOCK_CLOSING_PAGES="$VALID_CLOSING"
export MOCK_CLOSING_PAGES
expect_success run_closing_evidence
MOCK_CLOSING_PAGES='[{"errors":[{"message":"bad"}],"data":null}]'
expect_failure run_closing_evidence
MOCK_CLOSING_PAGES='[{"data":{"repository":{"pullRequest":{"closingIssuesReferences":{"nodes":[{"number":7,"repository":{"nameWithOwner":"jinzer0/GPUWatch"}},{"number":8,"repository":{"nameWithOwner":"jinzer0/GPUWatch"}}],"pageInfo":{"hasNextPage":false,"endCursor":null}}}}}}]'
expect_failure run_closing_evidence
MOCK_CLOSING_PAGES='[{"data":{"repository":{"pullRequest":{"closingIssuesReferences":{"nodes":[],"pageInfo":{"hasNextPage":true,"endCursor":null}}}}}}]'
expect_failure run_closing_evidence
pass 'extracted closing-reference verification rejects GraphQL errors, extras, and incomplete pagination'

byte=0
while test "$byte" -le 31; do
  setup_publication_input
  printf 'note%b\nCloses #7\n' "\\$(printf '%03o' "$byte")" > "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"
  chmod 600 "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"
  case "$byte" in
    9|10) expect_success run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh" ;;
    *) expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh" ;;
  esac
  byte=$((byte + 1))
done
setup_publication_input
printf 'note\177\nCloses #7\n' > "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"
printf 'note\302\200\nCloses #7\n' > "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"
printf 'note\302\237\nCloses #7\n' > "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"
pass 'extracted canonical reader rejects every disallowed C0 byte, DEL, and C1'

setup_publication_input
expect_success run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"
expect_success run_reader "$TMP_ROOT/directory-second.sh" "$TMP_ROOT/membership-second.sh" "$TMP_ROOT/reader-second.sh"
chmod 400 "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"; chmod 600 "$TMP_ROOT/gpuwatcher-task7-publication.123456/body"
printf extra > "$TMP_ROOT/gpuwatcher-task7-publication.123456/.hidden"; expect_failure run_reader "$TMP_ROOT/directory-second.sh" "$TMP_ROOT/membership-second.sh" "$TMP_ROOT/reader-second.sh"; rm "$TMP_ROOT/gpuwatcher-task7-publication.123456/.hidden"
printf extra > "$TMP_ROOT/gpuwatcher-task7-publication.123456/extra"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"; rm "$TMP_ROOT/gpuwatcher-task7-publication.123456/extra"
printf extra > "$TMP_ROOT/gpuwatcher-task7-publication.123456"/$'newline\nentry'; expect_failure run_reader "$TMP_ROOT/directory-second.sh" "$TMP_ROOT/membership-second.sh" "$TMP_ROOT/reader-second.sh"; rm "$TMP_ROOT/gpuwatcher-task7-publication.123456"/$'newline\nentry'
ln -s body "$TMP_ROOT/gpuwatcher-task7-publication.123456/link"; expect_failure run_reader "$TMP_ROOT/directory-first.sh" "$TMP_ROOT/membership-first.sh" "$TMP_ROOT/reader-first.sh"; rm "$TMP_ROOT/gpuwatcher-task7-publication.123456/link"
mkdir "$TMP_ROOT/gpuwatcher-task7-publication.123456/nested"; expect_failure run_reader "$TMP_ROOT/directory-second.sh" "$TMP_ROOT/membership-second.sh" "$TMP_ROOT/reader-second.sh"; rmdir "$TMP_ROOT/gpuwatcher-task7-publication.123456/nested"
pass 'extracted canonical readers require exact mode-0600 title/body membership'

FINAL_SKILL="$REPO_ROOT/mydocs/skills/task-final-report/SKILL.md"
START_SKILL="$REPO_ROOT/mydocs/skills/task-start/SKILL.md"
AGENTS_FILE="$REPO_ROOT/AGENTS.md"
EXTERNAL_SKILL="$REPO_ROOT/mydocs/skills/external-pr-review/SKILL.md"
STAGE_SKILL="$REPO_ROOT/mydocs/skills/task-stage-report/SKILL.md"
CLEANUP_SKILL="$REPO_ROOT/mydocs/skills/pr-merge-cleanup/SKILL.md"
WORKFLOW_MANUAL="$REPO_ROOT/mydocs/manual/task_workflow_guide.md"
EXTERNAL_GUIDE="$REPO_ROOT/mydocs/manual/external_pr_review_guide.md"
PR_README="$REPO_ROOT/mydocs/pr/README.md"
GIT_WORKFLOW_MANUAL="$REPO_ROOT/mydocs/manual/git_workflow_guide.md"
assert_absent "$START_SKILL" 'gh repo view "$CANONICAL_REPOSITORY" --json databaseId'
if rg -n -- '--slurp[^\n]*--jq' "$FINAL_SKILL"; then fail 'slurp and gh jq are combined'; fi
assert_contains "$FINAL_SKILL" 'graphql --paginate --slurp'
assert_contains "$FINAL_SKILL" 'closingIssuesReferences(first: 100, after: $endCursor)'
assert_contains "$FINAL_SKILL" 'chmod 600 "$PUBLICATION_DIR/title" "$PUBLICATION_DIR/body"'
assert_contains "$FINAL_SKILL" '0[0-8b-f]'
assert_contains "$AGENTS_FILE" 'PR merge만으로 close를 승인하지 않으며'
assert_contains "$AGENTS_FILE" '타스크 진행 16단계'
test "$(grep -Ec '이 절차에는 같은 스레드의 서로 다른 두 승인만 있다\.|1\. final report/evidence 승인:|2\. publication 승인:' "$FINAL_SKILL")" = 3 || fail 'approval contract changed'
assert_absent "$EXTERNAL_SKILL" 'graphql mutation'
assert_absent "$EXTERNAL_SKILL" '--method POST'
assert_absent "$EXTERNAL_SKILL" 'gh issue '
assert_absent "$EXTERNAL_SKILL" 'gh pr '
assert_contains "$EXTERNAL_SKILL" 'gh api --method GET'
pass 'workflow source retains two approvals, read-only external calls, and fail-closed contracts'

PATH=$REAL_PATH
export PATH
assert_hook_suppression pre-push
assert_hook_suppression post-checkout
assert_hook_suppression post-merge
assert_hook_suppression reference-transaction
pass 'real isolated Git hooks fire without suppression and remain silent with the exported tuple'

check_required_fence_structure || fail 'required security fence structure is incomplete'
pass 'all 21 canonical Git-bearing fences export hook suppression before their first Git command'

assert_all_workflow_fences_parse
pass 'every canonical Markdown Bash fence parses with the system Bash 3.2 surface'

extract_function "$EXTERNAL_SKILL" delete_ref_cas 1 "$TMP_ROOT/delete-ref-cas.sh"
REF_REPO="$(new_hook_canary_repo ref-cas)"
REF_OID="$(GIT_MASTER=1 git -C "$REF_REPO" rev-parse HEAD)"
GIT_MASTER=1 git -C "$REF_REPO" update-ref refs/canary/direct "$REF_OID"
expect_success run_delete_ref_cas "$REF_REPO" refs/canary/direct "$REF_OID"
expect_failure ref_exists "$REF_REPO" refs/canary/direct
expect_failure symbolic_ref_exists "$REF_REPO" refs/canary/direct
GIT_MASTER=1 git -C "$REF_REPO" update-ref refs/canary/wrong-oid "$REF_OID"
expect_failure run_delete_ref_cas "$REF_REPO" refs/canary/wrong-oid 0000000000000000000000000000000000000000
test "$(GIT_MASTER=1 git -C "$REF_REPO" rev-parse refs/canary/wrong-oid)" = "$REF_OID" || fail 'wrong-OID CAS changed the ref'
GIT_MASTER=1 git -C "$REF_REPO" update-ref refs/heads/canary-target "$REF_OID"
GIT_MASTER=1 git -C "$REF_REPO" symbolic-ref refs/canary/symbolic refs/heads/canary-target
expect_failure run_delete_ref_cas "$REF_REPO" refs/canary/symbolic "$REF_OID"
test "$(GIT_MASTER=1 git -C "$REF_REPO" symbolic-ref refs/canary/symbolic)" = refs/heads/canary-target || fail 'symbolic ref was changed'
test "$(GIT_MASTER=1 git -C "$REF_REPO" rev-parse refs/heads/canary-target)" = "$REF_OID" || fail 'symbolic ref target was changed'
GIT_MASTER=1 git -C "$REF_REPO" symbolic-ref refs/canary/dangling refs/heads/missing
expect_failure run_delete_ref_cas "$REF_REPO" refs/canary/dangling "$REF_OID"
test "$(GIT_MASTER=1 git -C "$REF_REPO" symbolic-ref refs/canary/dangling)" = refs/heads/missing || fail 'dangling symbolic ref was changed'
pass 'temporary-ref CAS deletion accepts only a direct exact-OID ref and preserves dangling symrefs'

extract_function "$CLEANUP_SKILL" read_local_task_ref 1 "$TMP_ROOT/read-local-task-ref.sh"
LOCAL_REF_REPO="$(new_hook_canary_repo local-task-ref)"
GIT_MASTER=1 git -C "$LOCAL_REF_REPO" symbolic-ref refs/heads/local/task7 refs/heads/missing
expect_failure run_local_task_ref "$LOCAL_REF_REPO"
test "$(GIT_MASTER=1 git -C "$LOCAL_REF_REPO" symbolic-ref refs/heads/local/task7)" = refs/heads/missing || fail 'local dangling symbolic ref was changed'
pass 'canonical local-task ref helper rejects dangling symbolic refs before show-ref'

mkdir "$TMP_ROOT/cleanup-gh-bin"
cat > "$TMP_ROOT/cleanup-gh-bin/gh" <<'EOF'
#!/bin/bash
case "$1" in
  issue)
    test "${2:-}" = view || exit 99
    exit 97
    ;;
  api)
    case "$*" in
      *'/issues/'*) printf '%s' "${MOCK_ISSUE_TUPLE:?}" ;;
      *) printf '%s\n' 1256824919 ;;
    esac
    ;;
  repo)
    test "${2:-}" = view || exit 99
    printf '%s\n' jinzer0/GPUWatch
    ;;
  pr)
    test "${2:-}" = view || exit 99
    printf '%s\t%s\t%s\t%s\t%s\n' MERGED devel publish/task7 jinzer0/GPUWatch 0123456789012345678901234567890123456789
    ;;
  *) exit 99 ;;
esac
EOF
chmod 700 "$TMP_ROOT/cleanup-gh-bin/gh"
extract_function "$CLEANUP_SKILL" observe_pr_issue_tuple 1 "$TMP_ROOT/observe-pr-issue.sh"
extract_function "$CLEANUP_SKILL" revalidate_pr_issue_tuple 1 "$TMP_ROOT/revalidate-pr-issue.sh"
assert_absent "$TMP_ROOT/observe-pr-issue.sh" 'gh issue view'
assert_contains "$TMP_ROOT/observe-pr-issue.sh" 'gh api --hostname "$CANONICAL_HOST" --method GET "repos/$CANONICAL_REPOSITORY/issues/$ISSUE_NUMBER"'
MOCK_ISSUE_TUPLE=$'7\topen\t2026-09-10T00:00:00Z\n'
export MOCK_ISSUE_TUPLE
expect_success run_cleanup_revalidation
MOCK_ISSUE_TUPLE=$'7\topen\t2026-09-10T00:00:01Z\n'
if run_cleanup_revalidation; then fail 'updated_at replay unexpectedly succeeded'; fi
MOCK_ISSUE_TUPLE=$'8\topen\t2026-09-10T00:00:00Z\n'
if run_cleanup_revalidation; then fail 'issue response number mismatch unexpectedly succeeded'; fi
MOCK_ISSUE_TUPLE=$'7\topen\tbad=revision\n'
if run_cleanup_revalidation; then fail 'malformed issue revision unexpectedly succeeded'; fi
MOCK_ISSUE_TUPLE=$'7\topen\t2026-09-10T00:00:00Z\nsecond-line'
if run_cleanup_revalidation; then fail 'multiline issue revision unexpectedly succeeded'; fi
assert_cleanup_revalidation_boundaries
pass 'REST issue state and updated_at observation rejects replay, malformed revisions, and issue-view fallback'

SNAPSHOT_ARTIFACTS='before.repository.json before.pull.json before.issue-comments.json before.issue-timeline.json before.reviews.json before.review-comments.json before.review-threads.json before.check-runs.json before.statuses.json before.diff before.canonical.json after.repository.json after.pull.json after.issue-comments.json after.issue-timeline.json after.reviews.json after.review-comments.json after.review-threads.json after.check-runs.json after.statuses.json after.diff after.canonical.json'
export SNAPSHOT_ARTIFACTS
extract_function "$EXTERNAL_SKILL" validate_snapshot_membership 1 "$TMP_ROOT/snapshot-membership.sh"
extract_function "$EXTERNAL_SKILL" validate_snapshot_member 1 "$TMP_ROOT/snapshot-member.sh"
extract_function "$EXTERNAL_SKILL" validate_present_snapshot_membership 1 "$TMP_ROOT/snapshot-present-membership.sh"
extract_function "$EXTERNAL_SKILL" remove_validated_snapshot_members 1 "$TMP_ROOT/snapshot-remove-members.sh"
extract_function "$EXTERNAL_SKILL" cleanup_snapshot_root 1 "$TMP_ROOT/snapshot-cleanup.sh"
SNAPSHOT_CASE="$TMP_ROOT/snapshot-exact"
setup_snapshot_root "$SNAPSHOT_CASE"
expect_success run_snapshot_cleanup "$SNAPSHOT_CASE"
test ! -e "$SNAPSHOT_CASE" || fail 'exact snapshot root remains after cleanup'
SNAPSHOT_CASE="$TMP_ROOT/snapshot-partial"
setup_snapshot_root "$SNAPSHOT_CASE"
rm "$SNAPSHOT_CASE/after.diff"
expect_failure run_snapshot_cleanup "$SNAPSHOT_CASE"
test -f "$SNAPSHOT_CASE/before.diff" || fail 'partial snapshot removed an expected artifact'
for unknown_kind in regular hidden symlink directory; do
  SNAPSHOT_CASE="$TMP_ROOT/snapshot-unknown-$unknown_kind"
  setup_snapshot_root "$SNAPSHOT_CASE"
  case "$unknown_kind" in
    regular) printf extra > "$SNAPSHOT_CASE/extra" ;;
    hidden) printf extra > "$SNAPSHOT_CASE/.hidden" ;;
    symlink) ln -s before.diff "$SNAPSHOT_CASE/link" ;;
    directory) mkdir "$SNAPSHOT_CASE/nested" ;;
  esac
  expect_failure run_snapshot_cleanup "$SNAPSHOT_CASE"
  test -f "$SNAPSHOT_CASE/before.diff" || fail "$unknown_kind snapshot entry allowed expected deletion"
  test -e "$SNAPSHOT_CASE" || fail "$unknown_kind snapshot root was removed"
done
pass 'snapshot cleanup prevalidates exact private membership before individual removal'

extract_function "$EXTERNAL_SKILL" cleanup_root 1 "$TMP_ROOT/failure-cleanup-root.sh"
SNAPSHOT_CASE="$TMP_ROOT/snapshot-failure-partial"
setup_snapshot_root "$SNAPSHOT_CASE"
rm "$SNAPSHOT_CASE/after.diff"
expect_success run_failure_cleanup "$SNAPSHOT_CASE"
test ! -e "$SNAPSHOT_CASE" || fail 'partial failure snapshot root remains after cleanup'
SNAPSHOT_CASE="$TMP_ROOT/snapshot-failure-unknown"
setup_snapshot_root "$SNAPSHOT_CASE"
printf extra > "$SNAPSHOT_CASE/unknown"
expect_failure run_failure_cleanup "$SNAPSHOT_CASE"
test -f "$SNAPSHOT_CASE/before.diff" || fail 'unknown failure snapshot entry allowed expected deletion'
test -e "$SNAPSHOT_CASE" || fail 'unknown failure snapshot root was removed'
pass 'failure cleanup removes partial expected members but rejects unknown membership before deletion'

printf '1..%d\n' "$pass_count"
