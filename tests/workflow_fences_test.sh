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
  assert_contains "$EXTERNAL_SKILL" 'test "$symbolic_status" = 1 || return 1'
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

new_commit_fence_canary_repo() {
  local repo
  repo="$(new_hook_canary_repo "$1")"
  mkdir -p "$TMP_ROOT/commit-fence-tmp/$1"
  GIT_MASTER=1 git -C "$repo" checkout -qb local/task7
  printf '%s' "$repo"
}

commit_fence_tmpdir() {
  printf '%s/commit-fence-tmp/%s' "$TMP_ROOT" "$(basename "$1")"
}

transaction_directory_identity_set() {
  local transaction_parent=$1 transaction_dir identity records=
  if test ! -e "$transaction_parent" && test ! -L "$transaction_parent"; then
    return 0
  fi
  test -d "$transaction_parent" && test ! -L "$transaction_parent" || fail "transaction parent is not a directory $transaction_parent"
  for transaction_dir in "$transaction_parent"/gpuwatcher-ref-transaction*; do
    test -e "$transaction_dir" || test -L "$transaction_dir" || continue
    test -d "$transaction_dir" && test ! -L "$transaction_dir" || fail "transaction path is not a directory $transaction_dir"
    identity="$(stat -f '%d:%i' -- "$transaction_dir")" || fail "could not read transaction directory identity $transaction_dir"
    records="${records}${transaction_dir} ${identity}\n"
  done
  printf '%b' "$records" | LC_ALL=C sort
}

assert_transaction_directory_identity_set() {
  local transaction_parent=$1 before=$2 label=$3 after
  after="$(transaction_directory_identity_set "$transaction_parent")"
  test "$after" = "$before" || fail "$label left unexpected transaction directories expected=[$before] actual=[$after]"
}

setup_stage_fence_inputs() {
  local repo=$1
  mkdir -p "$repo/src" "$repo/mydocs/working"
  printf 'stage output\n' > "$repo/src/stage-output.txt"
  setup_stage_fence_report "$repo"
}

setup_stage_fence_report() {
  local repo=$1
  mkdir -p "$repo/mydocs/working"
  printf 'stage report\n' > "$repo/mydocs/working/task_m100_7_stage1.md"
  chmod 644 "$repo/mydocs/working/task_m100_7_stage1.md"
}

setup_impl_plan_fence_input() {
  local repo=$1
  mkdir -p "$repo/mydocs/plans"
  printf 'implementation plan\n' > "$repo/mydocs/plans/task_m100_7_impl.md"
  chmod 644 "$repo/mydocs/plans/task_m100_7_impl.md"
}

configure_commit_fence_runner() {
  set +e
  set +o pipefail
  TMPDIR="$(commit_fence_tmpdir "$PWD")"
  export TMPDIR
  export GIT_MASTER=1
  export GIT_AUTHOR_NAME=workflow
  export GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow
  export GIT_COMMITTER_EMAIL=workflow@example.test
}

run_stage_commit_fence() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_tampered_expected_paths() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=(initial)
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_staged_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  INJECTED_PATH=initial
  git() {
    if test "$1" = update-index; then
      command git "$@"
      command git add -- "$INJECTED_PATH"
    else
      command git "$@"
    fi
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_read_only_query_failure() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  git() {
    if test "$1" = for-each-ref; then
      return 1
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_pre_ref_worktree_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  DRIFT_PATH=$STAGE_REPORT_PATH
  git() {
    if test "$1" = commit-tree; then
      printf 'worktree drift\n' >> "$DRIFT_PATH"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_post_ref_worktree_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  DRIFT_PATH=$STAGE_REPORT_PATH
  UPDATE_REF_MARKER="$repo/.git/stage-post-ref-drift-marker"
  GIT_SHIM_LABEL=stage-post-ref-drift GIT_SHIM_MODE=post-ref-drift GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_DRIFT_PATH=$DRIFT_PATH GIT_SHIM_DRIFT_TEXT='post-ref worktree drift'
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_DRIFT_PATH GIT_SHIM_DRIFT_TEXT; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      command git "$@"
      status=$?
      if test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$DRIFT_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_tampered_expected_paths() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=(initial)
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_staged_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  INJECTED_PATH=initial
  git() {
    if test "$1" = update-index; then
      command git "$@"
      command git add -- "$INJECTED_PATH"
    else
      command git "$@"
    fi
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_read_only_query_failure() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  git() {
    if test "$1" = for-each-ref; then
      return 1
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_pre_ref_worktree_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  DRIFT_PATH=$IMPLEMENTATION_PLAN_PATH
  git() {
    if test "$1" = commit-tree; then
      printf 'worktree drift\n' >> "$DRIFT_PATH"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_post_ref_worktree_drift() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  DRIFT_PATH=$IMPLEMENTATION_PLAN_PATH
  UPDATE_REF_MARKER="$repo/.git/plan-post-ref-drift-marker"
  GIT_SHIM_LABEL=plan-post-ref-drift GIT_SHIM_MODE=post-ref-drift GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_DRIFT_PATH=$DRIFT_PATH GIT_SHIM_DRIFT_TEXT='post-ref worktree drift'
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_DRIFT_PATH GIT_SHIM_DRIFT_TEXT; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      command git "$@"
      status=$?
      if test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$DRIFT_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_pathspec_magic() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(':(top)src/stage-output.txt')
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_pathspec_magic() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=':(top)mydocs/plans/task_m100_7_impl.md'
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_directory_operand() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_index_directory_race() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  INDEX_RACE_PATH=${STAGE_OUTPUT_PATHS[0]}
  INDEX_RACE_TRIGGERED=0
  git() {
    if test "$1" = update-index && test "$INDEX_RACE_TRIGGERED" = 0; then
      rm -- "$INDEX_RACE_PATH" || return 1
      mkdir "$INDEX_RACE_PATH" || return 1
      printf 'directory race descendant\n' > "$INDEX_RACE_PATH/unapproved.txt" || return 1
      INDEX_RACE_TRIGGERED=1
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_directory_operand() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_index_directory_race() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  INDEX_RACE_PATH=$IMPLEMENTATION_PLAN_PATH
  INDEX_RACE_TRIGGERED=0
  git() {
    if test "$1" = update-index && test "$INDEX_RACE_TRIGGERED" = 0; then
      rm -- "$INDEX_RACE_PATH" || return 1
      mkdir "$INDEX_RACE_PATH" || return 1
      printf 'directory race descendant\n' > "$INDEX_RACE_PATH/unapproved.txt" || return 1
      INDEX_RACE_TRIGGERED=1
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_forward_symref() (
  local repo=$1 target_ref=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  TARGET_REF=$target_ref
  GIT_SHIM_LABEL=stage-forward-symref
  GIT_SHIM_MODE=forward-symref
  GIT_SHIM_BRANCH_REF=refs/heads/local/task7
  GIT_SHIM_TARGET_REF=$target_ref
  export GIT_SHIM_MODE GIT_SHIM_BRANCH_REF GIT_SHIM_TARGET_REF
  install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_forward_symref() (
  local repo=$1 target_ref=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  TARGET_REF=$target_ref
  GIT_SHIM_LABEL=plan-forward-symref
  GIT_SHIM_MODE=forward-symref
  GIT_SHIM_BRANCH_REF=refs/heads/local/task7
  GIT_SHIM_TARGET_REF=$target_ref
  export GIT_SHIM_MODE GIT_SHIM_BRANCH_REF GIT_SHIM_TARGET_REF
  install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_post_ref_hardlink() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  DRIFT_LINK_PATH=mydocs/working/stage-report-hardlink
  UPDATE_REF_CALLS=0
  GIT_SHIM_LABEL=stage-post-ref-hardlink GIT_SHIM_MODE=post-ref-hardlink GIT_SHIM_MARKER="$repo/.git/stage-post-ref-hardlink-marker" GIT_SHIM_SOURCE_PATH=$STAGE_REPORT_PATH GIT_SHIM_DRIFT_PATH=$DRIFT_LINK_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_SOURCE_PATH GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      command git "$@"
      status=$?
      if test "$UPDATE_REF_CALLS" = 0 && test "$status" = 0; then
        ln "$STAGE_REPORT_PATH" "$DRIFT_LINK_PATH" || return 1
      fi
      UPDATE_REF_CALLS=$((UPDATE_REF_CALLS + 1))
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_post_ref_hardlink() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  DRIFT_LINK_PATH=mydocs/plans/implementation-plan-hardlink
  UPDATE_REF_CALLS=0
  GIT_SHIM_LABEL=plan-post-ref-hardlink GIT_SHIM_MODE=post-ref-hardlink GIT_SHIM_MARKER="$repo/.git/plan-post-ref-hardlink-marker" GIT_SHIM_SOURCE_PATH=$IMPLEMENTATION_PLAN_PATH GIT_SHIM_DRIFT_PATH=$DRIFT_LINK_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_SOURCE_PATH GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      command git "$@"
      status=$?
      if test "$UPDATE_REF_CALLS" = 0 && test "$status" = 0; then
        ln "$IMPLEMENTATION_PLAN_PATH" "$DRIFT_LINK_PATH" || return 1
      fi
      UPDATE_REF_CALLS=$((UPDATE_REF_CALLS + 1))
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_rollback_symref() (
  local repo=$1 target_ref=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  TARGET_REF=$target_ref
  UPDATE_REF_MARKER="$repo/.git/stage-rollback-symref-marker"
  GIT_SHIM_LABEL=stage-rollback-symref GIT_SHIM_MODE=rollback-symref GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_BRANCH_REF=refs/heads/local/task7 GIT_SHIM_TARGET_REF=$target_ref GIT_SHIM_DRIFT_PATH=$STAGE_REPORT_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_BRANCH_REF GIT_SHIM_TARGET_REF GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref && test "${2:-}" = --stdin; then
      if test -e "$UPDATE_REF_MARKER"; then
        command git symbolic-ref "$BRANCH_REF" "$TARGET_REF" || return 1
      fi
      command git "$@"
      status=$?
      if test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$STAGE_REPORT_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_rollback_symref() (
  local repo=$1 target_ref=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  TARGET_REF=$target_ref
  UPDATE_REF_MARKER="$repo/.git/plan-rollback-symref-marker"
  GIT_SHIM_LABEL=plan-rollback-symref GIT_SHIM_MODE=rollback-symref GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_BRANCH_REF=refs/heads/local/task7 GIT_SHIM_TARGET_REF=$target_ref GIT_SHIM_DRIFT_PATH=$IMPLEMENTATION_PLAN_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_BRANCH_REF GIT_SHIM_TARGET_REF GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref && test "${2:-}" = --stdin; then
      if test -e "$UPDATE_REF_MARKER"; then
        command git symbolic-ref "$BRANCH_REF" "$TARGET_REF" || return 1
      fi
      command git "$@"
      status=$?
      if test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$IMPLEMENTATION_PLAN_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_rollback_ref_conflict() (
  local repo=$1 third_oid=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=(src/stage-output.txt)
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
  THIRD_OID=$third_oid
  UPDATE_REF_MARKER="$repo/.git/stage-rollback-conflict-marker"
  GIT_SHIM_LABEL=stage-rollback-conflict GIT_SHIM_MODE=rollback-third-oid GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_BRANCH_REF=refs/heads/local/task7 GIT_SHIM_THIRD_OID=$third_oid GIT_SHIM_DRIFT_PATH=$STAGE_REPORT_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_BRANCH_REF GIT_SHIM_THIRD_OID GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      if test "${2:-}" = --stdin && test -e "$UPDATE_REF_MARKER"; then
        command git update-ref refs/heads/local/task7 "$THIRD_OID" || return 1
      fi
      command git "$@"
      status=$?
      if test "${2:-}" = --stdin && test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$STAGE_REPORT_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_rollback_ref_conflict() (
  local repo=$1 third_oid=$2
  cd "$repo"
  configure_commit_fence_runner
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
  THIRD_OID=$third_oid
  UPDATE_REF_MARKER="$repo/.git/plan-rollback-conflict-marker"
  GIT_SHIM_LABEL=plan-rollback-conflict GIT_SHIM_MODE=rollback-third-oid GIT_SHIM_MARKER=$UPDATE_REF_MARKER GIT_SHIM_BRANCH_REF=refs/heads/local/task7 GIT_SHIM_THIRD_OID=$third_oid GIT_SHIM_DRIFT_PATH=$IMPLEMENTATION_PLAN_PATH
  export GIT_SHIM_MODE GIT_SHIM_MARKER GIT_SHIM_BRANCH_REF GIT_SHIM_THIRD_OID GIT_SHIM_DRIFT_PATH; install_git_path_shim
  git() {
    local status
    if test "$1" = update-ref; then
      if test "${2:-}" = --stdin && test -e "$UPDATE_REF_MARKER"; then
        command git update-ref refs/heads/local/task7 "$THIRD_OID" || return 1
      fi
      command git "$@"
      status=$?
      if test "${2:-}" = --stdin && test ! -e "$UPDATE_REF_MARKER" && test "$status" = 0; then
        touch "$UPDATE_REF_MARKER" || return 1
        printf 'post-ref worktree drift\n' >> "$IMPLEMENTATION_PLAN_PATH" || return 1
      fi
      return "$status"
    fi
    command git "$@"
  }
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

make_third_party_oid() {
  local repo=$1 parent tree
  parent="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  tree="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD^{tree})"
  GIT_AUTHOR_NAME=third GIT_AUTHOR_EMAIL=third@example.test GIT_COMMITTER_NAME=third GIT_COMMITTER_EMAIL=third@example.test GIT_MASTER=1 git -C "$repo" commit-tree "$tree" -p "$parent" -m third
}

assert_staged_path_set() {
  local repo=$1 expected_path_set=$2 label=$3 actual_path_set
  actual_path_set="$(GIT_MASTER=1 git -C "$repo" diff --cached --name-only --no-renames | LC_ALL=C sort)"
  test "$actual_path_set" = "$expected_path_set" || fail "$label staged an unexpected path"
}

assert_direct_ref_oid() {
  local repo=$1 ref=$2 expected_oid=$3 actual_oid
  expect_failure symbolic_ref_exists "$repo" "$ref"
  actual_oid="$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' "$ref")"
  test "$actual_oid" = "$expected_oid" || fail "$ref changed unexpectedly"
}

assert_fence_rejects_without_commit() {
  local runner=$1 repo=$2 label=$3 before
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  expect_failure "$runner" "$repo"
  test "$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)" = "$before" || fail "$label created a commit"
}

assert_fence_rejects_without_commit_with_argument() {
  local runner=$1 repo=$2 argument=$3 label=$4 before
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  expect_failure "$runner" "$repo" "$argument"
  test "$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)" = "$before" || fail "$label created a commit"
}

assert_fence_commits_only_expected_paths() {
  local runner=$1 repo=$2 expected_path=$3 label=$4 before after actual output
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  output="$("$runner" "$repo")" || fail "$label"
  after="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  test "$after" != "$before" || fail "$label did not create a commit"
  test "$output" = "$after" || fail "$label did not return the exact full commit OID"
  test "$(GIT_MASTER=1 git -C "$repo" rev-parse "$after^")" = "$before" || fail "$label changed the commit parent"
  actual="$(GIT_MASTER=1 git -C "$repo" diff-tree --no-commit-id --name-only -r --no-renames "$after")"
  test "$actual" = "$expected_path" || fail "$label committed an unexpected path"
  test -z "$(GIT_MASTER=1 git -C "$repo" status --porcelain)" || fail "$label left the canary dirty"
  assert_successful_commit_fence_cleanup "$repo" "$label"
}

assert_fence_commits_only_expected_paths_with_argument() {
  local runner=$1 repo=$2 argument=$3 expected_path=$4 label=$5 before after actual output
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  output="$("$runner" "$repo" "$argument")" || fail "$label"
  after="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  test "$after" != "$before" || fail "$label did not create a commit"
  test "$output" = "$after" || fail "$label did not return the exact full commit OID"
  test "$(GIT_MASTER=1 git -C "$repo" rev-parse "$after^")" = "$before" || fail "$label changed the commit parent"
  actual="$(GIT_MASTER=1 git -C "$repo" diff-tree --no-commit-id --name-only -r --no-renames "$after")"
  test "$actual" = "$expected_path" || fail "$label committed an unexpected path"
  test -z "$(GIT_MASTER=1 git -C "$repo" status --porcelain)" || fail "$label left the canary dirty"
  assert_successful_commit_fence_cleanup "$repo" "$label"
}

assert_successful_commit_fence_cleanup() {
  local repo=$1 label=$2 transaction_tmpdir transaction_dir branch_lock current_oid
  transaction_tmpdir="$(commit_fence_tmpdir "$repo")"
  for transaction_dir in "$transaction_tmpdir"/gpuwatcher-ref-transaction.*; do
    test ! -e "$transaction_dir" || fail "$label left a ref transaction directory"
  done
  branch_lock="$(GIT_MASTER=1 git -C "$repo" rev-parse --git-path refs/heads/local/task7.lock)"
  test ! -e "$branch_lock" || fail "$label left its branch lock"
  current_oid="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
  printf 'start\noption no-deref\nupdate refs/heads/local/task7 %s %s\nprepare\ncommit\n' "$current_oid" "$current_oid" |
    GIT_MASTER=1 git -C "$repo" update-ref --stdin >/dev/null || fail "$label left its branch transaction-locked"
  test ! -e "$branch_lock" || fail "$label no-op transaction left its branch lock"
}

commit_canary_index() {
  local repo=$1 message=$2
  GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test GIT_MASTER=1 git -C "$repo" commit -qm "$message"
}

seed_absent_tracked_gitlink() {
  local repo=$1 operand=$2 object_oid
  object_oid="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  mkdir -p "$(dirname "$repo/$operand")"
  GIT_MASTER=1 git -C "$repo" update-index --add --cacheinfo "160000,$object_oid,$operand"
  commit_canary_index "$repo" gitlink-fixture
  rm -rf -- "$repo/$operand"
}

seed_absent_tracked_regular_file() {
  local repo=$1 operand=$2
  mkdir -p "$(dirname "$repo/$operand")"
  printf 'tracked deletion fixture\n' > "$repo/$operand"
  GIT_MASTER=1 git -C "$repo" add -- "$operand"
  commit_canary_index "$repo" deletion-fixture
  rm -- "$repo/$operand"
}

seed_ignored_tracked_deletion() {
  local repo=$1 operand=$2
  mkdir -p "$(dirname "$repo/$operand")"
  printf 'tracked ignored deletion fixture\n' > "$repo/$operand"
  GIT_MASTER=1 git -C "$repo" add -- "$operand"
  printf '%s\n' "$operand" > "$repo/.gitignore"
  GIT_MASTER=1 git -C "$repo" add -- .gitignore
  commit_canary_index "$repo" ignored-deletion-fixture
  rm -- "$repo/$operand"
}

configure_stage_commit_fence_context() {
  local stage_output=$1
  EXPECTED_BRANCH=local/task7
  STAGE_OUTPUT_PATHS=("$stage_output")
  STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
  EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
}

configure_plan_commit_fence_context() {
  EXPECTED_BRANCH=local/task7
  IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
  EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
}

install_ignored_recreation_after_force_remove_wrapper() {
  git() {
    local status
    if test "$1" = update-index && test "${2:-}" = --force-remove; then
      command git "$@"
      status=$?
      test "$status" = 0 || return "$status"
      printf 'recreated after removal\n' > "$RECREATED_PATH" || return 1
      return 0
    fi
    command git "$@"
  }
}

install_peer_failure_update_ref_wrapper() {
  git() {
    if test "$1" = update-ref && test "${2:-}" = --stdin; then
      return 97
    fi
    command git "$@"
  }
}

install_peer_failure_cleanup_hold_wrapper() {
  git() {
    local attempt
    if test "$1" = update-ref && test "${2:-}" = --stdin; then
      (exit 97)
      test "$?" = 97 || return 98
      trap 'exit 97' TERM
      attempt=0
      while test "$attempt" -lt 40; do
        /bin/sleep 0.05
        attempt=$((attempt + 1))
      done
      return 97
    fi
    command git "$@"
  }
}

install_commit_applied_response_omitted_wrapper() {
  git() {
    local protocol_line protocol_verb received_ref received_new_oid received_old_oid saw_no_deref
    if test "$1" = update-ref && test "${2:-}" = --stdin; then
      saw_no_deref=0
      while IFS= read -r protocol_line; do
        case "$protocol_line" in
          start) printf 'start: ok\n' ;;
          'option no-deref') saw_no_deref=1 ;;
          update\ *)
            IFS=' ' read -r protocol_verb received_ref received_new_oid received_old_oid <<EOF
$protocol_line
EOF
            test "$protocol_verb" = update || return 98
            ;;
          prepare) printf 'prepare: ok\n' ;;
          commit)
            test "$saw_no_deref" = 1 || return 98
            test -n "${received_ref:-}" && test -n "${received_new_oid:-}" && test -n "${received_old_oid:-}" || return 98
            printf 'start\noption no-deref\nupdate %s %s %s\nprepare\ncommit\n' "$received_ref" "$received_new_oid" "$received_old_oid" |
              command git update-ref --stdin >/dev/null || return 98
            printf 'test wrapper withheld commit response after applying CAS\n' >&2
            return 97
            ;;
          *) return 98 ;;
        esac
      done
      return 98
    fi
    command git "$@"
  }
}

install_git_path_shim() {
  GIT_SHIM_BIN="$(mktemp -d "$TMP_ROOT/git-shim-${GIT_SHIM_LABEL:?}.XXXXXX")" || return 1
  REAL_GIT="$(type -P git)"
  test -n "$REAL_GIT" || return 1
  export REAL_GIT
  PATH="$GIT_SHIM_BIN:$REAL_PATH"
  export PATH
  hash -r
cat > "$GIT_SHIM_BIN/git" <<'EOF'
#!/bin/bash
case "${GIT_SHIM_MODE:-}" in
  ignored-recreation)
    if test "${1:-}" = update-index && test "${2:-}" = --force-remove; then
      "$REAL_GIT" "$@"
      status=$?
      test "$status" = 0 || exit "$status"
      printf 'recreated after removal\n' > "$GIT_SHIM_RECREATED_PATH" || exit 1
      exit 0
    fi
    ;;
  orphan-child)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      test -n "${GIT_SHIM_CHILD_TOKEN:-}" || exit 98
      printf 'shim_pid=%s shim_ppid=%s child_token=%s\n' "$$" "$PPID" "$GIT_SHIM_CHILD_TOKEN" > "$GIT_SHIM_PROCESS_LOG" || exit 98
      /bin/bash -c 'while :; do /bin/sleep 1; done' "$GIT_SHIM_CHILD_TOKEN" &
      printf '%s\n' "$!" > "$GIT_SHIM_CHILD_PID_FILE" || exit 98
      exit 97
    fi
    ;;
  forward-symref)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      "$REAL_GIT" symbolic-ref "$GIT_SHIM_BRANCH_REF" "$GIT_SHIM_TARGET_REF" || exit 98
      exit 97
    fi
    ;;
  archive-third-oid)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      "$REAL_GIT" update-ref "$GIT_SHIM_BRANCH_REF" "$GIT_SHIM_THIRD_OID" || exit 98
      exit 97
    fi
    ;;
  peer-failure)
    test "${1:-}" = update-ref && test "${2:-}" = --stdin && exit 97
    ;;
  peer-hold)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      trap 'exit 97' TERM
      /bin/sleep 0.05
      exit 97
    fi
    ;;
  post-ref-drift)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      "$REAL_GIT" "$@"; status=$?
      if test "$status" = 0 && test ! -e "$GIT_SHIM_MARKER"; then touch "$GIT_SHIM_MARKER" && printf '%s\n' "$GIT_SHIM_DRIFT_TEXT" >> "$GIT_SHIM_DRIFT_PATH"; fi
      exit "$status"
    fi
    ;;
  post-ref-hardlink)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      "$REAL_GIT" "$@"; status=$?
      if test "$status" = 0 && test ! -e "$GIT_SHIM_MARKER"; then touch "$GIT_SHIM_MARKER" && ln "$GIT_SHIM_SOURCE_PATH" "$GIT_SHIM_DRIFT_PATH"; fi
      exit "$status"
    fi
    ;;
  rollback-symref|rollback-third-oid)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      if test -e "$GIT_SHIM_MARKER"; then
        if test "$GIT_SHIM_MODE" = rollback-symref; then "$REAL_GIT" symbolic-ref "$GIT_SHIM_BRANCH_REF" "$GIT_SHIM_TARGET_REF" || exit 98; else "$REAL_GIT" update-ref "$GIT_SHIM_BRANCH_REF" "$GIT_SHIM_THIRD_OID" || exit 98; fi
      fi
      "$REAL_GIT" "$@"; status=$?
      if test ! -e "$GIT_SHIM_MARKER" && test "$status" = 0; then touch "$GIT_SHIM_MARKER" && printf 'post-ref worktree drift\n' >> "$GIT_SHIM_DRIFT_PATH"; fi
      exit "$status"
    fi
    ;;
  response-loss)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      while IFS= read -r protocol_line; do
        case "$protocol_line" in start) printf 'start: ok\n' ;; 'option no-deref') ;; update\ *) update_line="$protocol_line" ;; prepare) printf 'prepare: ok\n' ;; commit) printf 'start\noption no-deref\n%s\nprepare\ncommit\n' "$update_line" | "$REAL_GIT" update-ref --stdin >/dev/null || exit 98; printf 'test shim withheld commit response after applying CAS\n' >&2; exit 97 ;; *) exit 98 ;; esac
      done
      exit 98
    fi
    ;;
  commit-cleanup-failure|commit-then-signal)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      if test -n "${GIT_SHIM_LIFECYCLE_ONCE_MARKER:-}" && test -e "$GIT_SHIM_LIFECYCLE_ONCE_MARKER"; then
        exec "$REAL_GIT" "$@"
      fi
      received_ref=
      received_new_oid=
      received_old_oid=
      saw_no_deref=0
      while IFS= read -r protocol_line; do
        case "$protocol_line" in
          start) printf 'start: ok\n' ;;
          'option no-deref') saw_no_deref=1 ;;
          update\ *)
            IFS=' ' read -r protocol_verb received_ref received_new_oid received_old_oid <<PROTOCOL
$protocol_line
PROTOCOL
            test "$protocol_verb" = update || exit 98
            ;;
          prepare) printf 'prepare: ok\n' ;;
          commit)
            test "$saw_no_deref" = 1 || exit 98
            test -n "$received_ref" && test -n "$received_new_oid" && test -n "$received_old_oid" || exit 98
            printf 'start\noption no-deref\nupdate %s %s %s\nprepare\ncommit\n' "$received_ref" "$received_new_oid" "$received_old_oid" |
              "$REAL_GIT" update-ref --stdin >/dev/null || exit 98
            printf 'advanced ref=%s old=%s new=%s\n' "$received_ref" "$received_old_oid" "$received_new_oid" > "$GIT_SHIM_LIFECYCLE_LOG" || exit 98
            if test -n "${GIT_SHIM_LIFECYCLE_ONCE_MARKER:-}"; then touch "$GIT_SHIM_LIFECYCLE_ONCE_MARKER" || exit 98; fi
            if test -n "${GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET:-}"; then
              "$REAL_GIT" symbolic-ref "$received_ref" "$GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET" || exit 98
              printf 'symbolic target=%s\n' "$GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET" >> "$GIT_SHIM_LIFECYCLE_LOG" || exit 98
            fi
            case "$GIT_SHIM_MODE" in
              commit-cleanup-failure)
                transaction_dir=
                for candidate_dir in "${TMPDIR:-/tmp}"/gpuwatcher-ref-transaction.*; do
                  test -d "$candidate_dir" || continue
                  transaction_dir=$candidate_dir
                  break
                done
                test -n "$transaction_dir" || exit 98
                : > "$transaction_dir/transport-cleanup-failure" || exit 98
                chmod 600 "$transaction_dir/transport-cleanup-failure" || exit 98
                printf 'cleanup blocker=%s\n' "$transaction_dir/transport-cleanup-failure" >> "$GIT_SHIM_LIFECYCLE_LOG" || exit 98
                printf 'commit: ok\n'
                exit 0
                ;;
              commit-then-signal)
                printf 'self-signal=TERM pid=%s\n' "$$" >> "$GIT_SHIM_LIFECYCLE_LOG" || exit 98
                builtin kill -TERM "$$"
                exit 98
                ;;
            esac
            ;;
          *) exit 98 ;;
        esac
      done
      exit 98
    fi
    ;;
  post-wait-pgid-probe)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      printf 'leader=%s\n' "$$" > "$GIT_SHIM_LIFECYCLE_LOG" || exit 98
    fi
    ;;
  replace-transaction-directory)
    if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
      for transaction_dir in "${TMPDIR:-/tmp}"/gpuwatcher-ref-transaction.*; do
        test -d "$transaction_dir" || continue
        mv "$transaction_dir" "$transaction_dir.replaced" || exit 98
        mkdir "$transaction_dir" || exit 98
        : > "$transaction_dir/input" || exit 98
        printf 'start: ok\nprepare: ok\ncommit: ok\n' > "$transaction_dir/response" || exit 98
        : > "$transaction_dir/error" || exit 98
        printf '%s\n' "$transaction_dir.replaced" > "$GIT_SHIM_REPLACED_DIR_FILE" || exit 98
        break
      done
    fi
    ;;
esac
exec "$REAL_GIT" "$@"
EOF
  chmod 700 "$GIT_SHIM_BIN/git"
}

run_stage_commit_fence_for_output() (
  local repo=$1 stage_output=$2
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context "$stage_output"
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_ignored_recreation() (
  local repo=$1 stage_output=$2
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context "$stage_output"
  RECREATED_PATH=$stage_output
  install_ignored_recreation_after_force_remove_wrapper
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_path_shim_ignored_recreation() (
  local repo=$1 stage_output=$2
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context "$stage_output"
  GIT_SHIM_LABEL=stage-ignored-recreation
  GIT_SHIM_MODE=ignored-recreation
  GIT_SHIM_RECREATED_PATH=$stage_output
  export GIT_SHIM_MODE GIT_SHIM_RECREATED_PATH
  install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_path_shim_orphan_child() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  GIT_SHIM_LABEL=stage-orphan-child
  GIT_SHIM_MODE=orphan-child
  GIT_SHIM_PROCESS_LOG="$repo/.git/stage-shim-process.log"
  GIT_SHIM_CHILD_PID_FILE="$repo/.git/stage-shim-child.pid"
  export GIT_SHIM_MODE GIT_SHIM_PROCESS_LOG GIT_SHIM_CHILD_PID_FILE
  install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_path_shim_transaction_directory_replacement() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  GIT_SHIM_LABEL=stage-transaction-directory-replacement
  GIT_SHIM_MODE=replace-transaction-directory
  GIT_SHIM_REPLACED_DIR_FILE="$repo/.git/stage-shim-replaced-dir"
  export GIT_SHIM_MODE GIT_SHIM_REPLACED_DIR_FILE
  install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_peer_failure() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  GIT_SHIM_LABEL=stage-peer-failure GIT_SHIM_MODE=peer-failure; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_peer_failure_cleanup_hold() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  GIT_SHIM_LABEL=stage-peer-hold GIT_SHIM_MODE=peer-hold; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_stage_commit_fence_with_commit_response_omitted() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  GIT_SHIM_LABEL=stage-response-loss GIT_SHIM_MODE=response-loss; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_plan_file_operand_validator() (
  local repo=$1 operand=$2
  cd "$repo"
  configure_commit_fence_runner
  source "$TMP_ROOT/plan-file-operand-validator.sh"
  plan_validate_file_operand "$operand"
)

run_plan_exact_index_operand() (
  local repo=$1 operand=$2 expected_kind=$3
  cd "$repo"
  configure_commit_fence_runner
  source "$TMP_ROOT/plan-file-operand-validator.sh"
  source "$TMP_ROOT/plan-exact-index-operand.sh"
  plan_update_exact_index_operand "$operand" "$expected_kind"
)

run_impl_plan_commit_fence_with_peer_failure() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-peer-failure GIT_SHIM_MODE=peer-failure; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_peer_failure_cleanup_hold() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-peer-hold GIT_SHIM_MODE=peer-hold; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_commit_response_omitted() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-response-loss GIT_SHIM_MODE=response-loss; export GIT_SHIM_MODE; install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_ignored_recreation() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  RECREATED_PATH=$IMPLEMENTATION_PLAN_PATH
  install_ignored_recreation_after_force_remove_wrapper
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_path_shim_ignored_recreation() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-ignored-recreation
  GIT_SHIM_MODE=ignored-recreation
  GIT_SHIM_RECREATED_PATH=$IMPLEMENTATION_PLAN_PATH
  export GIT_SHIM_MODE GIT_SHIM_RECREATED_PATH
  install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_path_shim_orphan_child() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-orphan-child
  GIT_SHIM_MODE=orphan-child
  GIT_SHIM_PROCESS_LOG="$repo/.git/plan-shim-process.log"
  GIT_SHIM_CHILD_PID_FILE="$repo/.git/plan-shim-child.pid"
  export GIT_SHIM_MODE GIT_SHIM_PROCESS_LOG GIT_SHIM_CHILD_PID_FILE
  install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_impl_plan_commit_fence_with_path_shim_transaction_directory_replacement() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  GIT_SHIM_LABEL=plan-transaction-directory-replacement
  GIT_SHIM_MODE=replace-transaction-directory
  GIT_SHIM_REPLACED_DIR_FILE="$repo/.git/plan-shim-replaced-dir"
  export GIT_SHIM_MODE GIT_SHIM_REPLACED_DIR_FILE
  install_git_path_shim
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

configure_commit_lifecycle_path_shim() {
  local repo=$1 label=$2 mode=$3 post_commit_state=${4:-direct}
  GIT_SHIM_LABEL=$label
  GIT_SHIM_MODE=$mode
  GIT_SHIM_LIFECYCLE_LOG="$repo/.git/${label}.log"
  GIT_SHIM_LIFECYCLE_ONCE_MARKER="$repo/.git/${label}.once"
  GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET=
  if test "$post_commit_state" = symbolic; then
    GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET=refs/heads/lifecycle-competing
  fi
  export GIT_SHIM_MODE GIT_SHIM_LIFECYCLE_LOG GIT_SHIM_LIFECYCLE_ONCE_MARKER GIT_SHIM_POST_COMMIT_SYMBOLIC_TARGET
  install_git_path_shim
}

install_post_wait_pgid_probe_wrappers() {
  POST_WAIT_PGID_WAITED=0
  wait() {
    local wait_target wait_status leader_pid
    wait_target=${1:-}
    leader_pid="$(awk -F= '/^leader=/{print $2; exit}' "$GIT_SHIM_LIFECYCLE_LOG" 2>/dev/null || :)"
    builtin wait "$@"
    wait_status=$?
    if test -n "$leader_pid" && test "$wait_target" = "$leader_pid"; then
      POST_WAIT_PGID_WAITED=1
      printf 'waited leader=%s status=%s\n' "$leader_pid" "$wait_status" >> "$POST_WAIT_PGID_EVENT_LOG"
    fi
    return "$wait_status"
  }
  kill() {
    local kill_argument kill_target=
    for kill_argument in "$@"; do
      kill_target=$kill_argument
    done
    if test "$POST_WAIT_PGID_WAITED" = 1; then
      case "$kill_target" in
        -[0-9]*)
          printf 'post-wait negative-pgid kill %s\n' "$*" >> "$POST_WAIT_PGID_EVENT_LOG"
          return 1
          ;;
      esac
    fi
    builtin kill "$@"
  }
}

run_stage_commit_fence_with_commit_cleanup_failure() (
  local repo=$1 post_commit_state=${2:-direct}
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  configure_commit_lifecycle_path_shim "$repo" stage-commit-cleanup-failure commit-cleanup-failure "$post_commit_state"
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_commit_cleanup_failure() (
  local repo=$1 post_commit_state=${2:-direct}
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  configure_commit_lifecycle_path_shim "$repo" plan-commit-cleanup-failure commit-cleanup-failure "$post_commit_state"
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_commit_then_signal() (
  local repo=$1 post_commit_state=${2:-direct}
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  configure_commit_lifecycle_path_shim "$repo" stage-commit-then-signal commit-then-signal "$post_commit_state"
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_commit_then_signal() (
  local repo=$1 post_commit_state=${2:-direct}
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  configure_commit_lifecycle_path_shim "$repo" plan-commit-then-signal commit-then-signal "$post_commit_state"
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

run_stage_commit_fence_with_post_wait_pgid_probe() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_stage_commit_fence_context src/stage-output.txt
  configure_commit_lifecycle_path_shim "$repo" stage-post-wait-pgid-probe post-wait-pgid-probe
  POST_WAIT_PGID_EVENT_LOG="$repo/.git/stage-post-wait-pgid-probe-events.log"
  export POST_WAIT_PGID_EVENT_LOG
  install_post_wait_pgid_probe_wrappers
  source "$TMP_ROOT/stage-commit-fence.sh"
  stage_commit_fence
)

run_impl_plan_commit_fence_with_post_wait_pgid_probe() (
  local repo=$1
  cd "$repo"
  configure_commit_fence_runner
  configure_plan_commit_fence_context
  configure_commit_lifecycle_path_shim "$repo" plan-post-wait-pgid-probe post-wait-pgid-probe
  POST_WAIT_PGID_EVENT_LOG="$repo/.git/plan-post-wait-pgid-probe-events.log"
  export POST_WAIT_PGID_EVENT_LOG
  install_post_wait_pgid_probe_wrappers
  source "$TMP_ROOT/impl-plan-commit-fence.sh"
  implementation_plan_commit_fence
)

install_commit_fence_outer_signal_git_shim() {
  COMMIT_FENCE_OUTER_SIGNAL_BIN="$(mktemp -d "$TMP_ROOT/commit-fence-outer-signal.XXXXXX")" || return 1
  COMMIT_FENCE_OUTER_SIGNAL_REAL_GIT="$(type -P git)" || return 1
  export COMMIT_FENCE_OUTER_SIGNAL_REAL_GIT
  cat > "$COMMIT_FENCE_OUTER_SIGNAL_BIN/git" <<'EOF'
#!/bin/bash
if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
  ref=
  new_oid=
  old_oid=
  while IFS= read -r line; do
    case "$line" in
      start) printf 'start: ok\n' ;;
      'option no-deref') ;;
      update\ *) set -- $line; ref=$2; new_oid=$3; old_oid=$4 ;;
      prepare) printf 'prepare: ok\n' ;;
      commit)
        test -n "$ref" && test -n "$new_oid" && test -n "$old_oid" || exit 98
        printf 'start\noption no-deref\nupdate %s %s %s\nprepare\ncommit\n' "$ref" "$new_oid" "$old_oid" |
          "$COMMIT_FENCE_OUTER_SIGNAL_REAL_GIT" update-ref --stdin >/dev/null || exit 98
        if test ! -e "$COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE"; then
          : > "$COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE" || exit 98
          printf 'exact-new\n' > "$COMMIT_FENCE_OUTER_SIGNAL_MARKER" || exit 98
        fi
        printf 'commit: ok\n'
        exit 0
        ;;
      *) exit 98 ;;
    esac
  done
  exit 98
fi

if test -e "$COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE" && test ! -e "$COMMIT_FENCE_OUTER_SIGNAL_VERIFICATION_STATE" && test "${1:-}" = branch && test "${2:-}" = --show-current; then
  : > "$COMMIT_FENCE_OUTER_SIGNAL_VERIFICATION_STATE" || exit 98
  printf 'verification-blocked\n' > "$COMMIT_FENCE_OUTER_SIGNAL_MARKER" || exit 98
  while :; do /bin/sleep 1; done
fi

exec "$COMMIT_FENCE_OUTER_SIGNAL_REAL_GIT" "$@"
EOF
  chmod 700 "$COMMIT_FENCE_OUTER_SIGNAL_BIN/git"
}

run_commit_fence_outer_signal_window() {
  local kind=$1 repo=$2
  cd "$repo" || exit 1
  configure_commit_fence_runner
  PATH="$COMMIT_FENCE_OUTER_SIGNAL_BIN:$REAL_PATH"
  export PATH COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE COMMIT_FENCE_OUTER_SIGNAL_MARKER COMMIT_FENCE_OUTER_SIGNAL_VERIFICATION_STATE
  case "$kind" in
    stage)
      configure_stage_commit_fence_context src/stage-output.txt
      source "$TMP_ROOT/stage-commit-fence.sh"
      stage_commit_fence
      ;;
    plan)
      configure_plan_commit_fence_context
      source "$TMP_ROOT/impl-plan-commit-fence.sh"
      implementation_plan_commit_fence
      ;;
    *) exit 1 ;;
  esac
}

run_commit_fence_outer_exit_window() (
  local kind=$1 repo=$2
  commit_fence_outer_exit() {
    trap - EXIT
    run_commit_fence_outer_signal_window "$kind" "$repo"
  }
  trap commit_fence_outer_exit EXIT
  exit 1
)

assert_plan_rollback_rejects_bare_unconditional_update() {
  local plan_fence="$TMP_ROOT/impl-plan-commit-fence.sh"
  assert_contains "$plan_fence" 'plan_rollback_commit_fence() {'
  assert_contains "$plan_fence" 'plan_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID" || exit 1'
  assert_absent "$plan_fence" 'git update-ref "$BRANCH_REF" "$PARENT_COMMIT"'
}

assert_commit_fence_outer_signal_case() {
  local kind=$1 signal=$2 ref_state=$3 runner=${4:-run_commit_fence_outer_signal_window} check_transaction_directories=${5:-0} repo parent_oid third_oid= target_ref= marker forward_state verification_state output_file
  local outer_pid= outer_pgid= parent_pgid= status=0 marker_line outer_waited=0 forward_oid= transaction_parent transaction_dirs_before case_token
  commit_fence_outer_signal_cleanup() {
    if test "$outer_waited" = 0 && test -n "${outer_pgid:-}"; then
      kill -TERM -- "-$outer_pgid" 2>/dev/null || :
      if wait "$outer_pid"; then :; else :; fi
      outer_waited=1
    fi
  }
  trap commit_fence_outer_signal_cleanup RETURN
  case_token="$kind-outer-signal-$signal-$ref_state-$$-${RANDOM:-0}"
  repo="$(new_commit_fence_canary_repo "$case_token")"
  case "$kind" in
    stage) setup_stage_fence_inputs "$repo" ;;
    plan) setup_impl_plan_fence_input "$repo" ;;
    *) fail "unknown commit fence outer signal kind $kind" ;;
  esac
  transaction_parent="$(commit_fence_tmpdir "$repo")"
  transaction_dirs_before="$(transaction_directory_identity_set "$transaction_parent")"
  parent_oid="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)" || fail "$kind outer-signal could not read parent"
  if test "$ref_state" = competing-direct; then
    third_oid="$(make_third_party_oid "$repo")" || fail "$kind outer-signal could not create competing OID"
  fi
  marker="$TMP_ROOT/$case_token.marker"
  forward_state="$TMP_ROOT/$case_token.forward"
  verification_state="$TMP_ROOT/$case_token.verification"
  output_file="$TMP_ROOT/$case_token.log"
  mkfifo "$marker" || fail "$kind outer-signal could not create marker"
  COMMIT_FENCE_OUTER_SIGNAL_MARKER=$marker
  COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE=$forward_state
  COMMIT_FENCE_OUTER_SIGNAL_VERIFICATION_STATE=$verification_state
  export COMMIT_FENCE_OUTER_SIGNAL_MARKER COMMIT_FENCE_OUTER_SIGNAL_FORWARD_STATE COMMIT_FENCE_OUTER_SIGNAL_VERIFICATION_STATE
  parent_pgid="$(ps -p "$$" -o pgid= | tr -d '[:space:]')" || fail "$kind outer-signal parent PGID was unreadable"
  set -m
  {
    "$runner" "$kind" "$repo"
  } > "$output_file" 2>&1 &
  outer_pid=$!
  set +m
  outer_pgid="$(ps -p "$outer_pid" -o pgid= | tr -d '[:space:]')" || fail "$kind outer-signal PGID was unreadable"
  test "$outer_pid" = "$outer_pgid" || fail "$kind outer-signal target did not lead its process group"
  test "$outer_pgid" != "$parent_pgid" || fail "$kind outer-signal target shared the parent process group"
  IFS= read -r marker_line < "$marker" || fail "$kind outer-signal exact-new marker was not delivered"
  test "$marker_line" = exact-new || fail "$kind outer-signal exact-new marker was malformed"
  forward_oid="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)" || fail "$kind outer-signal forward ref was unreadable"
  test "$forward_oid" != "$parent_oid" || fail "$kind outer-signal marker preceded the real forward update"
  assert_direct_ref_oid "$repo" refs/heads/local/task7 "$forward_oid"
  IFS= read -r marker_line < "$marker" || fail "$kind outer-signal verification blocker was not delivered"
  test "$marker_line" = verification-blocked || fail "$kind outer-signal verification blocker was malformed"
  case "$ref_state" in
    exact-new) ;;
    competing-direct)
      GIT_MASTER=1 git -C "$repo" update-ref refs/heads/local/task7 "$third_oid" "$forward_oid" || fail "$kind outer-signal could not install competing direct ref"
      ;;
    symbolic)
      target_ref=refs/heads/outer-signal-competing
      GIT_MASTER=1 git -C "$repo" update-ref "$target_ref" "$parent_oid" || fail "$kind outer-signal could not create symbolic target"
      GIT_MASTER=1 git -C "$repo" symbolic-ref refs/heads/local/task7 "$target_ref" || fail "$kind outer-signal could not install symbolic competitor"
      ;;
    *) fail "unknown commit fence outer signal ref state $ref_state" ;;
  esac
  kill -"$signal" -- "-$outer_pgid" || fail "$kind outer-signal group $signal failed"
  if wait "$outer_pid"; then status=0; else status=$?; fi
  outer_waited=1
  test "$status" != 0 || fail "$kind outer-signal $signal canary unexpectedly succeeded"
  if test "$check_transaction_directories" = 1; then
    assert_transaction_directory_identity_set "$transaction_parent" "$transaction_dirs_before" "$kind outer-EXIT $signal rollback"
  fi
  case "$ref_state" in
    exact-new)
      if GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet refs/heads/local/task7 >/dev/null; then
        fail "$kind outer-signal exact-new $signal changed the branch to a symbolic ref"
      fi
      test "$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' refs/heads/local/task7)" = "$parent_oid" || fail "$kind outer-signal exact-new $signal did not roll back to parent"
      ;;
    competing-direct)
      assert_direct_ref_oid "$repo" refs/heads/local/task7 "$third_oid"
      ;;
    symbolic)
      test "$(GIT_MASTER=1 git -C "$repo" symbolic-ref refs/heads/local/task7)" = "$target_ref" || fail "$kind outer-signal replaced a competing symbolic ref"
      assert_direct_ref_oid "$repo" "$target_ref" "$parent_oid"
      ;;
  esac
  trap - RETURN
}

assert_commit_fence_outer_signal_matrix() {
  local kind signal
  install_commit_fence_outer_signal_git_shim || fail 'could not install commit fence outer-signal shim'
  for kind in stage plan; do
    assert_commit_fence_outer_signal_case "$kind" TERM competing-direct
    assert_commit_fence_outer_signal_case "$kind" TERM symbolic
  done
}

WATCHDOG_TICKS=60
WATCHDOG_TICK_SECONDS=0.05
WATCHDOG_RESULT=
WATCHDOG_STATUS=
WATCHDOG_ELAPSED_MS=

run_portable_watchdog() {
  local output_file=$1 attempt child_status monitor_was_enabled=0 completion_dir completion_tmp completion_record record_pid record_status
  shift
  completion_dir="$(mktemp -d "$TMP_ROOT/portable-watchdog.XXXXXX")" || fail 'portable watchdog could not create completion directory'
  completion_tmp="$completion_dir/completion.tmp"
  completion_record="$completion_dir/completion"
  WATCHDOG_COMPLETE=0
  watchdog_completion_signal() { WATCHDOG_COMPLETE=1; }
  trap watchdog_completion_signal USR1
  case "$-" in *m*) monitor_was_enabled=1 ;; esac
  set -m
  (
    runner_pid="$(/bin/sh -c 'printf "%s\n" "$PPID"')" || exit 125
    "$@" > "$output_file" 2>&1
    child_status=$?
    printf '%s %s\n' "$runner_pid" "$child_status" > "$completion_tmp" || exit 125
    mv "$completion_tmp" "$completion_record" || exit 125
    kill -USR1 "$$" || exit 125
    exit "$child_status"
  ) &
  WATCHDOG_PID=$!
  if test "$monitor_was_enabled" = 0; then set +m; fi
  WATCHDOG_PGID="$(ps -p "$WATCHDOG_PID" -o pgid= 2>/dev/null | tr -d '[:space:]' || :)"
  WATCHDOG_PARENT_PGID="$(ps -p "$$" -o pgid= 2>/dev/null | tr -d '[:space:]' || :)"
  case "$WATCHDOG_PID:$WATCHDOG_PGID:$WATCHDOG_PARENT_PGID" in
    *[!0-9:]*|:*|*:|*::*) fail 'portable watchdog could not observe numeric runner and parent PGIDs' ;;
  esac
  test "$WATCHDOG_PGID" = "$WATCHDOG_PID" || fail 'portable watchdog could not isolate its runner PGID'
  test "$WATCHDOG_PGID" != "$WATCHDOG_PARENT_PGID" || fail 'portable watchdog runner PGID overlaps its parent'
  attempt=0
  while test "$WATCHDOG_COMPLETE" = 0; do
    if test "$attempt" -ge "$WATCHDOG_TICKS"; then
      kill -TERM -- "-$WATCHDOG_PGID" 2>/dev/null || :
      /bin/sleep "$WATCHDOG_TICK_SECONDS"
      kill -KILL -- "-$WATCHDOG_PGID" 2>/dev/null || :
       wait "$WATCHDOG_PID" 2>/dev/null || :
       trap - USR1
       rm -rf -- "$completion_dir"
      WATCHDOG_RESULT=timed_out
      WATCHDOG_STATUS=124
      WATCHDOG_ELAPSED_MS=$((attempt * 50))
      return 124
    fi
    /bin/sleep "$WATCHDOG_TICK_SECONDS"
    attempt=$((attempt + 1))
  done
  test -f "$completion_record" || fail 'portable watchdog completion signal lacked an owned record'
  if IFS=' ' read -r record_pid record_status < "$completion_record"; then :; else fail 'portable watchdog completion record was unreadable'; fi
  test "$record_pid" = "$WATCHDOG_PID" || fail 'portable watchdog completion record PID mismatched runner'
  case "$record_status" in ''|*[!0-9]*) fail 'portable watchdog completion record status was malformed' ;; esac
  if wait "$WATCHDOG_PID"; then
    child_status=0
  else
    child_status=$?
  fi
  WATCHDOG_RESULT=returned
  WATCHDOG_STATUS=$child_status
  WATCHDOG_ELAPSED_MS=$((attempt * 50))
  test "$child_status" = "$record_status" || fail 'portable watchdog wait status mismatched completion record'
  trap - USR1
  rm -rf -- "$completion_dir"
  return "$child_status"
}

run_portable_watchdog_timeout_canary() {
  local child_token=$1
  /bin/bash -c 'while :; do /bin/sleep 1; done' "$child_token" &
  printf '%s\n' "$!"
  while :; do /bin/sleep 1; done
}

run_portable_watchdog_immediate_success() { return 0; }
run_portable_watchdog_immediate_failure() { return 23; }
run_portable_watchdog_output_then_exit() { printf 'watchdog output\n'; return 0; }

assert_portable_watchdog_completion_canaries() {
  local output_file="$TMP_ROOT/portable-watchdog-completion.log"
  run_portable_watchdog "$output_file" run_portable_watchdog_immediate_success || fail 'portable watchdog immediate success did not return zero'
  test "$WATCHDOG_RESULT" = returned && test "$WATCHDOG_STATUS" = 0 || fail 'portable watchdog immediate success was not recorded'
  if run_portable_watchdog "$output_file" run_portable_watchdog_immediate_failure; then fail 'portable watchdog immediate failure returned zero'; fi
  test "$WATCHDOG_RESULT" = returned && test "$WATCHDOG_STATUS" = 23 || fail 'portable watchdog immediate failure status changed'
  run_portable_watchdog "$output_file" run_portable_watchdog_output_then_exit || fail 'portable watchdog output runner failed'
  test "$(< "$output_file")" = 'watchdog output' || fail 'portable watchdog output runner lost output'
}

assert_portable_watchdog_timeout_reaps_runner_group() {
  local child_token="gpuwatcher-watchdog-$$-$RANDOM" output_file="$TMP_ROOT/portable-watchdog-timeout.log" child_pid pid_line_count process_state attempt=0
  if run_portable_watchdog "$output_file" run_portable_watchdog_timeout_canary "$child_token"; then
    fail 'portable watchdog timeout canary unexpectedly returned'
  fi
  test "$WATCHDOG_RESULT" = timed_out || fail 'portable watchdog timeout canary did not time out'
  test "$WATCHDOG_STATUS" = 124 || fail 'portable watchdog timeout canary returned the wrong status'
  test -s "$output_file" || fail 'portable watchdog timeout canary did not record its child'
  pid_line_count="$(LC_ALL=C wc -l < "$output_file" | tr -d '[:space:]')"
  child_pid="$(cat "$output_file")"
  test "$pid_line_count" = 1 || fail 'portable watchdog timeout canary recorded a malformed child PID file'
  case "$child_pid" in ''|0|0[0-9]*|*[!0-9]*) fail 'portable watchdog timeout canary recorded a malformed child PID' ;; esac
  while test "$attempt" -lt 10; do
    process_state="$(ps -p "$child_pid" -o pid=,ppid=,pgid=,state=,command= 2>/dev/null || :)"
    test -z "$process_state" && break
    /bin/sleep "$WATCHDOG_TICK_SECONDS"
    attempt=$((attempt + 1))
  done
  test -z "$process_state" || fail "portable watchdog timeout left runner-group child $process_state"
}

assert_peer_failure_returns_within_bound() {
  local runner=$1 repo=$2 label=$3 output_file before after saved_watchdog_ticks
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  output_file="$TMP_ROOT/${label// /-}.log"
  saved_watchdog_ticks=$WATCHDOG_TICKS
  case "$label" in
    *'peer failure cleanup') WATCHDOG_TICKS=60 ;;
    *'cleanup hold') WATCHDOG_TICKS=60 ;;
  esac
  if run_portable_watchdog "$output_file" "$runner" "$repo"; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    fail "$label unexpectedly succeeded"
  fi
  after="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  test "$after" = "$before" || fail "$label advanced the branch"
  if test "$WATCHDOG_RESULT" = timed_out; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  WATCHDOG_TICKS=$saved_watchdog_ticks
  test "$WATCHDOG_STATUS" != 0 || fail "$label returned zero after its peer failed"
}

LIFECYCLE_CANARY_GAPS=

record_lifecycle_canary_gap() {
  if test -n "$LIFECYCLE_CANARY_GAPS"; then
    LIFECYCLE_CANARY_GAPS="$LIFECYCLE_CANARY_GAPS; "
  fi
  LIFECYCLE_CANARY_GAPS="${LIFECYCLE_CANARY_GAPS}$1"
}

assert_committed_transport_failure_is_rolled_back() {
  local runner=$1 repo=$2 label=$3 before after after_parent output_file lifecycle_log saved_watchdog_ticks
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
  lifecycle_log="$repo/.git/${label}.log"
  output_file="$TMP_ROOT/${label}.log"
  saved_watchdog_ticks=$WATCHDOG_TICKS
  WATCHDOG_TICKS=60
  if run_portable_watchdog "$output_file" "$runner" "$repo"; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    record_lifecycle_canary_gap "$label returned zero after committed transport failure"
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  WATCHDOG_TICKS=$saved_watchdog_ticks
  if test "$WATCHDOG_STATUS" = 0; then
    record_lifecycle_canary_gap "$label concealed its nonzero transport failure"
  fi
  if ! grep -F -- "advanced ref=refs/heads/local/task7 old=$before " "$lifecycle_log" >/dev/null 2>&1; then
    record_lifecycle_canary_gap "$label did not apply the exact old-to-new transaction"
  fi
  case "$label" in
    *cleanup-failure)
      grep -F -- 'cleanup blocker=' "$lifecycle_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label did not fail owned transport cleanup after commit"
      ;;
    *then-signal)
      grep -F -- 'self-signal=TERM pid=' "$lifecycle_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label did not signal only its immediate transaction shell"
      ;;
  esac
  if symbolic_ref_exists "$repo" refs/heads/local/task7; then
    record_lifecycle_canary_gap "$label replaced the direct task ref with a symbolic ref"
    return 0
  fi
  after="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
  if test "$after" = "$before"; then
    return 0
  fi
  after_parent="$(GIT_MASTER=1 git -C "$repo" rev-parse "$after^" 2>/dev/null || :)"
  if test "$after_parent" != "$before"; then
    record_lifecycle_canary_gap "$label replaced the branch with non-transaction state"
    return 0
  fi
  record_lifecycle_canary_gap "$label left exact-created $after after its committed transport failure"
}

assert_committed_transport_failure_preserves_symbolic_competitor() {
  local runner=$1 repo=$2 label=$3 parent output_file lifecycle_log saved_watchdog_ticks
  parent="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
  GIT_MASTER=1 git -C "$repo" update-ref refs/heads/lifecycle-competing "$parent"
  lifecycle_log="$repo/.git/${label}.log"
  output_file="$TMP_ROOT/${label}-symbolic.log"
  saved_watchdog_ticks=$WATCHDOG_TICKS
  WATCHDOG_TICKS=60
  if run_portable_watchdog "$output_file" "$runner" "$repo" symbolic; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    record_lifecycle_canary_gap "$label symbolic competitor returned zero after committed transport failure"
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    fail "$label symbolic competitor exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  WATCHDOG_TICKS=$saved_watchdog_ticks
  test "$WATCHDOG_STATUS" != 0 || record_lifecycle_canary_gap "$label symbolic competitor concealed its transport failure"
  grep -F -- "advanced ref=refs/heads/local/task7 old=$parent " "$lifecycle_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label symbolic competitor did not first advance the exact transaction"
  grep -F -- 'symbolic target=refs/heads/lifecycle-competing' "$lifecycle_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label did not install its symbolic competitor"
  if ! symbolic_ref_exists "$repo" refs/heads/local/task7; then
    record_lifecycle_canary_gap "$label overwrote its symbolic competitor"
    return 0
  fi
  test "$(GIT_MASTER=1 git -C "$repo" symbolic-ref refs/heads/local/task7)" = refs/heads/lifecycle-competing || record_lifecycle_canary_gap "$label changed the symbolic competitor target"
  assert_direct_ref_oid "$repo" refs/heads/lifecycle-competing "$parent" || record_lifecycle_canary_gap "$label changed the competing direct ref"
}

assert_post_wait_pgid_probe_is_absent() {
  local runner=$1 repo=$2 label=$3 output_file event_log lifecycle_log
  output_file="$TMP_ROOT/${label}.log"
  event_log="$repo/.git/${label}-events.log"
  lifecycle_log="$repo/.git/${label}.log"
  if ! run_portable_watchdog "$output_file" "$runner" "$repo"; then
    if test "$WATCHDOG_RESULT" = timed_out; then
      fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
    fi
    record_lifecycle_canary_gap "$label did not complete its successful transaction"
    return 0
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  grep -F -- 'leader=' "$lifecycle_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label did not record its transaction leader"
  grep -F -- 'waited leader=' "$event_log" >/dev/null 2>&1 || record_lifecycle_canary_gap "$label did not wait for its recorded leader"
  if grep -F -- 'post-wait negative-pgid kill ' "$event_log" >/dev/null 2>&1; then
    record_lifecycle_canary_gap "$label probed or signalled a negative PGID after wait"
  fi
  assert_successful_commit_fence_cleanup "$repo" "$label"
}

PATH_SHIM_FENCE_GAPS=

record_path_shim_fence_gap() {
  if test -n "$PATH_SHIM_FENCE_GAPS"; then
    PATH_SHIM_FENCE_GAPS="$PATH_SHIM_FENCE_GAPS; "
  fi
  PATH_SHIM_FENCE_GAPS="${PATH_SHIM_FENCE_GAPS}$1"
}

assert_path_shim_runner_rejects_without_commit() {
  local runner=$1 repo=$2 label=$3 gap_recorder=${4:-record_path_shim_fence_gap} before after
  if test "$#" -gt 3; then
    shift 4
  else
    shift 3
  fi
  before="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  if "$runner" "$repo" "$@" >/dev/null 2>&1; then
    "$gap_recorder" "$label unexpectedly succeeded"
  fi
  after="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  test "$after" = "$before" || "$gap_recorder" "$label advanced the branch"
}

assert_path_shim_orphan_child_is_reaped() {
  local runner=$1 repo=$2 process_log=$3 pid_file=$4 label=$5 gap_recorder child_pid process_state child_token process_identity pid_line_count
  if test "$#" -gt 5; then
    gap_recorder=$6
    shift 6
  else
    gap_recorder=record_path_shim_fence_gap
    shift 5
  fi
  child_token="gpuwatcher-path-shim-$$-$RANDOM"
  GIT_SHIM_CHILD_TOKEN=$child_token
  export GIT_SHIM_CHILD_TOKEN
  assert_path_shim_runner_rejects_without_commit "$runner" "$repo" "$label" "$gap_recorder" "$@"
  if test ! -s "$process_log"; then
    "$gap_recorder" "$label did not execute the PATH shim"
  elif ! grep -F -- "child_token=$child_token" "$process_log" >/dev/null 2>&1; then
    "$gap_recorder" "$label did not record its harness child token"
  fi
  if test ! -s "$pid_file"; then
    "$gap_recorder" "$label did not record its external child"
    return 0
  fi
  pid_line_count="$(LC_ALL=C wc -l < "$pid_file" | tr -d '[:space:]')"
  child_pid="$(cat "$pid_file")"
  if test "$pid_line_count" != 1; then
    "$gap_recorder" "$label recorded a malformed external child PID file"
    return 0
  fi
  case "$child_pid" in ''|0|0[0-9]*|*[!0-9]*)
    "$gap_recorder" "$label recorded a malformed external child PID"
    return 0
    ;;
  esac
  process_state="$(ps -p "$child_pid" -o pid=,ppid=,pgid=,state=,command= 2>/dev/null || :)"
  if test -n "$process_state"; then
    case "$process_state" in *"$child_token"*) process_identity=token-matched ;; *) process_identity=token-missing ;; esac
    "$gap_recorder" "$label left reported external child pid=$child_pid identity=$process_identity snapshot=$process_state"
  fi
}

assert_path_shim_transaction_directory_is_owned() {
  local runner=$1 repo=$2 replaced_dir_file=$3 label=$4 replaced_dir replacement_dir transaction_parent reported_parent replaced_basename transaction_nonce expected_replaced_dir path_line_count
  assert_path_shim_runner_rejects_without_commit "$runner" "$repo" "$label"
  if test ! -s "$replaced_dir_file"; then
    record_path_shim_fence_gap "$label did not replace the transaction directory"
    return 0
  fi
  transaction_parent="$(commit_fence_tmpdir "$repo")"
  if test ! -d "$transaction_parent" || test -L "$transaction_parent"; then
    record_path_shim_fence_gap "$label lost its trusted transaction parent"
    return 0
  fi
  path_line_count="$(LC_ALL=C wc -l < "$replaced_dir_file" | tr -d '[:space:]')"
  replaced_dir="$(cat "$replaced_dir_file")"
  if test "$path_line_count" != 1; then
    record_path_shim_fence_gap "$label recorded a malformed replacement path file"
    return 0
  fi
  reported_parent="${replaced_dir%/*}"
  replaced_basename="${replaced_dir##*/}"
  if test "$reported_parent" != "$transaction_parent"; then
    record_path_shim_fence_gap "$label reported a replacement outside its trusted transaction parent"
    return 0
  fi
  case "$replaced_basename" in gpuwatcher-ref-transaction.*.replaced) ;; *)
    record_path_shim_fence_gap "$label reported an unexpected replacement basename"
    return 0
    ;;
  esac
  transaction_nonce="${replaced_basename#gpuwatcher-ref-transaction.}"
  transaction_nonce="${transaction_nonce%.replaced}"
  case "$transaction_nonce" in ''|*[!A-Za-z0-9]*)
    record_path_shim_fence_gap "$label reported an invalid replacement nonce"
    return 0
    ;;
  esac
  expected_replaced_dir="$transaction_parent/gpuwatcher-ref-transaction.$transaction_nonce.replaced"
  replacement_dir="$transaction_parent/gpuwatcher-ref-transaction.$transaction_nonce"
  test "$replaced_dir" = "$expected_replaced_dir" || { record_path_shim_fence_gap "$label reported a non-canonical replacement path"; return 0; }
  test -d "$expected_replaced_dir" && test ! -L "$expected_replaced_dir" || record_path_shim_fence_gap "$label did not preserve the moved owned directory"
  test -d "$replacement_dir" && test ! -L "$replacement_dir" || record_path_shim_fence_gap "$label deleted the hostile replacement directory"
}

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
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  export SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-root-claim.sh"
  source "$TMP_ROOT/snapshot-root-restore.sh"
  source "$TMP_ROOT/snapshot-claimed-restore.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/snapshot-cleanup.sh"
  cleanup_snapshot_root
)

run_step3_snapshot_cleanup() (
  SNAPSHOT_ROOT=$1
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  export SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  source "$TMP_ROOT/snapshot-step3-member.sh"
  source "$TMP_ROOT/snapshot-step3-root-claim.sh"
  source "$TMP_ROOT/snapshot-step3-root-restore.sh"
  source "$TMP_ROOT/snapshot-step3-claimed-restore.sh"
  source "$TMP_ROOT/snapshot-step3-membership.sh"
  source "$TMP_ROOT/snapshot-step3-cleanup.sh"
  cleanup_snapshot_root
)

run_snapshot_cleanup_with_member_swap() (
  local root=$1 variant=$2 first_artifact second_artifact
  SNAPSHOT_ROOT=$root
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  first_artifact=${SNAPSHOT_ARTIFACTS%% *}
  set -- $SNAPSHOT_ARTIFACTS
  second_artifact=$2
  export SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  case "$variant" in *step3*)
    source "$TMP_ROOT/snapshot-step3-member.sh"; source "$TMP_ROOT/snapshot-step3-root-claim.sh"; source "$TMP_ROOT/snapshot-step3-root-restore.sh"; source "$TMP_ROOT/snapshot-step3-claimed-restore.sh"; source "$TMP_ROOT/snapshot-step3-membership.sh"; source "$TMP_ROOT/snapshot-step3-cleanup.sh"
  ;; *)
    source "$TMP_ROOT/snapshot-member.sh"; source "$TMP_ROOT/snapshot-root-claim.sh"; source "$TMP_ROOT/snapshot-root-restore.sh"; source "$TMP_ROOT/snapshot-claimed-restore.sh"; source "$TMP_ROOT/snapshot-present-membership.sh"; source "$TMP_ROOT/snapshot-membership.sh"; source "$TMP_ROOT/snapshot-remove-members.sh"; source "$TMP_ROOT/snapshot-cleanup.sh"
  ;; esac
  mv() {
    if test "$1" = --; then shift; fi
    if case "$variant" in preclaim*) true ;; *) false ;; esac && test "$1" = "$SNAPSHOT_ROOT" && case "$2" in "$SNAPSHOT_ROOT".cleanup.*) true ;; *) false ;; esac; then
      command mv -- "$SNAPSHOT_ROOT/$first_artifact" "$SNAPSHOT_ROOT/$first_artifact.original" || return 1
      printf replacement > "$SNAPSHOT_ROOT/$first_artifact" || return 1
      chmod 600 "$SNAPSHOT_ROOT/$first_artifact" || return 1
    fi
    if ! case "$variant" in partial*|restorefail*) true ;; *) false ;; esac && test "$1" = "$SNAPSHOT_ROOT/$first_artifact" && case "$2" in "$SNAPSHOT_ROOT/$first_artifact".cleanup.*) true ;; *) false ;; esac; then
      command mv -- "$1" "$1.original" || return 1
      printf replacement > "$1" || return 1
      chmod 600 "$1" || return 1
    fi
    if case "$variant" in partial*|restorefail*) true ;; *) false ;; esac && test "$1" = "$SNAPSHOT_ROOT/$second_artifact" && case "$2" in "$SNAPSHOT_ROOT/$second_artifact".cleanup.*) true ;; *) false ;; esac; then
      if case "$variant" in restorefail*) true ;; *) false ;; esac; then
        printf competitor > "$SNAPSHOT_ROOT/$first_artifact" || return 1
        chmod 600 "$SNAPSHOT_ROOT/$first_artifact" || return 1
      fi
      command mv -- "$1" "$1.original" || return 1
      printf replacement > "$1" || return 1
      chmod 600 "$1" || return 1
    fi
    command mv -- "$@"
  }
  cleanup_snapshot_root
)

run_failure_cleanup() (
  ROOT=$1
  SNAPSHOT_ROOT=$ROOT
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  export ROOT SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  valid_root() { test "$1" = "$ROOT"; }
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-root-claim.sh"
  source "$TMP_ROOT/snapshot-root-restore.sh"
  source "$TMP_ROOT/snapshot-claimed-restore.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/failure-cleanup-root.sh"
  cleanup_root "$ROOT"
)

EXTERNAL_ARCHIVE_FENCE_GAPS=

record_external_archive_fence_gap() {
  if test -n "$EXTERNAL_ARCHIVE_FENCE_GAPS"; then
    EXTERNAL_ARCHIVE_FENCE_GAPS="$EXTERNAL_ARCHIVE_FENCE_GAPS; "
  fi
  EXTERNAL_ARCHIVE_FENCE_GAPS="${EXTERNAL_ARCHIVE_FENCE_GAPS}$1"
}

extract_external_archive_contract() {
  local function_name=$1 target_file=$2
  if extract_function "$EXTERNAL_SKILL" "$function_name" 1 "$target_file"; then
    return 0
  fi
  rm -f -- "$target_file"
  record_external_archive_fence_gap "missing external-pr-review contract $function_name"
  return 1
}

assert_external_archive_contract_text() {
  local required_text=$1 label=$2
  grep -F -- "$required_text" "$EXTERNAL_SKILL" >/dev/null || record_external_archive_fence_gap "$label"
}

assert_external_archive_contract_absent() {
  local forbidden_text=$1 label=$2
  if grep -F -- "$forbidden_text" "$EXTERNAL_SKILL" >/dev/null; then
    record_external_archive_fence_gap "$label"
  fi
}

install_snapshot_swap_barrier() {
  SNAPSHOT_SWAP_ROOT=$1
  SNAPSHOT_SWAP_TRIGGER=$2
  SNAPSHOT_SWAP_CALLS=0
  validate_present_snapshot_membership() {
    local artifact present_count
    present_count=0
    for artifact in $SNAPSHOT_ARTIFACTS; do
      if test -e "$SNAPSHOT_ROOT/$artifact" || test -L "$SNAPSHOT_ROOT/$artifact"; then
        validate_snapshot_member "$artifact" || return 1
        present_count=$((present_count + 1))
      fi
    done
    test "$(find "$SNAPSHOT_ROOT" -mindepth 1 -maxdepth 1 -print | LC_ALL=C wc -l | tr -d '[:space:]')" = "$present_count" || return 1
    SNAPSHOT_SWAP_CALLS=$((SNAPSHOT_SWAP_CALLS + 1))
    if test "$SNAPSHOT_SWAP_CALLS" = "$SNAPSHOT_SWAP_TRIGGER"; then
      SNAPSHOT_SWAP_ROOT=$SNAPSHOT_ROOT
      SNAPSHOT_ORIGINAL_ID="$(stat -f '%d:%i' "$SNAPSHOT_SWAP_ROOT")" || return 1
      mv "$SNAPSHOT_SWAP_ROOT" "$SNAPSHOT_SWAP_ROOT.moved" || return 1
      mkdir "$SNAPSHOT_SWAP_ROOT" || return 1
      chmod 700 "$SNAPSHOT_SWAP_ROOT" || return 1
      for artifact in $SNAPSHOT_ARTIFACTS; do printf 'replacement %s\n' "$artifact" > "$SNAPSHOT_SWAP_ROOT/$artifact" || return 1; chmod 600 "$SNAPSHOT_SWAP_ROOT/$artifact" || return 1; done
      printf 'replacement sentinel\n' > "$SNAPSHOT_SWAP_ROOT/sentinel" || return 1
      chmod 600 "$SNAPSHOT_SWAP_ROOT/sentinel" || return 1
      SNAPSHOT_REPLACEMENT_ID="$(stat -f '%d:%i' "$SNAPSHOT_SWAP_ROOT")" || return 1
      test "$SNAPSHOT_ORIGINAL_ID" != "$SNAPSHOT_REPLACEMENT_ID" || return 1
    fi
  }
}

run_snapshot_cleanup_with_swap() (
  local root=$1
  SNAPSHOT_ROOT=$root
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  export SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-root-claim.sh"
  source "$TMP_ROOT/snapshot-root-restore.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/snapshot-cleanup.sh"
  install_snapshot_swap_barrier "$root" 1
  cleanup_snapshot_root
)

run_failure_cleanup_with_swap() (
  local root=$1
  ROOT=$root
  SNAPSHOT_ROOT=$root
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$SNAPSHOT_ROOT")"
  CURRENT_UID="$(id -u)"
  export ROOT SNAPSHOT_ROOT CURRENT_UID SNAPSHOT_ARTIFACTS
  valid_root() { test "$1" = "$ROOT"; }
  source "$TMP_ROOT/snapshot-member.sh"
  source "$TMP_ROOT/snapshot-root-claim.sh"
  source "$TMP_ROOT/snapshot-root-restore.sh"
  source "$TMP_ROOT/snapshot-present-membership.sh"
  source "$TMP_ROOT/snapshot-remove-members.sh"
  source "$TMP_ROOT/failure-cleanup-root.sh"
  install_snapshot_swap_barrier "$root" 1
  cleanup_root "$root"
)

assert_snapshot_swap_is_rejected() {
  local runner=$1 root=$2 label=$3 output_file claimed_root candidate
  output_file="$TMP_ROOT/${label// /-}.log"
  if run_portable_watchdog "$output_file" "$runner" "$root"; then
    record_external_archive_fence_gap "$label accepted a snapshot-root replacement"
  fi
  test "$WATCHDOG_RESULT" != timed_out || record_external_archive_fence_gap "$label exceeded the portable watchdog"
  claimed_root=
  for candidate in "$root".cleanup.*; do
    if test -d "$candidate"; then claimed_root=$candidate; break; fi
  done
  test -n "$claimed_root" || record_external_archive_fence_gap "$label did not preserve its claimed root"
  test -f "$claimed_root/sentinel" || record_external_archive_fence_gap "$label removed the replacement sentinel"
  test -f "$claimed_root.moved/before.repository.json" || record_external_archive_fence_gap "$label removed original snapshot data"
  test -f "$claimed_root/before.repository.json" || record_external_archive_fence_gap "$label deleted a validated replacement member"
  rm -rf -- "$root" "$root".cleanup.*
}

run_archive_rollback_with_destination_drift() (
  local repo=$1 source_path=review.md destination_path=archives/review.md pre_source_tree
  cd "$repo"
  REPO_ROOT=$repo
  ARCHIVE=archives
  ARCHIVE_BRANCH_REF="$(GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet HEAD)" || exit 1
  PARENT_OID="$(GIT_MASTER=1 git -C "$repo" rev-parse "$ARCHIVE_BRANCH_REF")" || exit 1
  HEAD_COMMIT="$(make_archive_publish_oid "$repo")" || exit 1
  COMMIT_SUCCEEDED=0
  ARCHIVE_CREATED=0
  SOURCES=("$source_path")
  DESTINATIONS=("$destination_path")
  MOVED=(1)
  OWNERSHIP_CAPTURED=(1)
  POST_STAGE_OWNERSHIP=(1)
  POST_STAGE_INDEX_OWNERSHIP=(1)
  CURRENT_DESTINATION_MODES=(644)
  ORIGINAL_MODES=(600)
  INDEX_PATHS=("$source_path" "$destination_path")
  SOURCE_DEVICE_INODES=("$(stat -f '%d:%i' -- "$repo/$destination_path")")
  SOURCE_UIDS=("$(stat -f '%u' -- "$repo/$destination_path")")
  SOURCE_LINKS=("$(stat -f '%l' -- "$repo/$destination_path")")
  SOURCE_SHA256=("$(shasum -a 256 "$repo/$destination_path" | cut -d' ' -f1)")
  SOURCE_BYTES=("$(wc -c < "$repo/$destination_path" | tr -d ' ')")
  SOURCE_STATES=(tracked)
  pre_source_tree="$(GIT_MASTER=1 git -C "$repo" ls-tree HEAD -- "$source_path")" || exit 1
  pre_source_tree="${pre_source_tree/ blob / }"
  PRE_SOURCE_INDEX_ENTRIES=("${pre_source_tree/$'\t'/ 0$'\t'}")
  PRE_DESTINATION_INDEX_ENTRIES=("")
  PRE_SOURCE_INDEX_CAPTURED=(1)
  PRE_DESTINATION_INDEX_CAPTURED=(1)
  OWNED_DESTINATION_SHA256=("$(shasum -a 256 "$repo/$destination_path" | cut -d' ' -f1)")
  OWNED_DESTINATION_BYTES=("$(wc -c < "$repo/$destination_path" | tr -d ' ')")
  OWNED_DESTINATION_MODES=(644)
  OWNED_DESTINATION_LINKS=(1)
  OWNED_DESTINATION_INDEX_ENTRIES=("$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- "$destination_path")")
  OWNED_SOURCE_INDEX_ENTRIES=("")
  REF_ADVANCED=0
  REF_ROLLED_BACK=0
  ROLLBACK_COMPLETED=0
  source "$TMP_ROOT/archive-classify-ref.sh"
  source "$TMP_ROOT/archive-rollback-state.sh"
  source "$TMP_ROOT/archive-reset-owned-index.sh"
  source "$TMP_ROOT/archive-restore-owned-destination.sh"
  source "$TMP_ROOT/archive-rollback.sh"
  rollback_archive
)

setup_archive_rollback_drift_repo() {
  local repo=$1 state=${2:-drift}
  mkdir -p "$repo/archives"
  printf 'approved source\n' > "$repo/review.md"
  chmod 600 "$repo/review.md"
  GIT_MASTER=1 git -C "$repo" add review.md
  commit_canary_index "$repo" archive-rollback-fixture
  mv "$repo/review.md" "$repo/archives/review.md"
  chmod 644 "$repo/archives/review.md"
  GIT_MASTER=1 git -C "$repo" add -A -- review.md archives/review.md
  if test "$state" = drift; then
    printf 'competing destination drift\n' > "$repo/archives/review.md"
    chmod 755 "$repo/archives/review.md"
    GIT_MASTER=1 git -C "$repo" add -- archives/review.md
  fi
}

assert_archive_rollback_preserves_drift() {
  local repo=$1 before_index output_file
  before_index="$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- archives/review.md)"
  output_file="$TMP_ROOT/archive-rollback-drift.log"
  if run_portable_watchdog "$output_file" run_archive_rollback_with_destination_drift "$repo"; then
    record_external_archive_fence_gap 'archive rollback accepted drifted destination ownership'
  fi
  test "$WATCHDOG_RESULT" != timed_out || record_external_archive_fence_gap 'archive rollback drift exceeded the portable watchdog'
  test -f "$repo/archives/review.md" || record_external_archive_fence_gap 'archive rollback moved a competing destination'
  test "$(cat "$repo/archives/review.md" 2>/dev/null || :)" = 'competing destination drift' || record_external_archive_fence_gap 'archive rollback overwrote competing destination content'
  test "$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- archives/review.md)" = "$before_index" || record_external_archive_fence_gap 'archive rollback reset a competing destination index entry'
}

assert_archive_rollback_restores_owned_state() {
  local repo=$1 output_file
  output_file="$TMP_ROOT/archive-rollback-nominal.log"
  if ! run_portable_watchdog "$output_file" run_archive_rollback_with_destination_drift "$repo"; then
    fail 'archive rollback did not restore unchanged owned state'
  fi
  test "$WATCHDOG_RESULT" != timed_out || fail 'archive rollback nominal restoration exceeded the portable watchdog'
  test "$(cat "$repo/review.md")" = 'approved source' || fail 'archive rollback did not restore approved source content'
  test "$(stat -f '%Lp' "$repo/review.md")" = 600 || fail 'archive rollback did not restore approved source mode'
  test ! -e "$repo/archives/review.md" || fail 'archive rollback left owned destination'
  GIT_MASTER=1 git -C "$repo" diff --cached --quiet || fail 'archive rollback did not restore the prior clean index'
}

make_archive_publish_oid() {
  local repo=$1 parent tree
  parent="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)"
  tree="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD^{tree})"
  GIT_AUTHOR_NAME=archive GIT_AUTHOR_EMAIL=archive@example.test GIT_COMMITTER_NAME=archive GIT_COMMITTER_EMAIL=archive@example.test GIT_MASTER=1 git -C "$repo" commit-tree "$tree" -p "$parent" -m archive-publication
}

setup_archive_exact_ref_context() {
  local name=$1
  ARCHIVE_TRANSACTION_REPO="$(new_commit_fence_canary_repo "$name")"
  ARCHIVE_TRANSACTION_REF=refs/heads/local/archive
  GIT_MASTER=1 git -C "$ARCHIVE_TRANSACTION_REPO" branch -M local/archive
  ARCHIVE_TRANSACTION_OLD_OID="$(GIT_MASTER=1 git -C "$ARCHIVE_TRANSACTION_REPO" rev-parse "$ARCHIVE_TRANSACTION_REF")"
  ARCHIVE_TRANSACTION_NEW_OID="$(make_archive_publish_oid "$ARCHIVE_TRANSACTION_REPO")"
  assert_direct_ref_oid "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_REF" "$ARCHIVE_TRANSACTION_OLD_OID"
}

configure_archive_ref_transaction_runner() {
  local repo=$1 mode=$2 post_commit_state=${3:-direct}
  export GIT_MASTER=1
  REPO_ROOT=$repo
  TMPDIR="$(commit_fence_tmpdir "$repo")"
  BRANCH_REF=refs/heads/local/archive
  ARCHIVE_BRANCH_REF=$BRANCH_REF
  GIT_SHIM_LIFECYCLE_ONCE_MARKER="$repo/.git/archive-${mode}-once"
  GIT_SHIM_LABEL="archive-$mode"
  GIT_SHIM_MODE=$mode
  GIT_SHIM_BRANCH_REF=$BRANCH_REF
  export REPO_ROOT TMPDIR BRANCH_REF ARCHIVE_BRANCH_REF GIT_SHIM_MODE GIT_SHIM_BRANCH_REF GIT_SHIM_LIFECYCLE_ONCE_MARKER
  case "$mode" in
    commit-cleanup-failure|commit-then-signal)
      configure_commit_lifecycle_path_shim "$repo" "archive-$mode" "$mode" "$post_commit_state"
      ;;
    post-wait-pgid-probe)
      configure_commit_lifecycle_path_shim "$repo" "archive-$mode" "$mode"
      POST_WAIT_PGID_EVENT_LOG="$repo/.git/archive-post-wait-pgid-probe-events.log"
      export POST_WAIT_PGID_EVENT_LOG
      install_post_wait_pgid_probe_wrappers
      ;;
    orphan-child)
      GIT_SHIM_PROCESS_LOG="$repo/.git/archive-orphan-child-process.log"
      GIT_SHIM_CHILD_PID_FILE="$repo/.git/archive-orphan-child.pid"
      export GIT_SHIM_PROCESS_LOG GIT_SHIM_CHILD_PID_FILE
      install_git_path_shim
      ;;
    forward-symref)
      GIT_SHIM_TARGET_REF=refs/heads/archive-competing
      export GIT_SHIM_TARGET_REF
      install_git_path_shim
      ;;
    archive-third-oid)
      GIT_SHIM_THIRD_OID=$ARCHIVE_THIRD_OID
      export GIT_SHIM_THIRD_OID
      install_git_path_shim
      ;;
    direct)
      install_git_path_shim
      ;;
    *) return 1 ;;
  esac
}

run_archive_ref_transaction() (
  local repo=$1 new_oid=$2 old_oid=$3 mode=$4 post_commit_state=${5:-direct}
  cd "$repo"
  configure_archive_ref_transaction_runner "$repo" "$mode" "$post_commit_state"
  source "$TMP_ROOT/archive-direct-ref.sh"
  source "$TMP_ROOT/archive-update-transaction.sh"
  source "$TMP_ROOT/archive-classify-ref.sh"
  HEAD_COMMIT=$new_oid
  PARENT_OID=$old_oid
  REF_ADVANCED=0
  archive_rollback_exact_new_ref() {
    local exit_status=$?
    trap - EXIT HUP INT TERM
    if test "$REF_ADVANCED" = 1; then
      archive_validate_direct_branch_ref "$HEAD_COMMIT" || exit 1
      archive_update_branch_ref_transaction "$PARENT_OID" "$HEAD_COMMIT" || exit 1
      archive_validate_direct_branch_ref "$PARENT_OID" || exit 1
    fi
    exit "$exit_status"
  }
  trap archive_rollback_exact_new_ref EXIT
  ARCHIVE_TRANSACTION_STATUS=0
  archive_update_branch_ref_transaction "$HEAD_COMMIT" "$PARENT_OID" || ARCHIVE_TRANSACTION_STATUS=$?
  archive_classify_transaction_ref "$HEAD_COMMIT" "$PARENT_OID"
  case "$ARCHIVE_REF_CLASS" in
    exact-new) REF_ADVANCED=1 ;;
    exact-old|competing-direct|symbolic|missing|unreadable) ;;
    *) exit 1 ;;
  esac
  test "$ARCHIVE_TRANSACTION_STATUS" = 0 || exit 1
  archive_validate_direct_branch_ref "$HEAD_COMMIT" || exit 1
  trap - EXIT HUP INT TERM
)

run_archive_ref_transaction_with_commit_cleanup_failure() {
  run_archive_ref_transaction "$1" "$2" "$3" commit-cleanup-failure "${4:-direct}"
}

run_archive_ref_transaction_with_commit_then_signal() {
  run_archive_ref_transaction "$1" "$2" "$3" commit-then-signal "${4:-direct}"
}

run_archive_ref_transaction_with_post_wait_pgid_probe() {
  run_archive_ref_transaction "$1" "$2" "$3" post-wait-pgid-probe
}

run_archive_ref_transaction_with_path_shim_orphan_child() {
  run_archive_ref_transaction "$1" "$2" "$3" orphan-child
}

assert_archive_transport_cleanup() {
  local repo=$1 transaction_dir branch_lock
  for transaction_dir in "$(commit_fence_tmpdir "$repo")"/gpuwatcher-ref-transaction.*; do
    test ! -e "$transaction_dir" || fail 'archive publication transaction left a transport directory'
  done
  branch_lock="$(GIT_MASTER=1 git -C "$repo" rev-parse --git-path refs/heads/local/archive.lock)"
  test ! -e "$branch_lock" || fail 'archive publication transaction left a branch lock'
}

assert_archive_caller_classifies_before_fail() {
  awk '
    /ARCHIVE_TRANSACTION_STATUS=0/ { captured = NR }
    /archive_classify_transaction_ref "\$HEAD_COMMIT" "\$PARENT_OID"/ { classified = NR }
    /exact-new\) REF_ADVANCED=1/ { advanced = NR }
    /test "\$ARCHIVE_TRANSACTION_STATUS" = 0 \|\| fail/ { failed = NR }
    END { exit !(captured && classified && advanced && failed && captured < classified && classified < advanced && advanced < failed) }
  ' "$EXTERNAL_SKILL" || fail 'archive caller does not classify and record exact-new before failing the transaction'
}

assert_archive_committed_transaction_failure_is_resolved() {
  local runner=$1 repo=$2 new_oid=$3 old_oid=$4 label=$5 after_oid output_file lifecycle_log
  lifecycle_log="$repo/.git/${label}.log"
  output_file="$TMP_ROOT/${label}.log"
  if run_portable_watchdog "$output_file" "$runner" "$repo" "$new_oid" "$old_oid"; then
    record_external_archive_fence_gap "$label returned zero after committed transport failure"
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  test "$WATCHDOG_STATUS" != 0 || record_external_archive_fence_gap "$label concealed its nonzero transport failure"
  grep -F -- "advanced ref=refs/heads/local/archive old=$old_oid new=$new_oid" "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not apply the exact old-to-new transaction"
  case "$label" in
    *cleanup-failure)
      grep -F -- 'cleanup blocker=' "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not fail owned transport cleanup after commit"
      ;;
    *then-signal)
      grep -F -- 'self-signal=TERM pid=' "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not signal only its immediate transaction shell"
      ;;
  esac
  if symbolic_ref_exists "$repo" refs/heads/local/archive; then
    record_external_archive_fence_gap "$label replaced the direct archive ref with a symbolic ref"
    return 0
  fi
  after_oid="$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' refs/heads/local/archive)"
  if test "$after_oid" = "$old_oid"; then
    return 0
  fi
  if test "$after_oid" = "$new_oid"; then
    record_external_archive_fence_gap "$label left exact-created ref=refs/heads/local/archive old=$old_oid new=$new_oid after failed transaction"
    return 0
  fi
  record_external_archive_fence_gap "$label replaced the archive ref with unexpected state=$after_oid after failed transaction"
}

assert_archive_committed_transaction_failure_preserves_symbolic_competitor() {
  local runner=$1 repo=$2 new_oid=$3 old_oid=$4 label=$5 symbolic_target competing_oid output_file lifecycle_log
  symbolic_target=refs/heads/lifecycle-competing
  GIT_MASTER=1 git -C "$repo" update-ref "$symbolic_target" "$old_oid"
  lifecycle_log="$repo/.git/${label}.log"
  output_file="$TMP_ROOT/${label}-symbolic.log"
  if run_portable_watchdog "$output_file" "$runner" "$repo" "$new_oid" "$old_oid" symbolic; then
    record_external_archive_fence_gap "$label symbolic competitor returned zero after committed transport failure"
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    fail "$label symbolic competitor exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  test "$WATCHDOG_STATUS" != 0 || record_external_archive_fence_gap "$label symbolic competitor concealed its transport failure"
  grep -F -- "advanced ref=refs/heads/local/archive old=$old_oid new=$new_oid" "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label symbolic competitor did not first advance the exact transaction"
  grep -F -- "symbolic target=$symbolic_target" "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not install its symbolic competitor"
  if ! symbolic_ref_exists "$repo" refs/heads/local/archive; then
    record_external_archive_fence_gap "$label overwrote its symbolic competitor"
    return 0
  fi
  test "$(GIT_MASTER=1 git -C "$repo" symbolic-ref refs/heads/local/archive)" = "$symbolic_target" || record_external_archive_fence_gap "$label changed the symbolic competitor target"
  if symbolic_ref_exists "$repo" "$symbolic_target"; then
    record_external_archive_fence_gap "$label changed the competing direct ref into a symbolic ref"
    return 0
  fi
  competing_oid="$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' "$symbolic_target")"
  test "$competing_oid" = "$old_oid" || record_external_archive_fence_gap "$label changed the competing direct ref"
}

assert_archive_post_wait_pgid_probe_is_absent() {
  local runner=$1 repo=$2 new_oid=$3 old_oid=$4 label=$5 output_file event_log lifecycle_log
  output_file="$TMP_ROOT/${label}.log"
  event_log="$repo/.git/${label}-events.log"
  lifecycle_log="$repo/.git/${label}.log"
  if ! run_portable_watchdog "$output_file" "$runner" "$repo" "$new_oid" "$old_oid"; then
    if test "$WATCHDOG_RESULT" = timed_out; then
      fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
    fi
    record_external_archive_fence_gap "$label did not complete its successful transaction"
    return 0
  fi
  if test "$WATCHDOG_RESULT" = timed_out; then
    fail "$label exceeded $((WATCHDOG_TICKS * 50))ms (terminated at ${WATCHDOG_ELAPSED_MS}ms)"
  fi
  grep -F -- 'leader=' "$lifecycle_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not record its transaction leader"
  grep -F -- 'waited leader=' "$event_log" >/dev/null 2>&1 || record_external_archive_fence_gap "$label did not wait for its recorded leader"
  if grep -F -- 'post-wait negative-pgid kill ' "$event_log" >/dev/null 2>&1; then
    record_external_archive_fence_gap "$label probed or signalled a negative PGID after wait"
  fi
  if symbolic_ref_exists "$repo" refs/heads/local/archive; then
    record_external_archive_fence_gap "$label changed the direct archive ref into a symbolic ref"
  elif test "$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' refs/heads/local/archive)" != "$new_oid"; then
    record_external_archive_fence_gap "$label did not retain its exact-created archive ref"
  fi
}

assert_archive_orphan_child_is_reaped() {
  local repo=$1 new_oid=$2 old_oid=$3 label=$4 actual_oid
  assert_path_shim_orphan_child_is_reaped run_archive_ref_transaction_with_path_shim_orphan_child "$repo" "$repo/.git/archive-orphan-child-process.log" "$repo/.git/archive-orphan-child.pid" "$label" record_external_archive_fence_gap "$new_oid" "$old_oid"
  if symbolic_ref_exists "$repo" refs/heads/local/archive; then
    record_external_archive_fence_gap "$label changed the direct archive ref into a symbolic ref"
    return 0
  fi
  actual_oid="$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' refs/heads/local/archive)"
  test "$actual_oid" = "$old_oid" || record_external_archive_fence_gap "$label changed archive ref after orphan-child rejection"
}

assert_archive_publication_transaction_canaries() {
  local repo parent new_oid third_oid
  setup_archive_exact_ref_context archive-publication-transaction
  repo=$ARCHIVE_TRANSACTION_REPO
  parent=$ARCHIVE_TRANSACTION_OLD_OID
  new_oid=$ARCHIVE_TRANSACTION_NEW_OID
  expect_success run_archive_ref_transaction "$repo" "$new_oid" "$parent" direct
  assert_direct_ref_oid "$repo" refs/heads/local/archive "$new_oid"

  GIT_MASTER=1 git -C "$repo" update-ref refs/heads/local/archive "$parent" "$new_oid"
  GIT_MASTER=1 git -C "$repo" update-ref refs/heads/archive-competing "$parent"
  expect_failure run_archive_ref_transaction "$repo" "$new_oid" "$parent" forward-symref
  test "$(GIT_MASTER=1 git -C "$repo" symbolic-ref refs/heads/local/archive)" = refs/heads/archive-competing || fail 'archive transaction overwrote competing symref'
  assert_direct_ref_oid "$repo" refs/heads/archive-competing "$parent"

  GIT_MASTER=1 git -C "$repo" symbolic-ref -d refs/heads/local/archive
  GIT_MASTER=1 git -C "$repo" update-ref refs/heads/local/archive "$parent"
  third_oid="$(make_third_party_oid "$repo")"
  ARCHIVE_THIRD_OID=$third_oid
  export ARCHIVE_THIRD_OID
  expect_failure run_archive_ref_transaction "$repo" "$new_oid" "$parent" archive-third-oid
  assert_direct_ref_oid "$repo" refs/heads/local/archive "$third_oid"
  assert_archive_transport_cleanup "$repo"
}

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

assert_external_decision_reads_are_checked() {
  local fence_dir guard_log fence_file
  fence_dir="$TMP_ROOT/external-decision-fences"
  guard_log="$TMP_ROOT/external-decision-read-guard.log"
  extract_all_bash_fences "$EXTERNAL_SKILL" "$fence_dir" || return 1
  : > "$guard_log"
  for fence_file in "$fence_dir"/*.sh; do
    test -e "$fence_file" || continue
    awk '
      function reject(message) {
        printf "%s:%d: %s\\n", FILENAME, NR, message >> guard_path
        invalid = 1
      }
      /test[[:space:]]+-z[[:space:]]+"[$][(]git[[:space:]]/ {
        reject("unchecked Git absence substitution")
      }
      /test[[:space:]][^#]*"[$][(]git[[:space:]]/ {
        reject("unchecked Git decision substitution")
      }
      /case[[:space:]]+"[$][(]git[[:space:]]/ {
        reject("unchecked Git case substitution")
      }
      /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*\+?=\(?"[$][(]git[[:space:]]/ &&
        $0 !~ /\|\|[[:space:]]*(fail|return|exit|\{)/ {
        reject("unchecked Git assignment")
      }
      END { exit invalid }
    ' guard_path="$guard_log" "$fence_file" || return 1
  done
  test ! -s "$guard_log"
}

capture_git_line() {
  local output_file
  output_file="$TMP_ROOT/git-line-$RANDOM"
  GIT_MASTER=1 git "$@" > "$output_file" || return 1
  if IFS= read -r GIT_CAPTURED < "$output_file"; then :; else GIT_CAPTURED=; fi
  rm -f -- "$output_file"
}

write_external_archive_identity() {
  local path=$1 include_cleanup=$2
  printf '%s\n' \
    'snapshot_schema=review snapshot schema v2' \
    'repository_host=github.com' \
    'repository_name=jinzer0/GPUWatch' \
    'repository_id=1256824919' \
    'pr_number=7' \
    'review_round=1' \
    'base_oid=1111111111111111111111111111111111111111' \
    'diff_base_oid=2222222222222222222222222222222222222222' \
    'head_oid=3333333333333333333333333333333333333333' \
    'snapshot_sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
    'diff_sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
    'diff_bytes=0' \
    'diff_lines=0' > "$path"
  if test "$include_cleanup" = 1; then
    printf '%s\n' 'temporary_refs=absent' 'snapshot_root=removed' >> "$path"
  fi
}

setup_external_archive_decision_fixture() {
  local name=$1 repo review_sha review_bytes report_sha report_bytes tuple_file
  repo="$(new_hook_canary_repo "$name")"
  GIT_MASTER=1 git -C "$repo" checkout -qb local/archive
  mkdir -p "$repo/mydocs/pr/archives"
  write_external_archive_identity "$repo/mydocs/pr/pr_7_review.md" 0
  write_external_archive_identity "$repo/mydocs/pr/pr_7_report.md" 1
  GIT_MASTER=1 git -C "$repo" add mydocs/pr/pr_7_review.md mydocs/pr/pr_7_report.md
  GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test GIT_MASTER=1 git -C "$repo" commit -qm external-decision-fixture
  capture_git_line -C "$repo" rev-parse 'HEAD^{commit}' || return 1
  EXTERNAL_DECISION_PARENT=$GIT_CAPTURED
  review_sha="$(shasum -a 256 "$repo/mydocs/pr/pr_7_review.md" | cut -d' ' -f1)"
  review_bytes="$(wc -c < "$repo/mydocs/pr/pr_7_review.md" | tr -d ' ')"
  report_sha="$(shasum -a 256 "$repo/mydocs/pr/pr_7_report.md" | cut -d' ' -f1)"
  report_bytes="$(wc -c < "$repo/mydocs/pr/pr_7_report.md" | tr -d ' ')"
  tuple_file="$repo/.git/external-decision-tuple.json"
  jq -S -c -n \
    --arg parent "$EXTERNAL_DECISION_PARENT" \
    --arg reviewSha "$review_sha" --argjson reviewBytes "$review_bytes" \
    --arg reportSha "$report_sha" --argjson reportBytes "$report_bytes" \
    --arg subject 'External PR #7 Round 1: 검토 기록 보관' \
    '{
      action:"archive-external-review",
      archivePath:"mydocs/pr/archives/pr_7_round1",
      commitSubject:$subject,
      localBranch:"local/archive",
      parentOid:$parent,
      prNumber:7,
      repositoryHost:"github.com",
      repositoryId:1256824919,
      repositoryName:"jinzer0/GPUWatch",
      reviewRound:1,
      snapshot:{
        sha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        baseOid:"1111111111111111111111111111111111111111",
        diffBaseOid:"2222222222222222222222222222222222222222",
        headOid:"3333333333333333333333333333333333333333",
        diff:{sha256:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",bytes:0,lines:0}
      },
      snapshotSchema:"review snapshot schema v2",
      sources:{
        review:{role:"review",path:"mydocs/pr/pr_7_review.md",destination:"mydocs/pr/archives/pr_7_round1/pr_7_review.md",present:true,state:"tracked",sha256:$reviewSha,bytes:$reviewBytes},
        report:{role:"report",path:"mydocs/pr/pr_7_report.md",destination:"mydocs/pr/archives/pr_7_round1/pr_7_report.md",present:true,state:"tracked",sha256:$reportSha,bytes:$reportBytes},
        implementation:{role:"implementation",path:"mydocs/pr/pr_7_review_impl.md",destination:"mydocs/pr/archives/pr_7_round1/pr_7_review_impl.md",present:false,state:"absent",sha256:null,bytes:null}
      }
    }' > "$tuple_file" || return 1
  EXTERNAL_DECISION_REPO=$repo
  EXTERNAL_DECISION_TUPLE=$tuple_file
  EXTERNAL_DECISION_REVIEW=mydocs/pr/pr_7_review.md
  EXTERNAL_DECISION_REPORT=mydocs/pr/pr_7_report.md
  EXTERNAL_DECISION_ARCHIVE=mydocs/pr/archives/pr_7_round1
}

extract_external_archive_execution_fence() {
  local fence_dir
  fence_dir="$TMP_ROOT/external-archive-execution-fences"
  extract_all_bash_fences "$EXTERNAL_SKILL" "$fence_dir" || return 1
  EXTERNAL_ARCHIVE_EXECUTION_FENCE="$fence_dir/fence-005.sh"
  test -f "$EXTERNAL_ARCHIVE_EXECUTION_FENCE" || return 1
  /bin/bash -n "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
}

external_git_failure_output() {
  case "$1" in
    for-each-ref|status|diff-cached) ;;
    rev-parse) printf '%s\n' "$EXTERNAL_DECISION_REPO" ;;
    symbolic-ref) printf '%s\n' local/archive ;;
    ls-files) printf '%s\n' "$EXTERNAL_DECISION_REVIEW" ;;
    hash-object|write-tree) printf '%040d\n' 0 ;;
    ls-tree) printf '100644 blob %040d\t%s\n' 0 "$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" ;;
    show) write_external_archive_identity /dev/stdout 0 ;;
    diff-tree) printf 'R100\t%s\t%s\n' "$EXTERNAL_DECISION_REVIEW" "$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" ;;
    rev-list) printf '%s %s\n' "$EXTERNAL_DECISION_PARENT" "$EXTERNAL_DECISION_PARENT" ;;
    log) printf '%s\n' 'External PR #7 Round 1: 검토 기록 보관' ;;
    *) return 1 ;;
  esac
}

run_external_archive_with_failed_git_read() (
  local repo=$1 tuple_file=$2 failure_class=$3 failure_output=$4 failure_mode=$5
  cd "$repo" || exit 1
  mkdir -p "$repo/.git/external-decision-tmp"
  TMPDIR="$repo/.git/external-decision-tmp"
  export TMPDIR
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  APPROVAL_TUPLE="$(< "$tuple_file")"
  export APPROVAL_TUPLE
  EXTERNAL_GIT_FAILURE_CLASS=$failure_class
  EXTERNAL_GIT_FAILURE_OUTPUT=$failure_output
  EXTERNAL_GIT_FAILURE_MODE=$failure_mode
  EXTERNAL_GIT_FAILURE_USED=0
  export EXTERNAL_GIT_FAILURE_CLASS EXTERNAL_GIT_FAILURE_OUTPUT EXTERNAL_GIT_FAILURE_MODE
  git() {
    local argument skip_next=0 command_name= command_class
    for argument in "$@"; do
      if test "$skip_next" = 1; then
        skip_next=0
        continue
      fi
      case "$argument" in
        -C|-c|--git-dir|--work-tree|--namespace) skip_next=1 ;;
        --) ;;
        -*) ;;
        *) command_name=$argument; break ;;
      esac
    done
    command_class=$command_name
    if test "$command_name" = diff; then
      for argument in "$@"; do
        if test "$argument" = --cached; then command_class=diff-cached; fi
      done
    fi
    if test "$EXTERNAL_GIT_FAILURE_USED" = 0 && test "$command_class" = "$EXTERNAL_GIT_FAILURE_CLASS"; then
      EXTERNAL_GIT_FAILURE_USED=1
      case "$EXTERNAL_GIT_FAILURE_MODE" in
        competitor)
          command git -C "$repo" update-ref refs/heads/external-decision-competitor "$EXTERNAL_DECISION_PARENT" || return 98
          command git -C "$repo" symbolic-ref refs/heads/local/archive refs/heads/external-decision-competitor || return 98
          ;;
        drift)
          printf 'competing destination drift\n' > "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" || return 98
          chmod 644 "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" || return 98
          ;;
        none) ;;
        *) return 98 ;;
      esac
      printf '%s' "$EXTERNAL_GIT_FAILURE_OUTPUT"
      return 97
    fi
    command git "$@"
  }
  source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
)

assert_external_archive_ref_is_parent() {
  local repo=$1 label=${2:-"$EXTERNAL_GIT_CASE_NAME"}
  if GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet refs/heads/local/archive >/dev/null; then
    fail "failed external Git read $label converted the archive branch into a symbolic ref"
  fi
  capture_git_line -C "$repo" rev-parse refs/heads/local/archive || fail "failed external Git read $label made the archive branch unreadable"
  test "$GIT_CAPTURED" = "$EXTERNAL_DECISION_PARENT" || fail "failed external Git read $label advanced the archive branch expected=$EXTERNAL_DECISION_PARENT actual=$GIT_CAPTURED"
}

assert_external_archive_failure_before_moves() {
  local repo=$1
  assert_external_archive_ref_is_parent "$repo"
  GIT_MASTER=1 git -C "$repo" diff --cached --quiet || fail 'failed pre-move Git read reset or dirtied the index'
  test -f "$repo/$EXTERNAL_DECISION_REVIEW" && test -f "$repo/$EXTERNAL_DECISION_REPORT" || fail 'failed pre-move Git read changed a source path'
  test ! -e "$repo/$EXTERNAL_DECISION_ARCHIVE" || fail 'failed pre-move Git read created an archive destination'
}

assert_external_archive_failure_after_partial_move() {
  local repo=$1
  assert_external_archive_ref_is_parent "$repo"
  GIT_MASTER=1 git -C "$repo" diff --cached --quiet || fail 'failed hash-object read reset the index'
  test ! -e "$repo/$EXTERNAL_DECISION_REVIEW" && test -f "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" || fail 'failed hash-object read reversed its source and destination move'
  test -f "$repo/$EXTERNAL_DECISION_REPORT" && test ! -e "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" || fail 'failed hash-object read moved an untouched source'
}

assert_external_archive_failure_after_moves() {
  local repo=$1
  assert_external_archive_ref_is_parent "$repo"
  if GIT_MASTER=1 git -C "$repo" diff --cached --quiet; then
    fail 'failed post-stage Git read reset the index'
  fi
  test ! -e "$repo/$EXTERNAL_DECISION_REVIEW" && test -f "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" || fail 'failed post-stage Git read reversed the review move'
  test ! -e "$repo/$EXTERNAL_DECISION_REPORT" && test -f "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" || fail 'failed post-stage Git read reversed the report move'
}

assert_external_archive_failure_preserves_destination_competitor() {
  local repo=$1
  assert_external_archive_failure_after_moves "$repo"
  assert_contains "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" 'competing destination drift'
}

assert_external_archive_failure_preserves_competitor() {
  local repo=$1 competitor_file
  competitor_file="$TMP_ROOT/external-decision-competitor"
  GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet refs/heads/local/archive > "$competitor_file" || fail 'failed post-publication Git read removed the competitor ref'
  if IFS= read -r GIT_CAPTURED < "$competitor_file"; then :; else GIT_CAPTURED=; fi
  test "$GIT_CAPTURED" = refs/heads/external-decision-competitor || fail 'failed post-publication Git read changed the competitor target'
  capture_git_line -C "$repo" rev-parse refs/heads/external-decision-competitor || fail 'failed post-publication Git read made the competitor unreadable'
  test "$GIT_CAPTURED" = "$EXTERNAL_DECISION_PARENT" || fail 'failed post-publication Git read changed the competitor OID'
  if GIT_MASTER=1 git -C "$repo" diff --cached --quiet; then
    fail 'failed post-publication Git read reset the index'
  fi
  test ! -e "$repo/$EXTERNAL_DECISION_REVIEW" && test -f "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" || fail 'failed post-publication Git read reversed the review move'
  test ! -e "$repo/$EXTERNAL_DECISION_REPORT" && test -f "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" || fail 'failed post-publication Git read reversed the report move'
}

assert_external_archive_failed_git_read_table() {
  local command_class phase variant failure_output case_name failure_mode
  extract_external_archive_execution_fence || fail 'could not extract external archive execution fence'
  while IFS='|' read -r command_class phase; do
    test -n "$command_class" || continue
    for variant in expected empty; do
      setup_external_archive_decision_fixture "external-git-${command_class}-${variant}" || fail "could not prepare $command_class fixture"
      if test "$variant" = expected; then
        failure_output="$(external_git_failure_output "$command_class")" || fail "missing plausible $command_class output"
      else
        failure_output=
      fi
      case_name="$command_class $variant stdout"
      EXTERNAL_GIT_CASE_NAME="$case_name phase=$phase"
      case "$phase" in
        competitor) failure_mode=competitor ;;
        drift) failure_mode=drift ;;
        *) failure_mode=none ;;
      esac
      if run_external_archive_with_failed_git_read "$EXTERNAL_DECISION_REPO" "$EXTERNAL_DECISION_TUPLE" "$command_class" "$failure_output" "$failure_mode" > "$TMP_ROOT/external-git-${command_class}-${variant}.log" 2>&1; then
        fail "external archive accepted a nonzero $case_name"
      fi
      case "$phase" in
        pre-move) assert_external_archive_failure_before_moves "$EXTERNAL_DECISION_REPO" ;;
        partial-move) assert_external_archive_failure_after_partial_move "$EXTERNAL_DECISION_REPO" ;;
        moved) assert_external_archive_failure_after_moves "$EXTERNAL_DECISION_REPO" ;;
        drift) assert_external_archive_failure_preserves_destination_competitor "$EXTERNAL_DECISION_REPO" ;;
        competitor) assert_external_archive_failure_preserves_competitor "$EXTERNAL_DECISION_REPO" ;;
        *) fail "unknown external Git failure phase $phase" ;;
      esac
    done
  done <<'EOF'
for-each-ref|pre-move
rev-parse|pre-move
symbolic-ref|pre-move
ls-files|pre-move
status|pre-move
diff-cached|pre-move
hash-object|pre-move
write-tree|drift
ls-tree|competitor
show|competitor
diff-tree|competitor
rev-list|competitor
log|competitor
EOF
}

assert_path_shim_cleanup_authority_is_static() {
  local orphan_assertion="$TMP_ROOT/path-shim-orphan-assertion.sh" directory_assertion="$TMP_ROOT/path-shim-directory-assertion.sh" watchdog_assertion="$TMP_ROOT/portable-watchdog-assertion.sh"
  extract_function "$REPO_ROOT/tests/workflow_fences_test.sh" assert_path_shim_orphan_child_is_reaped 1 "$orphan_assertion"
  extract_function "$REPO_ROOT/tests/workflow_fences_test.sh" assert_path_shim_transaction_directory_is_owned 1 "$directory_assertion"
  extract_function "$REPO_ROOT/tests/workflow_fences_test.sh" run_portable_watchdog 1 "$watchdog_assertion"
  if rg -n -- '(^|[[:space:];])kill[[:space:]][^#]*(\$child_pid|\$\{child_pid\}|\$pid_file|\$\{pid_file\})' "$orphan_assertion"; then
    fail 'PATH-shim orphan assertion grants kill authority to helper PID evidence'
  fi
  if rg -n -- '(^|[[:space:];])rm[[:space:]][^#]*(\$replaced_dir_file|\$\{replaced_dir_file\}|\$replaced_dir|\$\{replaced_dir\}|\$replacement_dir|\$\{replacement_dir\})' "$directory_assertion"; then
    fail 'PATH-shim directory assertion grants rm authority to helper path evidence'
  fi
  assert_absent "$directory_assertion" 'rm -rf -- "$replaced_dir"'
  assert_contains "$watchdog_assertion" 'set -m'
  assert_contains "$watchdog_assertion" 'test "$WATCHDOG_PGID" = "$WATCHDOG_PID"'
  assert_contains "$watchdog_assertion" 'test "$WATCHDOG_PGID" != "$WATCHDOG_PARENT_PGID"'
  assert_contains "$watchdog_assertion" 'kill -TERM -- "-$WATCHDOG_PGID"'
  assert_contains "$watchdog_assertion" 'kill -KILL -- "-$WATCHDOG_PGID"'
  if rg -n -- 'kill[[:space:]]+-(TERM|KILL)[[:space:]][^#]*(\$WATCHDOG_PID|\$\{WATCHDOG_PID\})' "$watchdog_assertion"; then
    fail 'portable watchdog retains PID-only timeout cleanup'
  fi
  if ! awk '
    /wait "\$WATCHDOG_PID"/ { waited=1 }
    waited && /kill .*"-\$WATCHDOG_PGID"/ { invalid=1 }
    END { exit invalid }
  ' "$watchdog_assertion"; then
    fail 'portable watchdog signals its process group after wait'
  fi
  test "$WATCHDOG_TICKS" = 60 || fail 'portable watchdog timeout tick count changed'
}

extract_snapshot_function_from_section() {
  local section=$1 function_name=$2 target_file=$3 section_file count
  section_file="$TMP_ROOT/snapshot-${section}-section.sh"
  case "$section" in
    step1) awk '/^### 1\./{active=1; next} /^### 2\./{active=0} active{print}' "$EXTERNAL_SKILL" > "$section_file" ;;
    step3) awk '/^### 3\./{active=1; next} /^### 4\./{active=0} active{print}' "$EXTERNAL_SKILL" > "$section_file" ;;
    *) return 1 ;;
  esac
  count="$(awk -v name="$function_name" '$0 ~ "^[[:space:]]*" name "\\(\\)[[:space:]]*\\{" {count++} END{print count+0}' "$section_file")"
  test "$count" = 1 || return 1
  extract_function "$section_file" "$function_name" 1 "$target_file"
}

extract_archive_transaction_function_from_step5() {
  local function_name=$1 target_file=$2 section_file count
  section_file="$TMP_ROOT/archive-step5-section.sh"
  awk '/^### 5\./{active=1; next} /^## /{active=0} active{print}' "$EXTERNAL_SKILL" > "$section_file"
  count="$(awk -v name="$function_name" '$0 ~ "^[[:space:]]*" name "\\(\\)[[:space:]]*\\{" {count++} END{print count+0}' "$section_file")"
  if test "$count" != 1 || ! extract_function "$section_file" "$function_name" 1 "$target_file"; then
    rm -f -- "$target_file"
    record_external_archive_fence_gap "missing Step 5 archive transaction function $function_name"
    return 1
  fi
}

ARCHIVE_OWNERSHIP_CANARY_GAPS=

record_archive_ownership_canary_gap() {
  if test -n "$ARCHIVE_OWNERSHIP_CANARY_GAPS"; then
    ARCHIVE_OWNERSHIP_CANARY_GAPS="$ARCHIVE_OWNERSHIP_CANARY_GAPS; "
  fi
  ARCHIVE_OWNERSHIP_CANARY_GAPS="${ARCHIVE_OWNERSHIP_CANARY_GAPS}$1"
}

archive_file_record() {
  local path=$1 metadata digest bytes link_target
  if test -L "$path"; then
    metadata="$(stat -f '%d:%i:%u:%Lp:%l' -- "$path")" || return 1
    link_target="$(readlink "$path")" || return 1
    printf 'symlink:%s:%s\n' "$metadata" "$link_target"
  elif test -f "$path"; then
    metadata="$(stat -f '%d:%i:%u:%Lp:%l' -- "$path")" || return 1
    digest="$(shasum -a 256 "$path" | cut -d' ' -f1)" || return 1
    bytes="$(wc -c < "$path" | tr -d ' ')" || return 1
    printf 'regular:%s:%s:%s\n' "$metadata" "$digest" "$bytes"
  elif test -d "$path"; then
    metadata="$(stat -f '%d:%i:%u:%Lp:%l' -- "$path")" || return 1
    printf 'directory:%s\n' "$metadata"
  elif test -e "$path"; then
    metadata="$(stat -f '%d:%i:%u:%Lp:%l' -- "$path")" || return 1
    printf 'other:%s\n' "$metadata"
  else
    printf 'absent\n'
  fi
}

archive_capture_path_state() {
  local path=$1 state_dir=$2 label=$3 record
  record="$(archive_file_record "$path")" || return 1
  printf '%s\n' "$record" > "$state_dir/$label.record" || return 1
  case "$record" in
    regular:*) cat "$path" > "$state_dir/$label.content" || return 1 ;;
    *) : > "$state_dir/$label.content" || return 1 ;;
  esac
}

archive_expect_path_state() {
  local path=$1 state_dir=$2 label=$3 scenario=$4 expected actual
  if test ! -f "$state_dir/$label.record" || test ! -f "$state_dir/$label.content"; then
    record_archive_ownership_canary_gap "$scenario did not capture $label expected state"
    return 0
  fi
  expected="$(cat "$state_dir/$label.record")"
  if ! actual="$(archive_file_record "$path")"; then
    record_archive_ownership_canary_gap "$scenario could not read $label identity"
    return 0
  fi
  if test "$actual" != "$expected"; then
    record_archive_ownership_canary_gap "$scenario changed $label identity expected=$expected actual=$actual"
    return 0
  fi
  case "$expected" in
    regular:*)
      if ! cmp -s "$path" "$state_dir/$label.content"; then
        record_archive_ownership_canary_gap "$scenario changed $label content despite matching metadata"
      fi
      ;;
  esac
}

archive_capture_index_state() {
  local repo=$1 path=$2 state_dir=$3 label=$4
  GIT_MASTER=1 git -C "$repo" ls-files --stage -- "$path" > "$state_dir/$label.index" || return 1
}

archive_expect_index_state() {
  local repo=$1 path=$2 state_dir=$3 label=$4 scenario=$5 expected actual
  if test ! -f "$state_dir/$label.index"; then
    record_archive_ownership_canary_gap "$scenario did not capture $label expected index entry"
    return 0
  fi
  expected="$(cat "$state_dir/$label.index")"
  if ! actual="$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- "$path")"; then
    record_archive_ownership_canary_gap "$scenario could not read $label index entry"
    return 0
  fi
  test "$actual" = "$expected" || record_archive_ownership_canary_gap "$scenario changed $label index entry expected=$expected actual=$actual"
}

archive_capture_external_state() {
  local repo=$1 state_dir=$2 prefix=$3
  archive_capture_path_state "$repo/$EXTERNAL_DECISION_REVIEW" "$state_dir" "$prefix-review-source" || return 1
  archive_capture_path_state "$repo/$EXTERNAL_DECISION_REPORT" "$state_dir" "$prefix-report-source" || return 1
  archive_capture_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" "$prefix-review-destination" || return 1
  archive_capture_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" "$prefix-report-destination" || return 1
  archive_capture_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE" "$state_dir" "$prefix-archive-root" || return 1
  archive_capture_index_state "$repo" "$EXTERNAL_DECISION_REVIEW" "$state_dir" "$prefix-review-source" || return 1
  archive_capture_index_state "$repo" "$EXTERNAL_DECISION_REPORT" "$state_dir" "$prefix-report-source" || return 1
  archive_capture_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" "$prefix-review-destination" || return 1
  archive_capture_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" "$prefix-report-destination"
}

archive_expect_external_state() {
  local repo=$1 state_dir=$2 prefix=$3 scenario=$4
  archive_expect_path_state "$repo/$EXTERNAL_DECISION_REVIEW" "$state_dir" "$prefix-review-source" "$scenario"
  archive_expect_path_state "$repo/$EXTERNAL_DECISION_REPORT" "$state_dir" "$prefix-report-source" "$scenario"
  archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" "$prefix-review-destination" "$scenario"
  archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" "$prefix-report-destination" "$scenario"
  archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE" "$state_dir" "$prefix-archive-root" "$scenario"
  archive_expect_index_state "$repo" "$EXTERNAL_DECISION_REVIEW" "$state_dir" "$prefix-review-source" "$scenario"
  archive_expect_index_state "$repo" "$EXTERNAL_DECISION_REPORT" "$state_dir" "$prefix-report-source" "$scenario"
  archive_expect_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" "$prefix-review-destination" "$scenario"
  archive_expect_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" "$prefix-report-destination" "$scenario"
}

archive_capture_owned_pair_state() {
  local repo=$1 state_dir=$2 prefix=$3 source=$4 destination=$5 archive_root=$6
  archive_capture_path_state "$repo/$source" "$state_dir" "$prefix-source" || return 1
  archive_capture_path_state "$repo/$destination" "$state_dir" "$prefix-destination" || return 1
  archive_capture_path_state "$repo/$archive_root" "$state_dir" "$prefix-archive-root" || return 1
  archive_capture_index_state "$repo" "$source" "$state_dir" "$prefix-source" || return 1
  archive_capture_index_state "$repo" "$destination" "$state_dir" "$prefix-destination"
}

archive_expect_owned_pair_state() {
  local repo=$1 state_dir=$2 prefix=$3 source=$4 destination=$5 archive_root=$6 scenario=$7
  archive_expect_path_state "$repo/$source" "$state_dir" "$prefix-source" "$scenario"
  archive_expect_path_state "$repo/$destination" "$state_dir" "$prefix-destination" "$scenario"
  archive_expect_path_state "$repo/$archive_root" "$state_dir" "$prefix-archive-root" "$scenario"
  archive_expect_index_state "$repo" "$source" "$state_dir" "$prefix-source" "$scenario"
  archive_expect_index_state "$repo" "$destination" "$state_dir" "$prefix-destination" "$scenario"
}

archive_capture_index_from_tree() {
  local repo=$1 tree_oid=$2 path=$3 state_dir=$4 label=$5 tree_entry mode object_type object_oid entry_path
  tree_entry="$(GIT_MASTER=1 git -C "$repo" ls-tree "$tree_oid" -- "$path")" || return 1
  if test -z "$tree_entry"; then
    : > "$state_dir/$label.index"
    return 0
  fi
  IFS=$' \t' read -r mode object_type object_oid entry_path <<EOF
$tree_entry
EOF
  test "$object_type" = blob && test "$entry_path" = "$path" || return 1
  printf '%s %s 0\t%s\n' "$mode" "$object_oid" "$path" > "$state_dir/$label.index"
}

archive_capture_restored_rollback_state() {
  local repo=$1 state_dir=$2 prefix=$3 parent_oid=$4
  command chmod 600 "$repo/archives/review.md" || return 1
  archive_capture_path_state "$repo/archives/review.md" "$state_dir" "$prefix-source" || return 1
  command chmod 644 "$repo/archives/review.md" || return 1
  archive_capture_path_state "$repo/review.md" "$state_dir" "$prefix-destination" || return 1
  command mv -- "$repo/archives/review.md" "$repo/review.md.expected" || return 1
  archive_capture_path_state "$repo/archives" "$state_dir" "$prefix-archive-root" || return 1
  command mv -- "$repo/review.md.expected" "$repo/archives/review.md" || return 1
  archive_capture_index_from_tree "$repo" "$parent_oid" review.md "$state_dir" "$prefix-source" || return 1
  archive_capture_index_from_tree "$repo" "$parent_oid" archives/review.md "$state_dir" "$prefix-destination"
}

archive_expect_direct_ref() {
  local repo=$1 ref=$2 expected_oid=$3 scenario=$4 actual_oid
  if symbolic_ref_exists "$repo" "$ref"; then
    record_archive_ownership_canary_gap "$scenario changed $ref from a direct ref"
    return 0
  fi
  if ! actual_oid="$(GIT_MASTER=1 git -C "$repo" for-each-ref --format='%(objectname)' "$ref")"; then
    record_archive_ownership_canary_gap "$scenario could not read $ref"
    return 0
  fi
  test "$actual_oid" = "$expected_oid" || record_archive_ownership_canary_gap "$scenario changed $ref OID expected=$expected_oid actual=$actual_oid"
}

archive_expect_symbolic_ref() {
  local repo=$1 ref=$2 expected_target=$3 expected_target_oid=$4 scenario=$5 actual_target
  if ! actual_target="$(GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet "$ref")"; then
    record_archive_ownership_canary_gap "$scenario replaced symbolic $ref"
    return 0
  fi
  test "$actual_target" = "$expected_target" || record_archive_ownership_canary_gap "$scenario changed $ref target expected=$expected_target actual=$actual_target"
  archive_expect_direct_ref "$repo" "$expected_target" "$expected_target_oid" "$scenario target"
}

archive_git_command_name() {
  local argument skip_next=0
  ARCHIVE_GIT_COMMAND=
  for argument in "$@"; do
    if test "$skip_next" = 1; then
      skip_next=0
      continue
    fi
    case "$argument" in
      -C|-c|--git-dir|--work-tree|--namespace) skip_next=1 ;;
      --) ;;
      -*) ;;
      *) ARCHIVE_GIT_COMMAND=$argument; break ;;
    esac
  done
}

run_external_archive_move_window() (
  local repo=$1 tuple_file=$2 scenario=$3 state_dir=$4 source_path destination_path
  cd "$repo" || exit 1
  source_path=$EXTERNAL_DECISION_REVIEW
  destination_path=$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md
  mkdir -p "$repo/.git/archive-move-window-tmp" || exit 1
  TMPDIR="$repo/.git/archive-move-window-tmp"
  export TMPDIR
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  APPROVAL_TUPLE="$(< "$tuple_file")"
  export APPROVAL_TUPLE
  ARCHIVE_MOVE_WINDOW_DONE=0

  mv() {
    local first_argument second_argument third_argument status
    first_argument=${1:-}
    second_argument=${2:-}
    third_argument=${3:-}
    if test "$first_argument" = --; then
      first_argument=$second_argument
      second_argument=$third_argument
    fi
    if test "$ARCHIVE_MOVE_WINDOW_DONE" = 0; then
      case "$scenario" in
        after-source-mv)
          command mv "$@"
          status=$?
          test "$status" = 0 || return "$status"
          archive_capture_external_state "$repo" "$state_dir" after-move || return 1
          ARCHIVE_MOVE_WINDOW_DONE=1
          return 97
          ;;
        source-replaced-before-move)
          command mv -- "$first_argument" "$first_argument.original" || return 1
          archive_capture_path_state "$first_argument.original" "$state_dir" source-original || return 1
          printf 'competing source replacement\n' > "$first_argument" || return 1
          command chmod 600 "$first_argument" || return 1
          archive_capture_path_state "$first_argument" "$state_dir" source-competitor || return 1
          command mv "$@" || return 1
          ARCHIVE_MOVE_WINDOW_DONE=1
          archive_capture_external_state "$repo" "$state_dir" injected || return 1
          return 0
      esac
    fi
    command mv "$@"
  }

  chmod() {
    local mode=${1:-} path=${2:-} status
    if test "$ARCHIVE_MOVE_WINDOW_DONE" = 0 && test "$scenario" = after-chmod && test "$mode" = 644; then
      command chmod "$@"
      status=$?
      test "$status" = 0 || return "$status"
      ARCHIVE_MOVE_WINDOW_DONE=1
      return 97
    fi
    command chmod "$@"
  }

  git() {
    local status
    archive_git_command_name "$@"
    if test "$ARCHIVE_MOVE_WINDOW_DONE" = 0 && test "$ARCHIVE_GIT_COMMAND" = write-tree; then
      case "$scenario" in
        destination-replaced-after-staging)
          command mv -- "$repo/$destination_path" "$repo/$destination_path.owned" || return 1
          archive_capture_path_state "$repo/$destination_path.owned" "$state_dir" owned-destination || return 1
          printf 'competing destination replacement\n' > "$repo/$destination_path" || return 1
          command chmod 600 "$repo/$destination_path" || return 1
          ARCHIVE_MOVE_WINDOW_DONE=1
          archive_capture_path_state "$repo/$destination_path" "$state_dir" injected-destination || return 1
          ;;
        source-recreated-after-staging)
          printf 'competing source recreation\n' > "$repo/$source_path" || return 1
          command chmod 600 "$repo/$source_path" || return 1
          ARCHIVE_MOVE_WINDOW_DONE=1
          archive_capture_external_state "$repo" "$state_dir" injected || return 1
          ;;
      esac
    fi
    command git "$@"
    status=$?
    return "$status"
  }

  source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
)

assert_external_archive_move_window() {
  local scenario=$1 repo state_dir output_file label saved_watchdog_ticks
  label="archive move window $scenario"
  setup_external_archive_decision_fixture "archive-move-window-$scenario" || fail "could not prepare $label fixture"
  repo=$EXTERNAL_DECISION_REPO
  state_dir="$repo/.git/archive-move-window-state"
  mkdir "$state_dir" || fail "could not create $label state directory"
  archive_capture_external_state "$repo" "$state_dir" before || fail "could not capture $label baseline"
  output_file="$TMP_ROOT/archive-move-window-$scenario.log"
  saved_watchdog_ticks=$WATCHDOG_TICKS
  case "$scenario" in
    destination-replaced-after-staging|source-recreated-after-staging) WATCHDOG_TICKS=60 ;;
  esac
  if run_portable_watchdog "$output_file" run_external_archive_move_window "$repo" "$EXTERNAL_DECISION_TUPLE" "$scenario" "$state_dir"; then
    WATCHDOG_TICKS=$saved_watchdog_ticks
    record_archive_ownership_canary_gap "$label unexpectedly succeeded"
  fi
  test "$WATCHDOG_RESULT" != timed_out || record_archive_ownership_canary_gap "$label exceeded the portable watchdog"
  WATCHDOG_TICKS=$saved_watchdog_ticks
  archive_expect_direct_ref "$repo" refs/heads/local/archive "$EXTERNAL_DECISION_PARENT" "$label"
  case "$scenario" in
    after-source-mv)
      archive_expect_external_state "$repo" "$state_dir" after-move "$label"
      ;;
    after-chmod)
      archive_expect_external_state "$repo" "$state_dir" before "$label"
      ;;
    source-replaced-before-move)
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_REVIEW" "$state_dir" injected-review-source "$label"
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_REPORT" "$state_dir" before-report-source "$label"
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" source-competitor "$label"
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" before-report-destination "$label"
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE" "$state_dir" injected-archive-root "$label"
      archive_expect_path_state "$repo/$EXTERNAL_DECISION_REVIEW.original" "$state_dir" before-review-source "$label"
      archive_expect_index_state "$repo" "$EXTERNAL_DECISION_REVIEW" "$state_dir" before-review-source "$label"
      archive_expect_index_state "$repo" "$EXTERNAL_DECISION_REPORT" "$state_dir" before-report-source "$label"
      archive_expect_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" before-review-destination "$label"
      archive_expect_index_state "$repo" "$EXTERNAL_DECISION_ARCHIVE/pr_7_report.md" "$state_dir" before-report-destination "$label"
      ;;
    destination-replaced-after-staging|source-recreated-after-staging)
      if test "$scenario" = destination-replaced-after-staging; then
        archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md" "$state_dir" injected-destination "$label"
        archive_expect_path_state "$repo/$EXTERNAL_DECISION_ARCHIVE/pr_7_review.md.owned" "$state_dir" owned-destination "$label"
      else
        archive_expect_external_state "$repo" "$state_dir" injected "$label"
      fi
      ;;
    *) fail "unknown $label" ;;
  esac
}

archive_put_competing_index_entry() {
  local repo=$1 path=$2 content=$3 blob
  blob="$(printf '%s\n' "$content" | GIT_MASTER=1 git -C "$repo" hash-object -w --stdin)" || return 1
  GIT_MASTER=1 git -C "$repo" update-index --add --cacheinfo "100644,$blob,$path"
}

run_archive_rollback_ownership_window() (
  local repo=$1 scenario=$2 state_dir=$3 canary_source_path=review.md canary_destination_path=archives/review.md archive_root=archives pre_source_tree
  cd "$repo" || exit 1
  REPO_ROOT=$repo
  ARCHIVE=$archive_root
  BRANCH_REF="$(GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet HEAD)" || exit 1
  ARCHIVE_BRANCH_REF=$BRANCH_REF
  PARENT_OID="$(GIT_MASTER=1 git -C "$repo" rev-parse "$ARCHIVE_BRANCH_REF")" || exit 1
  HEAD_COMMIT="$(make_archive_publish_oid "$repo")" || exit 1
  COMMIT_SUCCEEDED=0
  ARCHIVE_CREATED=0
  case "$scenario" in unknown-*) ARCHIVE_CREATED=1 ;; esac
  SOURCES=("$canary_source_path")
  DESTINATIONS=("$canary_destination_path")
  MOVED=(1)
  OWNERSHIP_CAPTURED=(1)
  POST_STAGE_OWNERSHIP=(1)
  POST_STAGE_INDEX_OWNERSHIP=(1)
  CURRENT_DESTINATION_MODES=(644)
  ORIGINAL_MODES=(600)
  INDEX_PATHS=("$canary_source_path" "$canary_destination_path")
  SOURCE_DEVICE_INODES=("$(stat -f '%d:%i' -- "$repo/$canary_destination_path")")
  SOURCE_UIDS=("$(stat -f '%u' -- "$repo/$canary_destination_path")")
  SOURCE_LINKS=("$(stat -f '%l' -- "$repo/$canary_destination_path")")
  SOURCE_SHA256=("$(shasum -a 256 "$repo/$canary_destination_path" | cut -d' ' -f1)")
  SOURCE_BYTES=("$(wc -c < "$repo/$canary_destination_path" | tr -d ' ')")
  SOURCE_STATES=(tracked)
  pre_source_tree="$(GIT_MASTER=1 git -C "$repo" ls-tree HEAD -- "$canary_source_path")" || exit 1
  pre_source_tree="${pre_source_tree/ blob / }"
  PRE_SOURCE_INDEX_ENTRIES=("${pre_source_tree/$'\t'/ 0$'\t'}")
  PRE_DESTINATION_INDEX_ENTRIES=("")
  PRE_SOURCE_INDEX_CAPTURED=(1)
  PRE_DESTINATION_INDEX_CAPTURED=(1)
  OWNED_DESTINATION_SHA256=("$(shasum -a 256 "$repo/$canary_destination_path" | cut -d' ' -f1)")
  OWNED_DESTINATION_BYTES=("$(wc -c < "$repo/$canary_destination_path" | tr -d ' ')")
  OWNED_DESTINATION_MODES=(644)
  OWNED_DESTINATION_LINKS=(1)
  OWNED_DESTINATION_INDEX_ENTRIES=("$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- "$canary_destination_path")")
  OWNED_SOURCE_INDEX_ENTRIES=("$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- "$canary_source_path")")
  REF_ADVANCED=0
  REF_ROLLED_BACK=0
  ROLLBACK_COMPLETED=0
  ARCHIVE_RESET_INJECTED=0
  ARCHIVE_ROOT_IDENTITY="$(stat -f '%d:%i' -- "$repo/$archive_root")"
  ARCHIVE_ROOT_UID="$(stat -f '%u' -- "$repo/$archive_root")"
  ARCHIVE_ROOT_MODE="$(stat -f '%Lp' -- "$repo/$archive_root")"
  ARCHIVE_ROOT_OWNERSHIP_CAPTURED=1
  source "$TMP_ROOT/archive-step5-classify-ref.sh"
  source "$TMP_ROOT/archive-step5-rollback-state.sh"
  source "$TMP_ROOT/archive-step5-reset-owned-index.sh"
  source "$TMP_ROOT/archive-step5-restore-owned-destination.sh"
  source "$TMP_ROOT/archive-step5-rollback.sh"

  git() {
    local argument last_argument= status
    archive_git_command_name "$@"
    for argument in "$@"; do last_argument=$argument; done
    if test "$ARCHIVE_GIT_COMMAND" = reset; then
      case "$scenario" in
        source-index-drift-before-reset)
          if test "$ARCHIVE_RESET_INJECTED" = 0; then
            archive_put_competing_index_entry "$repo" "$canary_source_path" 'competing source index entry' || return 1
            ARCHIVE_RESET_INJECTED=1
            archive_capture_owned_pair_state "$repo" "$state_dir" injected "$canary_source_path" "$canary_destination_path" "$archive_root" || return 1
          fi
          ;;
        destination-index-drift-before-reset)
          if test "$ARCHIVE_RESET_INJECTED" = 0; then
            archive_put_competing_index_entry "$repo" "$canary_destination_path" 'competing destination index entry' || return 1
            ARCHIVE_RESET_INJECTED=1
            archive_capture_owned_pair_state "$repo" "$state_dir" injected "$canary_source_path" "$canary_destination_path" "$archive_root" || return 1
          fi
          ;;
        post-reset-drift|post-reset-failure)
          if test "$last_argument" = "$canary_destination_path"; then
            command git "$@"
            status=$?
            test "$status" = 0 || return "$status"
            if test "$ARCHIVE_RESET_INJECTED" = 0; then
              command mv -- "$repo/$canary_destination_path" "$repo/$canary_destination_path.owned" || return 1
              archive_capture_path_state "$repo/$canary_destination_path.owned" "$state_dir" owned-destination || return 1
              printf 'competing post-reset destination\n' > "$repo/$canary_destination_path" || return 1
              command chmod 600 "$repo/$canary_destination_path" || return 1
              ARCHIVE_RESET_INJECTED=1
              archive_capture_owned_pair_state "$repo" "$state_dir" injected "$canary_source_path" "$canary_destination_path" "$archive_root" || return 1
            fi
            if test "$scenario" = post-reset-failure; then return 97; fi
            return 0
          fi
          ;;
      esac
    fi
    command git "$@"
  }

  mv() {
    local first_argument=${1:-} second_argument=${2:-}
    if test "$first_argument" = --; then first_argument=${2:-}; second_argument=${3:-}; fi
    if test "$scenario" = destination-replaced-before-reverse-move && test "$ARCHIVE_RESET_INJECTED" = 0; then
      command mv -- "$first_argument" "$first_argument.owned" || return 1
      archive_capture_path_state "$first_argument.owned" "$state_dir" owned-destination || return 1
      printf 'competing reverse-move destination\n' > "$first_argument" || return 1
      command chmod 600 "$first_argument" || return 1
      ARCHIVE_RESET_INJECTED=1
      archive_capture_owned_pair_state "$repo" "$state_dir" injected "$canary_source_path" "$canary_destination_path" "$archive_root" || return 1
    fi
    command mv "$@"
  }

  rollback_archive
)

assert_archive_rollback_ownership_window() {
  local scenario=$1 unknown_kind=${2:-} repo state_dir output_file branch_ref parent label unknown_path
  label="archive rollback $scenario"
  repo="$(new_hook_canary_repo "archive-rollback-$scenario")"
  setup_archive_rollback_drift_repo "$repo" nominal
  branch_ref="$(GIT_MASTER=1 git -C "$repo" symbolic-ref --quiet HEAD)" || fail "could not read $label branch"
  parent="$(GIT_MASTER=1 git -C "$repo" rev-parse "$branch_ref")" || fail "could not read $label parent"
  state_dir="$repo/.git/archive-rollback-state"
  mkdir "$state_dir" || fail "could not create $label state directory"
  case "$scenario" in
    unknown-regular) unknown_path=archives/unapproved ;;
    unknown-hidden) unknown_path=archives/.unapproved ;;
    unknown-symlink) unknown_path=archives/unapproved-link ;;
    unknown-nested) unknown_path=archives/unapproved/nested ;;
    *) unknown_path= ;;
  esac
  case "$scenario" in
    unknown-regular|unknown-hidden)
      printf 'unknown archive descendant\n' > "$repo/$unknown_path" || fail "could not create $label competitor"
      chmod 600 "$repo/$unknown_path" || fail "could not set $label competitor mode"
      ;;
    unknown-symlink)
      ln -s ../initial "$repo/$unknown_path" || fail "could not create $label competitor"
      ;;
    unknown-nested)
      mkdir "$repo/archives/unapproved" || fail "could not create $label nested parent"
      printf 'unknown nested archive descendant\n' > "$repo/$unknown_path" || fail "could not create $label competitor"
      chmod 600 "$repo/$unknown_path" || fail "could not set $label competitor mode"
      ;;
  esac
  archive_capture_owned_pair_state "$repo" "$state_dir" before review.md archives/review.md archives || fail "could not capture $label baseline"
  if test -n "$unknown_path"; then archive_capture_path_state "$repo/$unknown_path" "$state_dir" unknown || fail "could not capture $label competitor"; fi
  output_file="$TMP_ROOT/archive-rollback-$scenario.log"
  if run_portable_watchdog "$output_file" run_archive_rollback_ownership_window "$repo" "$scenario" "$state_dir"; then
    record_archive_ownership_canary_gap "$label unexpectedly succeeded"
  fi
  test "$WATCHDOG_RESULT" != timed_out || record_archive_ownership_canary_gap "$label exceeded the portable watchdog"
  archive_expect_direct_ref "$repo" "$branch_ref" "$parent" "$label"
  case "$scenario" in
    source-index-drift-before-reset|destination-index-drift-before-reset|destination-replaced-before-reverse-move|post-reset-drift)
      archive_expect_owned_pair_state "$repo" "$state_dir" injected review.md archives/review.md archives "$label"
      case "$scenario" in
        destination-replaced-before-reverse-move|post-reset-drift)
          archive_expect_path_state "$repo/archives/review.md.owned" "$state_dir" owned-destination "$label"
          ;;
      esac
      ;;
    post-reset-failure)
      archive_expect_owned_pair_state "$repo" "$state_dir" injected review.md archives/review.md archives "$label"
      archive_expect_path_state "$repo/archives/review.md.owned" "$state_dir" owned-destination "$label"
      ;;
    unknown-*)
      archive_expect_owned_pair_state "$repo" "$state_dir" before review.md archives/review.md archives "$label"
      archive_expect_path_state "$repo/$unknown_path" "$state_dir" unknown "$label"
      ;;
    *) fail "unknown $label" ;;
  esac
}

run_archive_postpublication_rollback() (
  local repo=$1 parent_oid=$2 new_oid=$3 scenario=$4 state_dir=$5 third_oid=${6:-} target_ref=refs/heads/archive-postpublication-competitor pre_source_tree
  cd "$repo" || exit 1
  REPO_ROOT=$repo
  ARCHIVE=archives
  ARCHIVE_BRANCH_REF=refs/heads/local/archive
  HEAD_COMMIT=$new_oid
  PARENT_OID=$parent_oid
  COMMIT_SUCCEEDED=0
  REF_ADVANCED=1
  REF_ROLLED_BACK=0
  ROLLBACK_COMPLETED=0
  ARCHIVE_CREATED=0
  SOURCES=(review.md)
  DESTINATIONS=(archives/review.md)
  MOVED=(1)
  OWNERSHIP_CAPTURED=(1)
  POST_STAGE_OWNERSHIP=(1)
  POST_STAGE_INDEX_OWNERSHIP=(1)
  CURRENT_DESTINATION_MODES=(644)
  ORIGINAL_MODES=(600)
  INDEX_PATHS=(review.md archives/review.md)
  SOURCE_DEVICE_INODES=("$(stat -f '%d:%i' -- "$repo/archives/review.md")")
  SOURCE_UIDS=("$(stat -f '%u' -- "$repo/archives/review.md")")
  SOURCE_LINKS=("$(stat -f '%l' -- "$repo/archives/review.md")")
  SOURCE_SHA256=("$(shasum -a 256 "$repo/archives/review.md" | cut -d' ' -f1)")
  SOURCE_BYTES=("$(wc -c < "$repo/archives/review.md" | tr -d ' ')")
  SOURCE_STATES=(tracked)
  pre_source_tree="$(GIT_MASTER=1 git -C "$repo" ls-tree "$parent_oid" -- review.md)" || exit 1
  pre_source_tree="${pre_source_tree/ blob / }"
  PRE_SOURCE_INDEX_ENTRIES=("${pre_source_tree/$'\t'/ 0$'\t'}")
  PRE_DESTINATION_INDEX_ENTRIES=("")
  PRE_SOURCE_INDEX_CAPTURED=(1)
  PRE_DESTINATION_INDEX_CAPTURED=(1)
  OWNED_DESTINATION_SHA256=("$(shasum -a 256 "$repo/archives/review.md" | cut -d' ' -f1)")
  OWNED_DESTINATION_BYTES=("$(wc -c < "$repo/archives/review.md" | tr -d ' ')")
  OWNED_DESTINATION_MODES=(644)
  OWNED_DESTINATION_LINKS=(1)
  OWNED_DESTINATION_INDEX_ENTRIES=("$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- archives/review.md)")
  OWNED_SOURCE_INDEX_ENTRIES=("$(GIT_MASTER=1 git -C "$repo" ls-files --stage -- review.md)")
  source "$TMP_ROOT/archive-direct-ref.sh"
  source "$TMP_ROOT/archive-update-transaction.sh"
  source "$TMP_ROOT/archive-step5-classify-ref.sh"
  source "$TMP_ROOT/archive-step5-rollback-state.sh"
  source "$TMP_ROOT/archive-step5-reset-owned-index.sh"
  source "$TMP_ROOT/archive-step5-restore-owned-destination.sh"
  source "$TMP_ROOT/archive-step5-rollback.sh"
  ARCHIVE_TRANSACTION_STATUS=96
  archive_classify_transaction_ref "$HEAD_COMMIT" "$PARENT_OID" || exit 1
  test "$ARCHIVE_REF_CLASS" = exact-new || exit 1
  REF_ADVANCED=1
  case "$scenario" in
    cleanup-exact-created) ARCHIVE_TRANSACTION_STATUS=97 ;;
    competing-direct|cleanup-competing-direct)
      if test "$scenario" = cleanup-competing-direct; then ARCHIVE_TRANSACTION_STATUS=97; fi
      GIT_MASTER=1 git -C "$repo" update-ref "$ARCHIVE_BRANCH_REF" "$third_oid" "$HEAD_COMMIT" || exit 1
      archive_capture_owned_pair_state "$repo" "$state_dir" expected review.md archives/review.md archives || exit 1
      ;;
    symbolic-ref)
      GIT_MASTER=1 git -C "$repo" update-ref "$target_ref" "$PARENT_OID" || exit 1
      GIT_MASTER=1 git -C "$repo" symbolic-ref "$ARCHIVE_BRANCH_REF" "$target_ref" || exit 1
      archive_capture_owned_pair_state "$repo" "$state_dir" expected review.md archives/review.md archives || exit 1
      ;;
    exact-created-destination-drift)
      command mv -- "$repo/archives/review.md" "$repo/archives/review.md.owned" || exit 1
      printf 'postpublication destination competitor\n' > "$repo/archives/review.md" || exit 1
      command chmod 600 "$repo/archives/review.md" || exit 1
      archive_capture_owned_pair_state "$repo" "$state_dir" drift review.md archives/review.md archives || exit 1
      archive_capture_path_state "$repo/archives/review.md.owned" "$state_dir" owned-destination || exit 1
      ;;
    exact-created-index-drift)
      drift_blob="$(printf 'postpublication index competitor\n' | GIT_MASTER=1 git -C "$repo" hash-object -w --stdin)" || exit 1
      GIT_MASTER=1 git -C "$repo" update-index --add --cacheinfo "100644,$drift_blob,archives/review.md" || exit 1
      archive_capture_owned_pair_state "$repo" "$state_dir" drift review.md archives/review.md archives || exit 1
      ;;
    exact-created-direct) ;;
    *) exit 1 ;;
  esac
  case "$scenario" in
    cleanup-*) test "$ARCHIVE_TRANSACTION_STATUS" = 97 || exit 1 ;;
    *) test "$ARCHIVE_TRANSACTION_STATUS" = 96 || exit 1 ;;
  esac
  set +e
  (exit 97)
  rollback_archive
)

assert_archive_postpublication_rollback_case() {
  local scenario=$1 repo state_dir output_file parent_oid new_oid third_oid= target_ref=refs/heads/archive-postpublication-competitor label
  label="archive post-publication $scenario"
  repo="$(new_hook_canary_repo "archive-postpublication-$scenario")"
  GIT_MASTER=1 git -C "$repo" branch -M local/archive
  setup_archive_rollback_drift_repo "$repo" nominal
  parent_oid="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/archive)" || fail "could not read $label parent"
  new_oid="$(make_archive_publish_oid "$repo")" || fail "could not create $label exact-created OID"
  case "$scenario" in competing-direct|cleanup-competing-direct) third_oid="$(make_third_party_oid "$repo")" || fail "could not create $label competing OID" ;; esac
  GIT_MASTER=1 git -C "$repo" update-ref refs/heads/local/archive "$new_oid" "$parent_oid" || fail "could not create $label ref"
  state_dir="$repo/.git/archive-postpublication-state"
  mkdir "$state_dir" || fail "could not create $label state directory"
  case "$scenario" in
    exact-created-direct|cleanup-exact-created)
      archive_capture_restored_rollback_state "$repo" "$state_dir" expected "$parent_oid" || fail "could not capture $label restored state"
      ;;
    competing-direct|cleanup-competing-direct|symbolic-ref|exact-created-destination-drift|exact-created-index-drift) ;;
    *) fail "unknown $label" ;;
  esac
  output_file="$TMP_ROOT/archive-postpublication-$scenario.log"
  if run_portable_watchdog "$output_file" run_archive_postpublication_rollback "$repo" "$parent_oid" "$new_oid" "$scenario" "$state_dir" "$third_oid"; then
    record_archive_ownership_canary_gap "$label unexpectedly succeeded"
  fi
  test "$WATCHDOG_RESULT" != timed_out || record_archive_ownership_canary_gap "$label exceeded the portable watchdog"
  case "$scenario" in
    exact-created-direct|cleanup-exact-created)
      archive_expect_direct_ref "$repo" refs/heads/local/archive "$parent_oid" "$label"
      archive_expect_owned_pair_state "$repo" "$state_dir" expected review.md archives/review.md archives "$label"
      ;;
    exact-created-destination-drift|exact-created-index-drift)
      archive_expect_direct_ref "$repo" refs/heads/local/archive "$new_oid" "$label"
      archive_expect_owned_pair_state "$repo" "$state_dir" drift review.md archives/review.md archives "$label"
      if test "$scenario" = exact-created-destination-drift; then
        archive_expect_path_state "$repo/archives/review.md.owned" "$state_dir" owned-destination "$label"
      fi
      ;;
    competing-direct|cleanup-competing-direct)
      archive_expect_direct_ref "$repo" refs/heads/local/archive "$third_oid" "$label"
      archive_expect_owned_pair_state "$repo" "$state_dir" expected review.md archives/review.md archives "$label"
      ;;
    symbolic-ref)
      archive_expect_symbolic_ref "$repo" refs/heads/local/archive "$target_ref" "$parent_oid" "$label"
      archive_expect_owned_pair_state "$repo" "$state_dir" expected review.md archives/review.md archives "$label"
      ;;
  esac
  case "$scenario" in
    cleanup-*)
      test "$new_oid" != "$parent_oid" || record_archive_ownership_canary_gap "$label did not retain a distinct exact-created OID"
      ;;
  esac
}

assert_archive_move_and_rollback_ownership_canaries() {
  local scenario
  extract_archive_transaction_function_from_step5 validate_archive_rollback_state "$TMP_ROOT/archive-step5-rollback-state.sh" || record_archive_ownership_canary_gap 'missing Step 5 validate_archive_rollback_state helper'
  extract_archive_transaction_function_from_step5 archive_reset_owned_index_paths "$TMP_ROOT/archive-step5-reset-owned-index.sh" || record_archive_ownership_canary_gap 'missing Step 5 archive_reset_owned_index_paths helper'
  extract_archive_transaction_function_from_step5 archive_restore_owned_destination "$TMP_ROOT/archive-step5-restore-owned-destination.sh" || record_archive_ownership_canary_gap 'missing Step 5 archive_restore_owned_destination helper'
  extract_archive_transaction_function_from_step5 rollback_archive "$TMP_ROOT/archive-step5-rollback.sh" || record_archive_ownership_canary_gap 'missing Step 5 rollback_archive helper'
  extract_archive_transaction_function_from_step5 archive_classify_transaction_ref "$TMP_ROOT/archive-step5-classify-ref.sh" || record_archive_ownership_canary_gap 'missing Step 5 archive_classify_transaction_ref helper'
  if ! extract_external_archive_execution_fence; then
    record_archive_ownership_canary_gap 'could not extract the Step 5 archive execution fence'
    return 0
  fi
  if test -s "$TMP_ROOT/archive-step5-rollback-state.sh" && test -s "$TMP_ROOT/archive-step5-reset-owned-index.sh" && test -s "$TMP_ROOT/archive-step5-restore-owned-destination.sh" && test -s "$TMP_ROOT/archive-step5-rollback.sh" && test -s "$TMP_ROOT/archive-step5-classify-ref.sh"; then
    for scenario in after-source-mv after-chmod source-replaced-before-move destination-replaced-after-staging source-recreated-after-staging; do
      assert_external_archive_move_window "$scenario"
    done
    for scenario in source-index-drift-before-reset destination-index-drift-before-reset destination-replaced-before-reverse-move post-reset-failure post-reset-drift unknown-regular unknown-hidden unknown-symlink unknown-nested; do
      assert_archive_rollback_ownership_window "$scenario"
    done
    for scenario in exact-created-direct exact-created-destination-drift exact-created-index-drift competing-direct symbolic-ref cleanup-exact-created cleanup-competing-direct; do
      assert_archive_postpublication_rollback_case "$scenario"
    done
  fi
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
TASK_REGISTER_SKILL="$REPO_ROOT/mydocs/skills/task-register/SKILL.md"
STAGE_SKILL="$REPO_ROOT/mydocs/skills/task-stage-report/SKILL.md"
CLEANUP_SKILL="$REPO_ROOT/mydocs/skills/pr-merge-cleanup/SKILL.md"
WORKFLOW_MANUAL="$REPO_ROOT/mydocs/manual/task_workflow_guide.md"
EXTERNAL_GUIDE="$REPO_ROOT/mydocs/manual/external_pr_review_guide.md"
PR_README="$REPO_ROOT/mydocs/pr/README.md"
GIT_WORKFLOW_MANUAL="$REPO_ROOT/mydocs/manual/git_workflow_guide.md"
assert_external_decision_reads_are_checked || fail 'external review contains an unchecked Git decision read'
pass 'external review fences reject unchecked Git substitutions and assignments'
assert_absent "$START_SKILL" 'gh repo view "$CANONICAL_REPOSITORY" --json databaseId'
if rg -n -- '--slurp[^\n]*--jq' "$FINAL_SKILL"; then fail 'slurp and gh jq are combined'; fi
assert_contains "$FINAL_SKILL" 'graphql --paginate --slurp'
assert_contains "$FINAL_SKILL" 'closingIssuesReferences(first: 100, after: $endCursor)'
assert_contains "$FINAL_SKILL" 'chmod 600 "$PUBLICATION_DIR/title" "$PUBLICATION_DIR/body"'
assert_contains "$FINAL_SKILL" '0[0-8b-f]'
assert_contains "$AGENTS_FILE" 'PR merge만으로 close를 승인하지 않으며'
assert_contains "$AGENTS_FILE" '타스크 진행 16단계'
assert_contains "$TASK_REGISTER_SKILL" 'IFS= read -r SEARCH_QUERY < "$SEARCH_QUERY_FILE"'
assert_contains "$TASK_REGISTER_SKILL" '--search "$SEARCH_QUERY"'
assert_absent "$TASK_REGISTER_SKILL" 'eval '
assert_contains "$STAGE_SKILL" 'stage_commit_fence() {'
assert_contains "$STAGE_SKILL" 'EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")'
assert_contains "$STAGE_SKILL" 'stage_validate_document_identity() {'
assert_contains "$STAGE_SKILL" 'DOCUMENT_PATH="$STAGE_REPORT_PATH"'
assert_contains "$STAGE_SKILL" 'export GIT_LITERAL_PATHSPECS=1'
assert_contains "$STAGE_SKILL" 'stage_validate_literal_path() {'
  assert_contains "$STAGE_SKILL" 'stage_validate_file_operand() {'
  assert_contains "$STAGE_SKILL" 'stage_validate_file_operand "$expected_path" || exit 1'
  assert_contains "$STAGE_SKILL" 'if test -d "$operand"; then'
  assert_contains "$STAGE_SKILL" 'if test -e "$operand"; then'
  assert_contains "$STAGE_SKILL" 'tracked_entries="$(git ls-files --stage -- "$operand")" || return 1'
  assert_contains "$STAGE_SKILL" 'case "$tracked_mode" in 100644|100755|120000) ;; *) return 1 ;; esac'
  assert_contains "$STAGE_SKILL" 'EXPECTED_STAGE_OPERAND_KINDS+=("$VALIDATED_OPERAND_KIND")'
  assert_contains "$STAGE_SKILL" 'stage_validate_expected_operand_kinds || return 1'
  assert_contains "$STAGE_SKILL" 'test "$tracked_tail" = "0"$'"'"'\t'"'"'"$operand" || return 1'
  assert_contains "$STAGE_SKILL" '*[!A-Za-z0-9._/-]*) return 1 ;;'
  assert_contains "$STAGE_SKILL" 'stage_update_exact_index_operand() {'
  assert_contains "$STAGE_SKILL" 'git update-index --add -- "$operand" || return 1'
  assert_contains "$STAGE_SKILL" 'git update-index --force-remove -- "$operand" || return 1'
  assert_contains "$STAGE_SKILL" 'stage_validate_direct_branch_ref() {'
  assert_contains "$STAGE_SKILL" 'if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then'
  assert_contains "$STAGE_SKILL" "DIRECT_REF_RECORD=\"\$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' \"\$BRANCH_REF\")\" || return 1"
  assert_contains "$STAGE_SKILL" 'git commit-tree "$STAGED_TREE" -p "$PARENT_COMMIT"'
  assert_contains "$STAGE_SKILL" 'stage_update_branch_ref_transaction() {'
  assert_contains "$STAGE_SKILL" 'option no-deref'
  assert_contains "$STAGE_SKILL" 'exec 8<> "$REF_TRANSACTION_INPUT_PIPE"'
  assert_contains "$STAGE_SKILL" 'exec 8>&-'
  assert_contains "$STAGE_SKILL" 'exec 3> "$REF_TRANSACTION_INPUT_PIPE"'
  assert_contains "$STAGE_SKILL" 'REF_TRANSACTION_GIT="$(type -P git)" || return 1'
  assert_contains "$STAGE_SKILL" 'exec "$REF_TRANSACTION_GIT" update-ref --stdin < "$REF_TRANSACTION_INPUT_PIPE" > "$REF_TRANSACTION_RESPONSE_FILE" 2> "$REF_TRANSACTION_ERROR_FILE"'
  assert_contains "$STAGE_SKILL" 'test "$REF_TRANSACTION_PGID" = "$REF_TRANSACTION_PID" || return 1'
  assert_contains "$STAGE_SKILL" 'mv -- "$REF_TRANSACTION_DIR" "$REF_TRANSACTION_CLEANUP_DIR" 2>/dev/null || return 1'
  assert_absent "$STAGE_SKILL" 'rm -rf -- "$REF_TRANSACTION_DIR"'
  assert_contains "$STAGE_SKILL" 'if ! stage_wait_transaction_lines 2 $'"'"'start: ok\nprepare: ok'"'"' || ! (exec 3>&-; stage_validate_direct_branch_ref "$old_oid"); then'
  assert_contains "$STAGE_SKILL" "(trap '' PIPE; printf 'abort\\n' >&3) || :"
  assert_contains "$STAGE_SKILL" '(exec 3>&-; stage_validate_direct_branch_ref "$old_oid")'
  assert_contains "$STAGE_SKILL" 'ps -p "$REF_TRANSACTION_PID" -o state='
  assert_absent "$STAGE_SKILL" 'REF_TRANSACTION_OUTPUT_PIPE'
  assert_contains "$STAGE_SKILL" 'stage_validate_direct_branch_ref "$new_oid" && return 0'
  assert_absent "$STAGE_SKILL" 'git update-ref --no-deref "$BRANCH_REF"'
  assert_absent "$STAGE_SKILL" 'git add --'
assert_contains "$STAGE_SKILL" 'stage_verify_committed_state || stage_rollback_commit_fence'
assert_contains "$STAGE_SKILL" 'STAGED_TREE="$(git write-tree)"'
assert_contains "$STAGE_SKILL" 'git diff-tree --no-commit-id --name-only -r --no-renames "$COMMIT_OID"'
assert_contains "$WORKFLOW_MANUAL" 'implementation_plan_commit_fence() {'
assert_contains "$WORKFLOW_MANUAL" 'EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")'
assert_contains "$WORKFLOW_MANUAL" 'plan_validate_document_identity() {'
assert_contains "$WORKFLOW_MANUAL" 'DOCUMENT_PATH="$IMPLEMENTATION_PLAN_PATH"'
assert_contains "$WORKFLOW_MANUAL" 'export GIT_LITERAL_PATHSPECS=1'
assert_contains "$WORKFLOW_MANUAL" 'plan_validate_literal_path() {'
  assert_contains "$WORKFLOW_MANUAL" 'plan_validate_file_operand() {'
  assert_contains "$WORKFLOW_MANUAL" 'plan_validate_file_operand "$expected_path" || exit 1'
  assert_contains "$WORKFLOW_MANUAL" 'if test -d "$operand"; then'
  assert_contains "$WORKFLOW_MANUAL" 'if test -e "$operand"; then'
  assert_contains "$WORKFLOW_MANUAL" 'tracked_entries="$(git ls-files --stage -- "$operand")" || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'case "$tracked_mode" in 100644|100755|120000) ;; *) return 1 ;; esac'
  assert_contains "$WORKFLOW_MANUAL" 'EXPECTED_IMPL_PLAN_OPERAND_KINDS+=("$VALIDATED_OPERAND_KIND")'
  assert_contains "$WORKFLOW_MANUAL" 'plan_validate_expected_operand_kinds || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'test "$tracked_tail" = "0"$'"'"'\t'"'"'"$operand" || return 1'
  assert_contains "$WORKFLOW_MANUAL" '*[!A-Za-z0-9._/-]*) return 1 ;;'
  assert_contains "$WORKFLOW_MANUAL" 'plan_update_exact_index_operand() {'
  assert_contains "$WORKFLOW_MANUAL" 'git update-index --add -- "$operand" || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'git update-index --force-remove -- "$operand" || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'plan_validate_direct_branch_ref() {'
  assert_contains "$WORKFLOW_MANUAL" 'if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then'
  assert_contains "$WORKFLOW_MANUAL" "DIRECT_REF_RECORD=\"\$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' \"\$BRANCH_REF\")\" || return 1"
  assert_contains "$WORKFLOW_MANUAL" 'git commit-tree "$STAGED_TREE" -p "$PARENT_COMMIT"'
  assert_contains "$WORKFLOW_MANUAL" 'plan_update_branch_ref_transaction() {'
  assert_contains "$WORKFLOW_MANUAL" 'option no-deref'
  assert_contains "$WORKFLOW_MANUAL" 'exec 8<> "$REF_TRANSACTION_INPUT_PIPE"'
  assert_contains "$WORKFLOW_MANUAL" 'exec 8>&-'
  assert_contains "$WORKFLOW_MANUAL" 'exec 3> "$REF_TRANSACTION_INPUT_PIPE"'
  assert_contains "$WORKFLOW_MANUAL" 'REF_TRANSACTION_GIT="$(type -P git)" || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'exec "$REF_TRANSACTION_GIT" update-ref --stdin < "$REF_TRANSACTION_INPUT_PIPE" > "$REF_TRANSACTION_RESPONSE_FILE" 2> "$REF_TRANSACTION_ERROR_FILE"'
  assert_contains "$WORKFLOW_MANUAL" 'test "$REF_TRANSACTION_PGID" = "$REF_TRANSACTION_PID" || return 1'
  assert_contains "$WORKFLOW_MANUAL" 'mv -- "$REF_TRANSACTION_DIR" "$REF_TRANSACTION_CLEANUP_DIR" 2>/dev/null || return 1'
  assert_absent "$WORKFLOW_MANUAL" 'rm -rf -- "$REF_TRANSACTION_DIR"'
assert_contains "$WORKFLOW_MANUAL" 'if ! plan_wait_transaction_lines 2 $'"'"'start: ok\nprepare: ok'"'"' || ! (exec 3>&-; plan_validate_direct_branch_ref "$old_oid"); then'
assert_contains "$STAGE_SKILL" "(trap '' PIPE; printf 'start\\noption no-deref"
assert_contains "$WORKFLOW_MANUAL" "(trap '' PIPE; printf 'start\\noption no-deref"
assert_contains "$EXTERNAL_SKILL" "(trap '' PIPE; printf 'start\\noption no-deref"
  assert_contains "$WORKFLOW_MANUAL" "(trap '' PIPE; printf 'abort\\n' >&3) || :"
  assert_contains "$WORKFLOW_MANUAL" '(exec 3>&-; plan_validate_direct_branch_ref "$old_oid")'
  assert_contains "$WORKFLOW_MANUAL" 'ps -p "$REF_TRANSACTION_PID" -o state='
  assert_absent "$WORKFLOW_MANUAL" 'REF_TRANSACTION_OUTPUT_PIPE'
  assert_contains "$WORKFLOW_MANUAL" 'plan_validate_direct_branch_ref "$new_oid" && return 0'
  assert_absent "$WORKFLOW_MANUAL" 'git update-ref --no-deref "$BRANCH_REF"'
  assert_absent "$WORKFLOW_MANUAL" 'git add --'
assert_contains "$WORKFLOW_MANUAL" 'plan_verify_committed_state || plan_rollback_commit_fence'
assert_contains "$WORKFLOW_MANUAL" 'STAGED_TREE="$(git write-tree)"'
assert_contains "$WORKFLOW_MANUAL" 'git diff-tree --no-commit-id --name-only -r --no-renames "$COMMIT_OID"'
for canonical_commit_fence in "$STAGE_SKILL" "$WORKFLOW_MANUAL"; do
  assert_absent "$canonical_commit_fence" 'test -z "$(git'
  assert_contains "$canonical_commit_fence" 'REPLACE_REFS="$(git for-each-ref --format='"'"'%(refname)'"'"' refs/replace/)" || return 1'
  assert_contains "$canonical_commit_fence" 'STAGED_DIFF_CHECK_OUTPUT="$(git diff --cached --check)" || return 1'
  assert_contains "$canonical_commit_fence" 'DOCUMENT_METADATA="$(stat -f '"'"'%Lp %l'"'"' -- "$DOCUMENT_PATH")" || return 1'
  assert_contains "$canonical_commit_fence" 'test "$DOCUMENT_METADATA" = "644 1" || return 1'
  assert_contains "$canonical_commit_fence" 'STAGED_DOCUMENT_ENTRY="$(git ls-files --stage -- "$DOCUMENT_PATH")" || return 1'
  assert_contains "$canonical_commit_fence" 'WORKTREE_DOCUMENT_BLOB="$(git hash-object -- "$DOCUMENT_PATH")" || return 1'
  assert_contains "$canonical_commit_fence" 'validate_pre_ref_update || exit 1'
  assert_contains "$canonical_commit_fence" 'printf '\''%s\n'\'' "$COMMIT_OID"'
done
test "$(grep -Fc 'stage_validate_document_identity || return 1' "$STAGE_SKILL")" = 2 || fail 'stage post-ref document identity replay changed'
test "$(grep -Fc 'plan_validate_document_identity || return 1' "$WORKFLOW_MANUAL")" = 2 || fail 'plan post-ref document identity replay changed'
test "$(grep -Ec '이 절차에는 같은 스레드의 서로 다른 두 승인만 있다\.|1\. final report/evidence 승인:|2\. publication 승인:' "$FINAL_SKILL")" = 3 || fail 'approval contract changed'
assert_absent "$EXTERNAL_SKILL" 'graphql mutation'
assert_absent "$EXTERNAL_SKILL" '--method POST'
assert_absent "$EXTERNAL_SKILL" 'gh issue '
assert_absent "$EXTERNAL_SKILL" 'gh pr '
  assert_contains "$EXTERNAL_SKILL" 'gh api --method GET'
  assert_contains "$EXTERNAL_SKILL" 'reviewThreads(first:100,after:$endCursor){nodes{id,isResolved,isOutdated,comments(first:1){nodes{databaseId}}} pageInfo{hasNextPage,endCursor}}'
  assert_absent "$EXTERNAL_SKILL" 'comments(first:1){nodes{databaseId}} pageInfo{hasNextPage,endCursor}}'
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

SNAPSHOT_ARTIFACTS='before.repository.json before.pull.json before.issue-comments.json before.issue-timeline.json before.reviews.json before.review-comments.json before.review-threads.json before.check-runs.json before.statuses.json before.diff before.canonical.json after.repository.json after.pull.json after.issue-comments.json after.issue-timeline.json after.reviews.json after.review-comments.json after.review-threads.json after.check-runs.json after.statuses.json after.diff after.canonical.json'
export SNAPSHOT_ARTIFACTS
extract_archive_transaction_function_from_step5 archive_validate_direct_branch_ref "$TMP_ROOT/archive-direct-ref.sh" || :
extract_archive_transaction_function_from_step5 archive_update_branch_ref_transaction "$TMP_ROOT/archive-update-transaction.sh" || :
extract_archive_transaction_function_from_step5 archive_classify_transaction_ref "$TMP_ROOT/archive-classify-ref.sh" || :
extract_external_archive_contract claim_snapshot_root_for_cleanup "$TMP_ROOT/snapshot-root-claim.sh" || :
extract_external_archive_contract restore_snapshot_root_after_cleanup_failure "$TMP_ROOT/snapshot-root-restore.sh" || :
extract_external_archive_contract validate_archive_rollback_state "$TMP_ROOT/archive-rollback-state.sh" || :
extract_external_archive_contract archive_reset_owned_index_paths "$TMP_ROOT/archive-reset-owned-index.sh" || :
extract_external_archive_contract archive_restore_owned_destination "$TMP_ROOT/archive-restore-owned-destination.sh" || :
assert_external_archive_contract_absent 'git -C "$REPO_ROOT" commit --only' 'archive publication still uses non-CAS commit --only'
assert_external_archive_contract_text 'commit-tree' 'archive publication lacks commit-tree creation'
assert_external_archive_contract_text 'option no-deref' 'archive publication lacks no-deref transaction semantics'
assert_external_archive_contract_text 'update-ref --stdin' 'archive publication lacks exact-old ref transaction'
assert_archive_caller_classifies_before_fail
assert_external_archive_contract_absent 'rm -- "$SNAPSHOT_ROOT/$artifact"' 'snapshot cleanup still deletes re-resolved paths without a root claim'
assert_external_archive_contract_absent 'git -C "$REPO_ROOT" reset -q -- "${INDEX_PATHS[@]}"' 'archive rollback still resets index paths without ownership replay'
assert_external_archive_contract_absent 'mv -- "$REPO_ROOT/$destination" "$REPO_ROOT/$source"' 'archive rollback still moves destinations without ownership replay'

extract_snapshot_function_from_section step1 validate_snapshot_membership "$TMP_ROOT/snapshot-membership.sh"
extract_snapshot_function_from_section step1 validate_snapshot_member "$TMP_ROOT/snapshot-member.sh"
extract_snapshot_function_from_section step1 claim_snapshot_root_for_cleanup "$TMP_ROOT/snapshot-root-claim.sh"
extract_snapshot_function_from_section step1 restore_snapshot_root_after_cleanup_failure "$TMP_ROOT/snapshot-root-restore.sh"
extract_snapshot_function_from_section step1 restore_claimed_snapshot_members "$TMP_ROOT/snapshot-claimed-restore.sh"
extract_snapshot_function_from_section step1 validate_present_snapshot_membership "$TMP_ROOT/snapshot-present-membership.sh"
extract_snapshot_function_from_section step1 remove_validated_snapshot_members "$TMP_ROOT/snapshot-remove-members.sh"
extract_snapshot_function_from_section step1 cleanup_snapshot_root "$TMP_ROOT/snapshot-cleanup.sh"
extract_snapshot_function_from_section step3 validate_snapshot_member "$TMP_ROOT/snapshot-step3-member.sh"
extract_snapshot_function_from_section step3 claim_snapshot_root_for_cleanup "$TMP_ROOT/snapshot-step3-root-claim.sh"
extract_snapshot_function_from_section step3 restore_snapshot_root_after_cleanup_failure "$TMP_ROOT/snapshot-step3-root-restore.sh"
extract_snapshot_function_from_section step3 restore_claimed_snapshot_members "$TMP_ROOT/snapshot-step3-claimed-restore.sh"
extract_snapshot_function_from_section step3 validate_snapshot_membership "$TMP_ROOT/snapshot-step3-membership.sh"
extract_snapshot_function_from_section step3 cleanup_snapshot_root "$TMP_ROOT/snapshot-step3-cleanup.sh"
extract_snapshot_function_from_section step1 cleanup_root "$TMP_ROOT/failure-cleanup-root.sh"
test "$(grep -Fc 'restore_snapshot_root_after_cleanup_failure() {' "$EXTERNAL_SKILL")" = 2 || fail 'snapshot restore helper definition count changed'
extract_function "$EXTERNAL_SKILL" rollback_archive 1 "$TMP_ROOT/archive-rollback.sh"
SNAPSHOT_CASE="$TMP_ROOT/archive-capture-snapshot-swap"
setup_snapshot_root "$SNAPSHOT_CASE"
assert_snapshot_swap_is_rejected run_snapshot_cleanup_with_swap "$SNAPSHOT_CASE" 'capture snapshot cleanup'
SNAPSHOT_CASE="$TMP_ROOT/archive-standalone-snapshot-swap"
setup_snapshot_root "$SNAPSHOT_CASE"
assert_snapshot_swap_is_rejected run_failure_cleanup_with_swap "$SNAPSHOT_CASE" 'standalone snapshot cleanup'
ARCHIVE_ROLLBACK_CANARY="$(new_hook_canary_repo archive-rollback-drift)"
setup_archive_rollback_drift_repo "$ARCHIVE_ROLLBACK_CANARY"
assert_archive_rollback_preserves_drift "$ARCHIVE_ROLLBACK_CANARY"
ARCHIVE_ROLLBACK_NOMINAL="$(new_hook_canary_repo archive-rollback-nominal)"
setup_archive_rollback_drift_repo "$ARCHIVE_ROLLBACK_NOMINAL" nominal
assert_archive_rollback_restores_owned_state "$ARCHIVE_ROLLBACK_NOMINAL"
if test -s "$TMP_ROOT/archive-update-transaction.sh"; then
  assert_archive_publication_transaction_canaries
  setup_archive_exact_ref_context archive-commit-cleanup-failure
  assert_archive_committed_transaction_failure_is_resolved run_archive_ref_transaction_with_commit_cleanup_failure "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" archive-commit-cleanup-failure
  setup_archive_exact_ref_context archive-commit-then-signal
  assert_archive_committed_transaction_failure_is_resolved run_archive_ref_transaction_with_commit_then_signal "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" archive-commit-then-signal
  setup_archive_exact_ref_context archive-commit-cleanup-symbolic
  assert_archive_committed_transaction_failure_preserves_symbolic_competitor run_archive_ref_transaction_with_commit_cleanup_failure "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" archive-commit-cleanup-failure
  setup_archive_exact_ref_context archive-post-wait-pgid-probe
  assert_archive_post_wait_pgid_probe_is_absent run_archive_ref_transaction_with_post_wait_pgid_probe "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" archive-post-wait-pgid-probe
  setup_archive_exact_ref_context archive-path-shim-orphan-child
  assert_archive_orphan_child_is_reaped "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" 'archive transaction PATH-shim lifecycle'
fi
if test -n "$EXTERNAL_ARCHIVE_FENCE_GAPS"; then
  fail "external archive/snapshot canary $EXTERNAL_ARCHIVE_FENCE_GAPS"
fi
pass 'external archive lifecycle, publication, snapshot cleanup, and rollback ownership fences reject competing state'

assert_external_archive_failed_git_read_table
pass 'external archive fences reject plausible and empty stdout from every nonzero decision-bearing Git read'

assert_archive_move_and_rollback_ownership_canaries
if test -n "$ARCHIVE_OWNERSHIP_CANARY_GAPS"; then
  fail "archive move/rollback ownership canary $ARCHIVE_OWNERSHIP_CANARY_GAPS"
fi
pass 'Step 5 archive move and rollback ownership canaries preserve exact filesystem, index, and ref competitors'

extract_function "$STAGE_SKILL" stage_commit_fence 1 "$TMP_ROOT/stage-commit-fence.sh"
extract_function "$WORKFLOW_MANUAL" implementation_plan_commit_fence 1 "$TMP_ROOT/impl-plan-commit-fence.sh"
extract_function "$WORKFLOW_MANUAL" plan_validate_file_operand 1 "$TMP_ROOT/plan-file-operand-validator.sh"
extract_function "$WORKFLOW_MANUAL" plan_update_exact_index_operand 1 "$TMP_ROOT/plan-exact-index-operand.sh"
assert_absent "$TMP_ROOT/stage-commit-fence.sh" 'test -z "$(git'
assert_absent "$TMP_ROOT/impl-plan-commit-fence.sh" 'test -z "$(git'
for extracted_commit_fence in "$TMP_ROOT/stage-commit-fence.sh" "$TMP_ROOT/impl-plan-commit-fence.sh"; do
  assert_contains "$extracted_commit_fence" 'LC_ALL=C sort <<< "$1"'
  assert_absent "$extracted_commit_fence" 'git commit --only'
  assert_absent "$extracted_commit_fence" 'git update-ref "$BRANCH_REF"'
  assert_absent "$extracted_commit_fence" 'git diff --cached --name-only --no-renames |'
  assert_absent "$extracted_commit_fence" 'git diff-tree --no-commit-id --name-only -r --no-renames "$COMMIT_OID" |'
done
assert_plan_rollback_rejects_bare_unconditional_update
assert_commit_fence_outer_signal_matrix

STAGE_CANARY="$(new_commit_fence_canary_repo stage-pre-staged)"
setup_stage_fence_inputs "$STAGE_CANARY"
printf 'unrelated staged change\n' >> "$STAGE_CANARY/initial"
GIT_MASTER=1 git -C "$STAGE_CANARY" add initial
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with a pre-staged unrelated path'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-membership-drift)"
setup_stage_fence_inputs "$STAGE_CANARY"
printf 'injected staged change\n' >> "$STAGE_CANARY/initial"
assert_fence_rejects_without_commit run_stage_commit_fence_with_staged_drift "$STAGE_CANARY" 'stage fence with staged membership drift'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-omitted-tracked)"
setup_stage_fence_inputs "$STAGE_CANARY"
printf 'omitted tracked change\n' >> "$STAGE_CANARY/initial"
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with an omitted tracked artifact'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-omitted-untracked)"
setup_stage_fence_inputs "$STAGE_CANARY"
printf 'omitted untracked artifact\n' > "$STAGE_CANARY/omitted-untracked.txt"
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with an omitted untracked artifact'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-read-only-query-failure)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_read_only_query_failure "$STAGE_CANARY" 'stage fence with an empty failed read-only query'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-whitespace-error)"
setup_stage_fence_inputs "$STAGE_CANARY"
printf 'trailing whitespace \n' >> "$STAGE_CANARY/src/stage-output.txt"
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with a staged whitespace error'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-pathspec-magic)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_pathspec_magic "$STAGE_CANARY" 'stage fence with pathspec magic'
assert_staged_path_set "$STAGE_CANARY" '' 'stage pathspec magic rejection'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-directory-operand)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_directory_operand "$STAGE_CANARY" 'stage fence with a directory operand'
assert_staged_path_set "$STAGE_CANARY" '' 'stage directory operand rejection'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-fifo-operand)"
setup_stage_fence_inputs "$STAGE_CANARY"
rm -- "$STAGE_CANARY/src/stage-output.txt"
mkfifo "$STAGE_CANARY/src/stage-output.txt"
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with a FIFO operand'
assert_staged_path_set "$STAGE_CANARY" '' 'stage FIFO operand rejection'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-index-directory-race)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_index_directory_race "$STAGE_CANARY" 'stage fence with a file-to-directory index race'
test -d "$STAGE_CANARY/src/stage-output.txt" || fail 'stage index race did not replace the validated file with a directory'
assert_staged_path_set "$STAGE_CANARY" '' 'stage index directory race rejection'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-preexisting-hardlink)"
setup_stage_fence_inputs "$STAGE_CANARY"
rm -- "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md"
ln "$STAGE_CANARY/initial" "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md"
assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" 'stage fence with a preexisting report hardlink'
assert_staged_path_set "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/stage-output.txt' 'stage pre-ref hardlink rejection'
for stage_document_kind in deleted symlink executable; do
  STAGE_CANARY="$(new_commit_fence_canary_repo "stage-report-$stage_document_kind")"
  setup_stage_fence_inputs "$STAGE_CANARY"
  case "$stage_document_kind" in
    deleted) rm -- "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md" ;;
    symlink) rm -- "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md"; ln -s initial "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md" ;;
    executable) chmod 755 "$STAGE_CANARY/mydocs/working/task_m100_7_stage1.md" ;;
  esac
  assert_fence_rejects_without_commit run_stage_commit_fence "$STAGE_CANARY" "stage fence with a $stage_document_kind report"
done
STAGE_CANARY="$(new_commit_fence_canary_repo stage-pre-ref-drift)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_pre_ref_worktree_drift "$STAGE_CANARY" 'stage fence with worktree drift after write-tree'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-forward-symref)"
setup_stage_fence_inputs "$STAGE_CANARY"
STAGE_PARENT="$(GIT_MASTER=1 git -C "$STAGE_CANARY" rev-parse HEAD)"
GIT_MASTER=1 git -C "$STAGE_CANARY" update-ref refs/heads/third-party "$STAGE_PARENT"
assert_fence_rejects_without_commit_with_argument run_stage_commit_fence_with_forward_symref "$STAGE_CANARY" refs/heads/third-party 'stage forward symref'
test "$(GIT_MASTER=1 git -C "$STAGE_CANARY" symbolic-ref refs/heads/local/task7)" = refs/heads/third-party || fail 'stage forward symref was overwritten'
assert_direct_ref_oid "$STAGE_CANARY" refs/heads/third-party "$STAGE_PARENT"
assert_staged_path_set "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/stage-output.txt' 'stage forward symref rejection'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-rollback-symref)"
setup_stage_fence_inputs "$STAGE_CANARY"
STAGE_PARENT="$(GIT_MASTER=1 git -C "$STAGE_CANARY" rev-parse HEAD)"
GIT_MASTER=1 git -C "$STAGE_CANARY" update-ref refs/heads/third-party "$STAGE_PARENT"
assert_fence_rejects_without_commit_with_argument run_stage_commit_fence_with_rollback_symref "$STAGE_CANARY" refs/heads/third-party 'stage rollback symref'
test "$(GIT_MASTER=1 git -C "$STAGE_CANARY" symbolic-ref refs/heads/local/task7)" = refs/heads/third-party || fail 'stage rollback replaced a competing symbolic ref'
assert_direct_ref_oid "$STAGE_CANARY" refs/heads/third-party "$STAGE_PARENT"
STAGE_CANARY="$(new_commit_fence_canary_repo stage-rollback-conflict)"
setup_stage_fence_inputs "$STAGE_CANARY"
STAGE_THIRD_OID="$(make_third_party_oid "$STAGE_CANARY")"
expect_failure run_stage_commit_fence_with_rollback_ref_conflict "$STAGE_CANARY" "$STAGE_THIRD_OID"
assert_direct_ref_oid "$STAGE_CANARY" refs/heads/local/task7 "$STAGE_THIRD_OID"
pass 'canonical stage fence rejects literal paths, special operands, exact-index directory races, and transaction-boundary symref races'

PLAN_CANARY="$(new_commit_fence_canary_repo plan-pre-staged)"
setup_impl_plan_fence_input "$PLAN_CANARY"
printf 'unrelated staged change\n' >> "$PLAN_CANARY/initial"
GIT_MASTER=1 git -C "$PLAN_CANARY" add initial
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with a pre-staged unrelated path'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-membership-drift)"
setup_impl_plan_fence_input "$PLAN_CANARY"
printf 'injected staged change\n' >> "$PLAN_CANARY/initial"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_staged_drift "$PLAN_CANARY" 'implementation-plan fence with staged membership drift'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-omitted-tracked)"
setup_impl_plan_fence_input "$PLAN_CANARY"
printf 'omitted tracked change\n' >> "$PLAN_CANARY/initial"
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with an omitted tracked artifact'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-omitted-untracked)"
setup_impl_plan_fence_input "$PLAN_CANARY"
printf 'omitted untracked artifact\n' > "$PLAN_CANARY/omitted-untracked.txt"
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with an omitted untracked artifact'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-read-only-query-failure)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_read_only_query_failure "$PLAN_CANARY" 'implementation-plan fence with an empty failed read-only query'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-whitespace-error)"
setup_impl_plan_fence_input "$PLAN_CANARY"
printf 'trailing whitespace \n' >> "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with a staged whitespace error'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-pathspec-magic)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_pathspec_magic "$PLAN_CANARY" 'implementation-plan fence with pathspec magic'
assert_staged_path_set "$PLAN_CANARY" '' 'implementation-plan pathspec magic rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-directory-operand)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_directory_operand "$PLAN_CANARY" 'implementation-plan fence with a directory operand'
assert_staged_path_set "$PLAN_CANARY" '' 'implementation-plan directory operand rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-fifo-operand)"
setup_impl_plan_fence_input "$PLAN_CANARY"
rm -- "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"
mkfifo "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with a FIFO operand'
assert_staged_path_set "$PLAN_CANARY" '' 'implementation-plan FIFO operand rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-index-directory-race)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_index_directory_race "$PLAN_CANARY" 'implementation-plan fence with a file-to-directory index race'
test -d "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md" || fail 'implementation-plan index race did not replace the validated file with a directory'
assert_staged_path_set "$PLAN_CANARY" '' 'implementation-plan index directory race rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-preexisting-hardlink)"
setup_impl_plan_fence_input "$PLAN_CANARY"
rm -- "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"
ln "$PLAN_CANARY/initial" "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"
assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" 'implementation-plan fence with a preexisting plan hardlink'
assert_staged_path_set "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md 'implementation-plan pre-ref hardlink rejection'
for plan_document_kind in deleted symlink executable; do
  PLAN_CANARY="$(new_commit_fence_canary_repo "implementation-plan-$plan_document_kind")"
  setup_impl_plan_fence_input "$PLAN_CANARY"
  case "$plan_document_kind" in
    deleted) rm -- "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md" ;;
    symlink) rm -- "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md"; ln -s initial "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md" ;;
    executable) chmod 755 "$PLAN_CANARY/mydocs/plans/task_m100_7_impl.md" ;;
  esac
  assert_fence_rejects_without_commit run_impl_plan_commit_fence "$PLAN_CANARY" "implementation-plan fence with a $plan_document_kind plan"
done
PLAN_CANARY="$(new_commit_fence_canary_repo plan-pre-ref-drift)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_pre_ref_worktree_drift "$PLAN_CANARY" 'implementation-plan fence with worktree drift after write-tree'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-forward-symref)"
setup_impl_plan_fence_input "$PLAN_CANARY"
PLAN_PARENT="$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)"
GIT_MASTER=1 git -C "$PLAN_CANARY" update-ref refs/heads/third-party "$PLAN_PARENT"
assert_fence_rejects_without_commit_with_argument run_impl_plan_commit_fence_with_forward_symref "$PLAN_CANARY" refs/heads/third-party 'implementation-plan forward symref'
test "$(GIT_MASTER=1 git -C "$PLAN_CANARY" symbolic-ref refs/heads/local/task7)" = refs/heads/third-party || fail 'implementation-plan forward symref was overwritten'
assert_direct_ref_oid "$PLAN_CANARY" refs/heads/third-party "$PLAN_PARENT"
assert_staged_path_set "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md 'implementation-plan forward symref rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-rollback-symref)"
setup_impl_plan_fence_input "$PLAN_CANARY"
PLAN_PARENT="$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)"
GIT_MASTER=1 git -C "$PLAN_CANARY" update-ref refs/heads/third-party "$PLAN_PARENT"
assert_fence_rejects_without_commit_with_argument run_impl_plan_commit_fence_with_rollback_symref "$PLAN_CANARY" refs/heads/third-party 'implementation-plan rollback symref'
test "$(GIT_MASTER=1 git -C "$PLAN_CANARY" symbolic-ref refs/heads/local/task7)" = refs/heads/third-party || fail 'implementation-plan rollback replaced a competing symbolic ref'
assert_direct_ref_oid "$PLAN_CANARY" refs/heads/third-party "$PLAN_PARENT"
PLAN_CANARY="$(new_commit_fence_canary_repo plan-rollback-conflict)"
setup_impl_plan_fence_input "$PLAN_CANARY"
PLAN_THIRD_OID="$(make_third_party_oid "$PLAN_CANARY")"
expect_failure run_impl_plan_commit_fence_with_rollback_ref_conflict "$PLAN_CANARY" "$PLAN_THIRD_OID"
assert_direct_ref_oid "$PLAN_CANARY" refs/heads/local/task7 "$PLAN_THIRD_OID"
pass 'canonical implementation-plan fence rejects literal paths, special operands, exact-index directory races, and transaction-boundary symref races'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-success)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_commits_only_expected_paths run_stage_commit_fence "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/stage-output.txt' 'stage fence'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-tampered-expected-paths)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_commits_only_expected_paths run_stage_commit_fence_with_tampered_expected_paths "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/stage-output.txt' 'stage fence with a tampered caller expected array'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-success)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_commits_only_expected_paths run_impl_plan_commit_fence "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md 'implementation-plan fence'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-tampered-expected-paths)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_commits_only_expected_paths run_impl_plan_commit_fence_with_tampered_expected_paths "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md 'implementation-plan fence with a tampered caller expected array'
pass 'canonical commit fences derive approved paths internally and leave successful canaries globally clean'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-post-ref-worktree-drift)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_post_ref_worktree_drift "$STAGE_CANARY" 'stage fence rolls back post-ref worktree drift'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-post-ref-hardlink)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_rejects_without_commit run_stage_commit_fence_with_post_ref_hardlink "$STAGE_CANARY" 'stage fence rolls back post-ref hardlink drift'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-post-ref-worktree-drift)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_post_ref_worktree_drift "$PLAN_CANARY" 'implementation-plan fence rolls back post-ref worktree drift'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-post-ref-hardlink)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_post_ref_hardlink "$PLAN_CANARY" 'implementation-plan fence rolls back post-ref hardlink drift'
pass 'both full fences invoke exact-CAS rollback after post-ref worktree and hardlink drift'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-gitlink-deletion)"
seed_absent_tracked_gitlink "$STAGE_CANARY" src/stage-gitlink
setup_stage_fence_report "$STAGE_CANARY"
assert_fence_rejects_without_commit_with_argument run_stage_commit_fence_for_output "$STAGE_CANARY" src/stage-gitlink 'stage fence with an absent tracked gitlink deletion'
assert_staged_path_set "$STAGE_CANARY" '' 'stage gitlink deletion rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-gitlink-deletion)"
seed_absent_tracked_gitlink "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md
PLAN_HEAD="$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)"
expect_failure run_plan_file_operand_validator "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md
test "$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)" = "$PLAN_HEAD" || fail 'plan gitlink validator changed HEAD before rejection'
assert_staged_path_set "$PLAN_CANARY" '' 'plan gitlink deletion validator rejection'
pass 'canonical stage and plan validators reject absent tracked mode-160000 gitlinks before index mutation'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-deletion-success)"
STAGE_DELETED_OUTPUT=src/deleted-stage-output.txt
seed_absent_tracked_regular_file "$STAGE_CANARY" "$STAGE_DELETED_OUTPUT"
setup_stage_fence_report "$STAGE_CANARY"
assert_fence_commits_only_expected_paths_with_argument run_stage_commit_fence_for_output "$STAGE_CANARY" "$STAGE_DELETED_OUTPUT" $'mydocs/working/task_m100_7_stage1.md\nsrc/deleted-stage-output.txt' 'stage fence with a valid tracked deletion'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-deletion-helper-success)"
PLAN_DELETED_OPERAND=shared/deleted-plan-helper.txt
seed_absent_tracked_regular_file "$PLAN_CANARY" "$PLAN_DELETED_OPERAND"
expect_success run_plan_exact_index_operand "$PLAN_CANARY" "$PLAN_DELETED_OPERAND" deletion
assert_staged_path_set "$PLAN_CANARY" "$PLAN_DELETED_OPERAND" 'plan exact-index deletion helper'
test "$(GIT_MASTER=1 git -C "$PLAN_CANARY" diff --cached --name-status)" = $'D\tshared/deleted-plan-helper.txt' || fail 'plan exact-index deletion helper did not stage a deletion'
pass 'stage fence commits only a valid deletion and report while plan shared exact-index helper stages its deletion'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-ignored-recreation)"
STAGE_RECREATED_OUTPUT=src/ignored-stage-output.txt
seed_ignored_tracked_deletion "$STAGE_CANARY" "$STAGE_RECREATED_OUTPUT"
setup_stage_fence_report "$STAGE_CANARY"
assert_fence_rejects_without_commit_with_argument run_stage_commit_fence_with_ignored_recreation "$STAGE_CANARY" "$STAGE_RECREATED_OUTPUT" 'stage fence with ignored recreation after force-remove'
test -f "$STAGE_CANARY/$STAGE_RECREATED_OUTPUT" || fail 'stage ignored recreation did not leave the recreated path'
GIT_MASTER=1 git -C "$STAGE_CANARY" check-ignore -q -- "$STAGE_RECREATED_OUTPUT" || fail 'stage recreated deletion path is not ignored'
assert_staged_path_set "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/ignored-stage-output.txt' 'stage ignored recreation rejection'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-ignored-recreation)"
PLAN_RECREATED_OPERAND=mydocs/plans/task_m100_7_impl.md
seed_ignored_tracked_deletion "$PLAN_CANARY" "$PLAN_RECREATED_OPERAND"
PLAN_HEAD="$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_ignored_recreation "$PLAN_CANARY" 'implementation-plan fence with ignored recreation after force-remove'
test "$(GIT_MASTER=1 git -C "$PLAN_CANARY" rev-parse HEAD)" = "$PLAN_HEAD" || fail 'plan ignored recreation advanced the branch'
test -f "$PLAN_CANARY/$PLAN_RECREATED_OPERAND" || fail 'plan ignored recreation did not leave the recreated path'
GIT_MASTER=1 git -C "$PLAN_CANARY" check-ignore -q -- "$PLAN_RECREATED_OPERAND" || fail 'plan recreated deletion path is not ignored'
assert_staged_path_set "$PLAN_CANARY" "$PLAN_RECREATED_OPERAND" 'plan ignored recreation rejection'
pass 'both canonical exact-index helpers reject ignored recreation after force-remove without advancing a branch'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-path-shim-ignored-recreation)"
STAGE_RECREATED_OUTPUT=src/ignored-stage-output.txt
seed_ignored_tracked_deletion "$STAGE_CANARY" "$STAGE_RECREATED_OUTPUT"
setup_stage_fence_report "$STAGE_CANARY"
assert_fence_rejects_without_commit_with_argument run_stage_commit_fence_with_path_shim_ignored_recreation "$STAGE_CANARY" "$STAGE_RECREATED_OUTPUT" 'stage fence with PATH-shim ignored recreation after force-remove'
test -f "$STAGE_CANARY/$STAGE_RECREATED_OUTPUT" || fail 'stage PATH-shim ignored recreation did not leave the recreated path'
GIT_MASTER=1 git -C "$STAGE_CANARY" check-ignore -q -- "$STAGE_RECREATED_OUTPUT" || fail 'stage PATH-shim recreated deletion path is not ignored'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-path-shim-ignored-recreation)"
PLAN_RECREATED_OPERAND=mydocs/plans/task_m100_7_impl.md
seed_ignored_tracked_deletion "$PLAN_CANARY" "$PLAN_RECREATED_OPERAND"
assert_fence_rejects_without_commit run_impl_plan_commit_fence_with_path_shim_ignored_recreation "$PLAN_CANARY" 'implementation-plan fence with PATH-shim ignored recreation after force-remove'
test -f "$PLAN_CANARY/$PLAN_RECREATED_OPERAND" || fail 'plan PATH-shim ignored recreation did not leave the recreated path'
GIT_MASTER=1 git -C "$PLAN_CANARY" check-ignore -q -- "$PLAN_RECREATED_OPERAND" || fail 'plan PATH-shim recreated deletion path is not ignored'
pass 'executable PATH git shims preserve ignored recreation rejection after exact index deletion'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-commit-response-omitted)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_fence_commits_only_expected_paths run_stage_commit_fence_with_commit_response_omitted "$STAGE_CANARY" $'mydocs/working/task_m100_7_stage1.md\nsrc/stage-output.txt' 'stage fence reconciles a committed response-omitted transaction'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-commit-response-omitted)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_fence_commits_only_expected_paths run_impl_plan_commit_fence_with_commit_response_omitted "$PLAN_CANARY" mydocs/plans/task_m100_7_impl.md 'implementation-plan fence reconciles a committed response-omitted transaction'
pass 'both full fences reconcile an exact-new CAS after terminal response loss, stderr, and nonzero child status'

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
extract_snapshot_function_from_section step1 validate_snapshot_membership "$TMP_ROOT/snapshot-membership.sh"
extract_snapshot_function_from_section step1 validate_snapshot_member "$TMP_ROOT/snapshot-member.sh"
extract_snapshot_function_from_section step1 validate_present_snapshot_membership "$TMP_ROOT/snapshot-present-membership.sh"
extract_snapshot_function_from_section step1 remove_validated_snapshot_members "$TMP_ROOT/snapshot-remove-members.sh"
extract_snapshot_function_from_section step1 cleanup_snapshot_root "$TMP_ROOT/snapshot-cleanup.sh"
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

SNAPSHOT_CASE="$TMP_ROOT/snapshot-step3-exact"
setup_snapshot_root "$SNAPSHOT_CASE"
expect_success run_step3_snapshot_cleanup "$SNAPSHOT_CASE"
test ! -e "$SNAPSHOT_CASE" || fail 'Step 3 exact snapshot root remains after cleanup'
SNAPSHOT_CASE="$TMP_ROOT/snapshot-step3-unknown"
setup_snapshot_root "$SNAPSHOT_CASE"
printf unknown > "$SNAPSHOT_CASE/unknown"
expect_failure run_step3_snapshot_cleanup "$SNAPSHOT_CASE"
test -f "$SNAPSHOT_CASE/before.diff" || fail 'Step 3 unknown member removed approved artifact'
test -f "$SNAPSHOT_CASE/unknown" || fail 'Step 3 unknown member was removed'
for snapshot_claim in "$SNAPSHOT_CASE".cleanup.*; do
  test ! -e "$snapshot_claim" || fail 'Step 3 failure left claimed root path'
done
pass 'Step 3 snapshot cleanup restores the original root after unknown membership failure'

for snapshot_variant in occurrence-1 step3; do
  SNAPSHOT_CASE="$TMP_ROOT/snapshot-member-swap-$snapshot_variant"
  setup_snapshot_root "$SNAPSHOT_CASE"
  expect_failure run_snapshot_cleanup_with_member_swap "$SNAPSHOT_CASE" "$snapshot_variant"
  test -f "$SNAPSHOT_CASE/before.repository.json" || fail "$snapshot_variant member replacement was removed"
  test -f "$SNAPSHOT_CASE/before.repository.json.original" || fail "$snapshot_variant original member was removed"
  test -f "$SNAPSHOT_CASE/after.diff" || fail "$snapshot_variant removed an unrelated expected member"
done
pass 'both snapshot cleanup occurrences preserve member replacements at the claim boundary'

for snapshot_variant in preclaim preclaim-step3; do
  SNAPSHOT_CASE="$TMP_ROOT/snapshot-preclaim-swap-$snapshot_variant"
  setup_snapshot_root "$SNAPSHOT_CASE"
  if run_portable_watchdog "$TMP_ROOT/$snapshot_variant.log" run_snapshot_cleanup_with_member_swap "$SNAPSHOT_CASE" "$snapshot_variant"; then fail "$snapshot_variant unexpectedly succeeded"; fi
  test "$WATCHDOG_RESULT" != timed_out || fail "$snapshot_variant exceeded cleanup watchdog"
  test -f "$SNAPSHOT_CASE/before.repository.json" || fail "$snapshot_variant removed replacement"
  test -f "$SNAPSHOT_CASE/before.repository.json.original" || fail "$snapshot_variant removed original"
  test -f "$SNAPSHOT_CASE/after.diff" || fail "$snapshot_variant removed unrelated member"
done
pass 'both snapshot cleanup occurrences reject preclaim member replacement'

for snapshot_variant in partial partial-step3; do
  SNAPSHOT_CASE="$TMP_ROOT/snapshot-partial-claim-$snapshot_variant"
  setup_snapshot_root "$SNAPSHOT_CASE"
  partial_first_id="$(stat -f '%d:%i:%u:%l:%Sp' -- "$SNAPSHOT_CASE/before.repository.json")"
  partial_second_original="$(cat "$SNAPSHOT_CASE/before.pull.json")"
  if run_portable_watchdog "$TMP_ROOT/$snapshot_variant.log" run_snapshot_cleanup_with_member_swap "$SNAPSHOT_CASE" "$snapshot_variant"; then fail "$snapshot_variant partial claim unexpectedly succeeded"; fi
  test "$WATCHDOG_RESULT" != timed_out || fail "$snapshot_variant partial claim exceeded cleanup watchdog"
  test -f "$SNAPSHOT_CASE/before.repository.json" || fail "$snapshot_variant did not restore first member"
  test "$(stat -f '%d:%i:%u:%l:%Sp' -- "$SNAPSHOT_CASE/before.repository.json")" = "$partial_first_id" || fail "$snapshot_variant changed first identity"
  test -f "$SNAPSHOT_CASE/before.pull.json" || fail "$snapshot_variant removed competing second member"
  test -f "$SNAPSHOT_CASE/before.pull.json.original" || fail "$snapshot_variant removed second original"
  test "$(cat "$SNAPSHOT_CASE/before.pull.json.original")" = "$partial_second_original" || fail "$snapshot_variant changed second original content"
  test "$(cat "$SNAPSHOT_CASE/before.pull.json")" = replacement || fail "$snapshot_variant changed competing replacement"
  test -f "$SNAPSHOT_CASE/after.diff" || fail "$snapshot_variant removed unrelated member"
  test ! -e "$SNAPSHOT_CASE/before.repository.json.cleanup."* || fail "$snapshot_variant stranded first claim"
done
pass 'both snapshot cleanup occurrences restore prior members after partial claim failure'

for snapshot_variant in restorefail restorefail-step3; do
  SNAPSHOT_CASE="$TMP_ROOT/snapshot-restore-failure-$snapshot_variant"
  setup_snapshot_root "$SNAPSHOT_CASE"
  if run_portable_watchdog "$TMP_ROOT/$snapshot_variant.log" run_snapshot_cleanup_with_member_swap "$SNAPSHOT_CASE" "$snapshot_variant"; then fail "$snapshot_variant restoration failure unexpectedly succeeded"; fi
  test "$WATCHDOG_RESULT" != timed_out || fail "$snapshot_variant restoration failure exceeded cleanup watchdog"
  test -d "$SNAPSHOT_CASE" || fail "$snapshot_variant did not restore original root"
  test "$(cat "$SNAPSHOT_CASE/before.repository.json")" = competitor || fail "$snapshot_variant changed competing member"
  test -f "$SNAPSHOT_CASE/before.repository.json.cleanup."* || fail "$snapshot_variant removed owned member claim"
  test -f "$SNAPSHOT_CASE/after.diff" || fail "$snapshot_variant removed unrelated member"
done
pass 'both snapshot cleanup occurrences restore root after member restoration failure'

TASK_REGISTER_SEARCH="$TMP_ROOT/task-register-duplicate-search.sh"
awk '/^1\. 중복 이슈 확인/{capture=1; next} capture && /^[[:space:]]*```bash$/{fence=1; next} fence && /^[[:space:]]*```$/{exit} fence{sub(/^[[:space:]]+/, ""); print}' "$TASK_REGISTER_SKILL" > "$TASK_REGISTER_SEARCH"
assert_contains "$TASK_REGISTER_SEARCH" 'SEARCH_QUERY_FILE="$(mktemp)"'
assert_contains "$TASK_REGISTER_SEARCH" 'IFS= read -r SEARCH_QUERY < "$SEARCH_QUERY_FILE"'
assert_contains "$TASK_REGISTER_SEARCH" '--search "$SEARCH_QUERY"'
assert_absent "$TASK_REGISTER_SEARCH" 'eval'
assert_absent "$TASK_REGISTER_SEARCH" 'sh -c'
assert_absent "$TASK_REGISTER_SEARCH" '<<<'
assert_absent "$TASK_REGISTER_SEARCH" 'source '
pass 'task-register duplicate-search fence uses a quoted tempfile query without shell evaluation'

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

assert_portable_watchdog_completion_canaries
assert_portable_watchdog_timeout_reaps_runner_group
STAGE_CANARY="$(new_commit_fence_canary_repo stage-peer-exits-before-response)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_peer_failure_returns_within_bound run_stage_commit_fence_with_peer_failure "$STAGE_CANARY" 'stage peer failure cleanup'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-peer-exits-before-response)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_peer_failure_returns_within_bound run_impl_plan_commit_fence_with_peer_failure "$PLAN_CANARY" 'implementation-plan peer failure cleanup'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-peer-failure-cleanup-hold)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_peer_failure_returns_within_bound run_stage_commit_fence_with_peer_failure_cleanup_hold "$STAGE_CANARY" 'stage peer failure cleanup hold'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-peer-failure-cleanup-hold)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_peer_failure_returns_within_bound run_impl_plan_commit_fence_with_peer_failure_cleanup_hold "$PLAN_CANARY" 'implementation-plan peer failure cleanup hold'
pass 'both full fences reject an immediate update-ref peer failure within the strict portable watchdog bound'

assert_path_shim_cleanup_authority_is_static
STAGE_CANARY="$(new_commit_fence_canary_repo stage-path-shim-orphan-child)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_path_shim_orphan_child_is_reaped run_stage_commit_fence_with_path_shim_orphan_child "$STAGE_CANARY" "$STAGE_CANARY/.git/stage-shim-process.log" "$STAGE_CANARY/.git/stage-shim-child.pid" 'stage fence PATH-shim lifecycle'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-path-shim-orphan-child)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_path_shim_orphan_child_is_reaped run_impl_plan_commit_fence_with_path_shim_orphan_child "$PLAN_CANARY" "$PLAN_CANARY/.git/plan-shim-process.log" "$PLAN_CANARY/.git/plan-shim-child.pid" 'implementation-plan fence PATH-shim lifecycle'
STAGE_CANARY="$(new_commit_fence_canary_repo stage-path-shim-transaction-directory-replacement)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_path_shim_transaction_directory_is_owned run_stage_commit_fence_with_path_shim_transaction_directory_replacement "$STAGE_CANARY" "$STAGE_CANARY/.git/stage-shim-replaced-dir" 'stage fence PATH-shim transaction directory replacement'
PLAN_CANARY="$(new_commit_fence_canary_repo plan-path-shim-transaction-directory-replacement)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_path_shim_transaction_directory_is_owned run_impl_plan_commit_fence_with_path_shim_transaction_directory_replacement "$PLAN_CANARY" "$PLAN_CANARY/.git/plan-shim-replaced-dir" 'implementation-plan fence PATH-shim transaction directory replacement'
if test -n "$PATH_SHIM_FENCE_GAPS"; then
  fail "PATH-shim transaction canary $PATH_SHIM_FENCE_GAPS"
fi
pass 'PATH-shim transaction children and directories are reaped and owned across both full fences'

STAGE_CANARY="$(new_commit_fence_canary_repo stage-commit-cleanup-failure)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_committed_transport_failure_is_rolled_back run_stage_commit_fence_with_commit_cleanup_failure "$STAGE_CANARY" stage-commit-cleanup-failure
PLAN_CANARY="$(new_commit_fence_canary_repo plan-commit-cleanup-failure)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_committed_transport_failure_is_rolled_back run_impl_plan_commit_fence_with_commit_cleanup_failure "$PLAN_CANARY" plan-commit-cleanup-failure
STAGE_CANARY="$(new_commit_fence_canary_repo stage-commit-then-signal)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_committed_transport_failure_is_rolled_back run_stage_commit_fence_with_commit_then_signal "$STAGE_CANARY" stage-commit-then-signal
PLAN_CANARY="$(new_commit_fence_canary_repo plan-commit-then-signal)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_committed_transport_failure_is_rolled_back run_impl_plan_commit_fence_with_commit_then_signal "$PLAN_CANARY" plan-commit-then-signal
STAGE_CANARY="$(new_commit_fence_canary_repo stage-commit-cleanup-symbolic)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_committed_transport_failure_preserves_symbolic_competitor run_stage_commit_fence_with_commit_cleanup_failure "$STAGE_CANARY" stage-commit-cleanup-failure
PLAN_CANARY="$(new_commit_fence_canary_repo plan-commit-signal-symbolic)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_committed_transport_failure_preserves_symbolic_competitor run_impl_plan_commit_fence_with_commit_then_signal "$PLAN_CANARY" plan-commit-then-signal
STAGE_CANARY="$(new_commit_fence_canary_repo stage-post-wait-pgid-probe)"
setup_stage_fence_inputs "$STAGE_CANARY"
assert_post_wait_pgid_probe_is_absent run_stage_commit_fence_with_post_wait_pgid_probe "$STAGE_CANARY" stage-post-wait-pgid-probe
PLAN_CANARY="$(new_commit_fence_canary_repo plan-post-wait-pgid-probe)"
setup_impl_plan_fence_input "$PLAN_CANARY"
assert_post_wait_pgid_probe_is_absent run_impl_plan_commit_fence_with_post_wait_pgid_probe "$PLAN_CANARY" plan-post-wait-pgid-probe
if test -n "$LIFECYCLE_CANARY_GAPS"; then
  fail "stage/plan transaction lifecycle canary $LIFECYCLE_CANARY_GAPS"
fi
pass 'stage and plan transaction lifecycles reject committed transport failure and post-wait PGID reuse'

if test "${GPUWATCHER_WORKFLOW_STRESS:-0}" = 1; then
  orphan_iteration=0
  while test "$orphan_iteration" -lt 80; do
    STAGE_CANARY="$(new_commit_fence_canary_repo "stage-orphan-stress-$orphan_iteration")"
    setup_stage_fence_inputs "$STAGE_CANARY"
    assert_path_shim_orphan_child_is_reaped run_stage_commit_fence_with_path_shim_orphan_child "$STAGE_CANARY" "$STAGE_CANARY/.git/stage-shim-process.log" "$STAGE_CANARY/.git/stage-shim-child.pid" "stage orphan stress $orphan_iteration"
    PLAN_CANARY="$(new_commit_fence_canary_repo "plan-orphan-stress-$orphan_iteration")"
    setup_impl_plan_fence_input "$PLAN_CANARY"
    assert_path_shim_orphan_child_is_reaped run_impl_plan_commit_fence_with_path_shim_orphan_child "$PLAN_CANARY" "$PLAN_CANARY/.git/plan-shim-process.log" "$PLAN_CANARY/.git/plan-shim-child.pid" "plan orphan stress $orphan_iteration"
    setup_archive_exact_ref_context "archive-orphan-stress-$orphan_iteration"
    assert_archive_orphan_child_is_reaped "$ARCHIVE_TRANSACTION_REPO" "$ARCHIVE_TRANSACTION_NEW_OID" "$ARCHIVE_TRANSACTION_OLD_OID" "archive orphan stress $orphan_iteration"
    orphan_iteration=$((orphan_iteration + 1))
  done
  test -z "$PATH_SHIM_FENCE_GAPS" || fail "orphan lifecycle stress $PATH_SHIM_FENCE_GAPS"
  test -z "$EXTERNAL_ARCHIVE_FENCE_GAPS" || fail "archive orphan lifecycle stress $EXTERNAL_ARCHIVE_FENCE_GAPS"
  pass 'orphan lifecycle stress reaps survivors=0/240'
fi

assert_second_review_rejects_bare_transaction_status_capture() {
  local fence_file transaction_call status_variable
  for fence_file in "$TMP_ROOT/stage-commit-fence.sh" "$TMP_ROOT/impl-plan-commit-fence.sh"; do
    case "$fence_file" in
      *stage-*) transaction_call=stage_update_branch_ref_transaction; status_variable=TRANSACTION_STATUS ;;
      *) transaction_call=plan_update_branch_ref_transaction; status_variable=REF_TRANSACTION_STATUS ;;
    esac
    if ! awk -v call="$transaction_call" -v status_variable="$status_variable" '
      $0 ~ "^[[:space:]]*" call "[[:space:]]+[^|;&]+$" { transaction_line = NR; next }
      transaction_line && NR == transaction_line + 1 && $0 ~ "^[[:space:]]*" status_variable "=[$][?][[:space:]]*$" { forbidden = 1 }
      END { exit forbidden }
    ' "$fence_file"; then
      fail "inherited-errexit canary found bare $transaction_call followed by $status_variable=\$?"
    fi
  done
}

run_stage_commit_fence_with_inherited_errexit_transport_failure() (
  local repo=$1 inherited_mode=$2
  cd "$repo"
  TMPDIR="$(commit_fence_tmpdir "$repo")"
  export TMPDIR GIT_MASTER=1
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  configure_commit_lifecycle_path_shim "$repo" stage-inherited-errexit commit-cleanup-failure
  case "$inherited_mode" in
    e) exec /bin/bash -e -c '
    cd "$1"
    EXPECTED_BRANCH=local/task7
    STAGE_OUTPUT_PATHS=(src/stage-output.txt)
    STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
    EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
    source "$2"
    stage_commit_fence
  ' bash "$repo" "$TMP_ROOT/stage-commit-fence.sh" ;;
    euo) exec /bin/bash -euo pipefail -c '
    cd "$1"
    EXPECTED_BRANCH=local/task7
    STAGE_OUTPUT_PATHS=(src/stage-output.txt)
    STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
    EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
    source "$2"
    stage_commit_fence
  ' bash "$repo" "$TMP_ROOT/stage-commit-fence.sh" ;;
    *) return 1 ;;
  esac
)

run_plan_commit_fence_with_inherited_errexit_transport_failure() (
  local repo=$1 inherited_mode=$2
  cd "$repo"
  TMPDIR="$(commit_fence_tmpdir "$repo")"
  export TMPDIR GIT_MASTER=1
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  configure_commit_lifecycle_path_shim "$repo" plan-inherited-errexit commit-cleanup-failure
  case "$inherited_mode" in
    e) exec /bin/bash -e -c '
    cd "$1"
    EXPECTED_BRANCH=local/task7
    IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
    EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
    source "$2"
    implementation_plan_commit_fence
  ' bash "$repo" "$TMP_ROOT/impl-plan-commit-fence.sh" ;;
    euo) exec /bin/bash -euo pipefail -c '
    cd "$1"
    EXPECTED_BRANCH=local/task7
    IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
    EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
    source "$2"
    implementation_plan_commit_fence
  ' bash "$repo" "$TMP_ROOT/impl-plan-commit-fence.sh" ;;
    *) return 1 ;;
  esac
)

assert_inherited_errexit_transport_failure_rolls_back() {
  local kind inherited_mode repo before lifecycle_log runner
  for kind in stage plan; do
    for inherited_mode in e euo; do
      repo="$(new_commit_fence_canary_repo "$kind-inherited-errexit-$inherited_mode")"
      case "$kind" in
        stage)
          setup_stage_fence_inputs "$repo"
          runner=run_stage_commit_fence_with_inherited_errexit_transport_failure
          lifecycle_log="$repo/.git/stage-inherited-errexit.log"
          ;;
        plan)
          setup_impl_plan_fence_input "$repo"
          runner=run_plan_commit_fence_with_inherited_errexit_transport_failure
          lifecycle_log="$repo/.git/plan-inherited-errexit.log"
          ;;
      esac
      before="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
      if "$runner" "$repo" "$inherited_mode"; then
        fail "$kind inherited-$inherited_mode transport canary unexpectedly succeeded"
      fi
      assert_contains "$lifecycle_log" "advanced ref=refs/heads/local/task7 old=$before "
      assert_direct_ref_oid "$repo" refs/heads/local/task7 "$before"
    done
  done
}

install_terminal_cross_product_git_shim() {
  TERMINAL_SHIM_BIN="$(mktemp -d "$TMP_ROOT/terminal-cross-product.XXXXXX")" || return 1
  REAL_GIT="$(type -P git)" || return 1
  export REAL_GIT
  cat > "$TERMINAL_SHIM_BIN/git" <<'EOF'
#!/bin/bash
if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
  new_oid=
  old_oid=
  ref=
  while IFS= read -r line; do
    case "$line" in
      start) printf 'start: ok\n' ;;
      'option no-deref') ;;
      update\ *)
        set -- $line
        ref=$2
        new_oid=$3
        old_oid=$4
        ;;
      prepare) printf 'prepare: ok\n' ;;
      commit)
        test -n "$ref" && test -n "$new_oid" && test -n "$old_oid" || exit 98
        if test "${TERMINAL_EXACT_NEW:-0}" = 1; then
          printf 'start\noption no-deref\nupdate %s %s %s\nprepare\ncommit\n' "$ref" "$new_oid" "$old_oid" | "$REAL_GIT" update-ref --stdin >/dev/null || exit 98
        fi
        case "${TERMINAL_TRANSCRIPT_MODE:?}" in
          exact) printf 'commit: ok\n' ;;
          empty) ;;
          truncated) printf 'commit:' ;;
          malformed) printf 'commit: malformed\n' ;;
          extra) printf 'commit: ok\nextra: unexpected\n' ;;
          *) exit 98 ;;
        esac
        case "${TERMINAL_STDERR_MODE:?}" in empty) ;; nonempty) printf 'terminal transport diagnostic\n' >&2 ;; *) exit 98 ;; esac
        exit "${TERMINAL_WAIT_STATUS:?}"
        ;;
      *) exit 98 ;;
    esac
  done
  exit 98
fi
exec "$REAL_GIT" "$@"
EOF
  chmod 700 "$TERMINAL_SHIM_BIN/git"
}

run_terminal_cross_product_full_fence() (
  local kind=$1 repo=$2 transcript_mode=$3 wait_status=$4 stderr_mode=$5 exact_new=$6
  cd "$repo"
  TMPDIR="$(commit_fence_tmpdir "$repo")"
  PATH="$TERMINAL_SHIM_BIN:$REAL_PATH"
  TERMINAL_TRANSCRIPT_MODE=$transcript_mode
  TERMINAL_WAIT_STATUS=$wait_status
  TERMINAL_STDERR_MODE=$stderr_mode
  TERMINAL_EXACT_NEW=$exact_new
  export TMPDIR PATH GIT_MASTER=1 TERMINAL_TRANSCRIPT_MODE TERMINAL_WAIT_STATUS TERMINAL_STDERR_MODE TERMINAL_EXACT_NEW
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  case "$kind" in
    stage)
      exec /bin/bash -euo pipefail -c '
        cd "$1"
        EXPECTED_BRANCH=local/task7
        STAGE_OUTPUT_PATHS=(src/stage-output.txt)
        STAGE_REPORT_PATH=mydocs/working/task_m100_7_stage1.md
        EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
        source "$2"
        stage_commit_fence
      ' bash "$repo" "$TMP_ROOT/stage-commit-fence.sh"
      ;;
    plan)
      exec /bin/bash -euo pipefail -c '
        cd "$1"
        EXPECTED_BRANCH=local/task7
        IMPLEMENTATION_PLAN_PATH=mydocs/plans/task_m100_7_impl.md
        EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
        source "$2"
        implementation_plan_commit_fence
      ' bash "$repo" "$TMP_ROOT/impl-plan-commit-fence.sh"
      ;;
    *) return 1 ;;
  esac
)

run_terminal_cross_product_archive_transaction() (
  local repo=$1 new_oid=$2 old_oid=$3 transcript_mode=$4 wait_status=$5 stderr_mode=$6 exact_new=$7
  cd "$repo"
  TMPDIR="$(commit_fence_tmpdir "$repo")"
  PATH="$TERMINAL_SHIM_BIN:$REAL_PATH"
  TERMINAL_TRANSCRIPT_MODE=$transcript_mode
  TERMINAL_WAIT_STATUS=$wait_status
  TERMINAL_STDERR_MODE=$stderr_mode
  TERMINAL_EXACT_NEW=$exact_new
  export TMPDIR PATH GIT_MASTER=1 TERMINAL_TRANSCRIPT_MODE TERMINAL_WAIT_STATUS TERMINAL_STDERR_MODE TERMINAL_EXACT_NEW
  REPO_ROOT=$repo
  ARCHIVE_BRANCH_REF=refs/heads/local/archive
  source "$TMP_ROOT/archive-direct-ref.sh"
  source "$TMP_ROOT/archive-update-transaction.sh"
  source "$TMP_ROOT/archive-classify-ref.sh"
  HEAD_COMMIT=$new_oid
  PARENT_OID=$old_oid
  REF_ADVANCED=0
  archive_rollback_exact_new_ref() {
    local exit_status=$?
    trap - EXIT HUP INT TERM
    if test "$REF_ADVANCED" = 1; then
      archive_validate_direct_branch_ref "$HEAD_COMMIT" || exit 1
      archive_update_branch_ref_transaction "$PARENT_OID" "$HEAD_COMMIT" || exit 1
      archive_validate_direct_branch_ref "$PARENT_OID" || exit 1
    fi
    exit "$exit_status"
  }
  trap archive_rollback_exact_new_ref EXIT
  ARCHIVE_TRANSACTION_STATUS=0
  if archive_update_branch_ref_transaction "$HEAD_COMMIT" "$PARENT_OID"; then
    ARCHIVE_TRANSACTION_STATUS=0
  else
    ARCHIVE_TRANSACTION_STATUS=$?
  fi
  archive_classify_transaction_ref "$HEAD_COMMIT" "$PARENT_OID"
  case "$ARCHIVE_REF_CLASS" in
    exact-new) REF_ADVANCED=1 ;;
    exact-old|competing-direct|symbolic|missing|unreadable) ;;
    *) exit 1 ;;
  esac
  test "$ARCHIVE_TRANSACTION_STATUS" = 0 || exit 1
  archive_validate_direct_branch_ref "$HEAD_COMMIT" || exit 1
  trap - EXIT HUP INT TERM
)

terminal_tuple_may_succeed() {
  local transcript_mode=$1 wait_status=$2 stderr_mode=$3 exact_new=$4
  if test "$transcript_mode:$wait_status:$stderr_mode:$exact_new" = exact:0:empty:1; then
    return 0
  fi
  test "$transcript_mode" = empty && test "$wait_status" -ge 1 && test "$wait_status" -le 127 && test "$stderr_mode" = nonempty && test "$exact_new" = 1
}

assert_terminal_cross_product_case() {
  local kind=$1 transcript_mode=$2 wait_status=$3 stderr_mode=$4 exact_new=$5 check_transaction_directories=${6:-0} repo before new_oid runner_status=0 transaction_parent transaction_dirs_before
  case "$kind" in
    stage|plan)
      repo="$(new_commit_fence_canary_repo "terminal-$kind-$transcript_mode-$wait_status-$stderr_mode-$exact_new")"
      if test "$kind" = stage; then setup_stage_fence_inputs "$repo"; else setup_impl_plan_fence_input "$repo"; fi
      transaction_parent="$(commit_fence_tmpdir "$repo")"
      transaction_dirs_before="$(transaction_directory_identity_set "$transaction_parent")"
      before="$(GIT_MASTER=1 git -C "$repo" rev-parse refs/heads/local/task7)"
      if run_terminal_cross_product_full_fence "$kind" "$repo" "$transcript_mode" "$wait_status" "$stderr_mode" "$exact_new" >/dev/null 2>&1; then runner_status=0; else runner_status=$?; fi
      ;;
    archive)
      setup_archive_exact_ref_context "terminal-archive-$transcript_mode-$wait_status-$stderr_mode-$exact_new"
      repo=$ARCHIVE_TRANSACTION_REPO
      transaction_parent="$(commit_fence_tmpdir "$repo")"
      transaction_dirs_before="$(transaction_directory_identity_set "$transaction_parent")"
      before=$ARCHIVE_TRANSACTION_OLD_OID
      new_oid=$ARCHIVE_TRANSACTION_NEW_OID
      if run_terminal_cross_product_archive_transaction "$repo" "$new_oid" "$before" "$transcript_mode" "$wait_status" "$stderr_mode" "$exact_new" >/dev/null 2>&1; then runner_status=0; else runner_status=$?; fi
      ;;
    *) fail "unknown terminal tuple fence $kind" ;;
  esac
  if terminal_tuple_may_succeed "$transcript_mode" "$wait_status" "$stderr_mode" "$exact_new"; then
    test "$runner_status" = 0 || fail "$kind rejected terminal tuple $transcript_mode/$wait_status/$stderr_mode/$exact_new"
    case "$kind" in
      stage|plan) assert_successful_commit_fence_cleanup "$repo" "$kind terminal tuple $transcript_mode/$wait_status/$stderr_mode/$exact_new" ;;
      archive) assert_archive_transport_cleanup "$repo" ;;
    esac
  else
    test "$runner_status" != 0 || fail "$kind accepted terminal tuple $transcript_mode/$wait_status/$stderr_mode/$exact_new"
    if test "$kind" = archive; then
      assert_direct_ref_oid "$repo" refs/heads/local/archive "$before"
    else
      assert_direct_ref_oid "$repo" refs/heads/local/task7 "$before"
    fi
  fi
  if test "$check_transaction_directories" = 1; then
    assert_transaction_directory_identity_set "$transaction_parent" "$transaction_dirs_before" "$kind rejected-terminal rollback"
  fi
}

assert_terminal_cross_product() {
  local kind transcript_mode wait_status stderr_mode exact_new
  install_terminal_cross_product_git_shim || fail 'could not install terminal cross-product shim'
  for kind in stage plan archive; do
    for transcript_mode in exact empty truncated malformed extra; do
      for wait_status in 0 1 127 128 129 130 143; do
        for stderr_mode in empty nonempty; do
          for exact_new in 0 1; do
            assert_terminal_cross_product_case "$kind" "$transcript_mode" "$wait_status" "$stderr_mode" "$exact_new"
          done
        done
      done
    done
  done
}

run_snapshot_cleanup_with_irreversible_unlink_failure() (
  local variant=$1 root=$2 fail_position=$3 events=$4
  SNAPSHOT_ROOT=$root
  SNAPSHOT_ROOT_ID="$(stat -f '%d:%i' -- "$root")"
  CURRENT_UID="$(id -u)"
  SNAPSHOT_UNLINK_COUNT=0
  SNAPSHOT_UNLINK_STARTED=0
  SNAPSHOT_FAIL_POSITION=$fail_position
  SNAPSHOT_EVENTS=$events
  export SNAPSHOT_ROOT SNAPSHOT_ROOT_ID CURRENT_UID SNAPSHOT_ARTIFACTS
  case "$variant" in
    step1)
      source "$TMP_ROOT/snapshot-member.sh"
      source "$TMP_ROOT/snapshot-root-claim.sh"
      source "$TMP_ROOT/snapshot-root-restore.sh"
      source "$TMP_ROOT/snapshot-claimed-restore.sh"
      source "$TMP_ROOT/snapshot-present-membership.sh"
      source "$TMP_ROOT/snapshot-membership.sh"
      source "$TMP_ROOT/snapshot-remove-members.sh"
      source "$TMP_ROOT/snapshot-cleanup.sh"
      ;;
    step3)
      source "$TMP_ROOT/snapshot-step3-member.sh"
      source "$TMP_ROOT/snapshot-step3-root-claim.sh"
      source "$TMP_ROOT/snapshot-step3-root-restore.sh"
      source "$TMP_ROOT/snapshot-step3-claimed-restore.sh"
      source "$TMP_ROOT/snapshot-step3-membership.sh"
      source "$TMP_ROOT/snapshot-step3-cleanup.sh"
      ;;
    *) return 1 ;;
  esac
  restore_claimed_snapshot_members() {
    test "$SNAPSHOT_UNLINK_STARTED" = 1 && printf 'restore-members\n' >> "$SNAPSHOT_EVENTS"
    return 97
  }
  restore_snapshot_root_after_cleanup_failure() {
    test "$SNAPSHOT_UNLINK_STARTED" = 1 && printf 'restore-root\n' >> "$SNAPSHOT_EVENTS"
    return 97
  }
  rm() {
    local argument target=
    for argument in "$@"; do target=$argument; done
    case "$target" in
      "$SNAPSHOT_ROOT"/*.cleanup.*)
        SNAPSHOT_UNLINK_COUNT=$((SNAPSHOT_UNLINK_COUNT + 1))
        if test "$SNAPSHOT_UNLINK_COUNT" = "$SNAPSHOT_FAIL_POSITION"; then
          command rm "$@" || return 1
          SNAPSHOT_UNLINK_STARTED=1
          printf 'unlink %s\n' "$target" >> "$SNAPSHOT_EVENTS"
          return 97
        fi
        ;;
    esac
    command rm "$@"
  }
  rmdir() {
    if test "${1:-}" = --; then shift; fi
    if test "${1:-}" = "$SNAPSHOT_ROOT"; then
      SNAPSHOT_UNLINK_STARTED=1
      printf 'rmdir %s\n' "$SNAPSHOT_ROOT" >> "$SNAPSHOT_EVENTS"
      return 97
    fi
    command rmdir "$@"
  }
  cleanup_snapshot_root
)

assert_snapshot_irreversible_boundary_case() {
  local variant=$1 failure_point=$2 root events artifact_count claim_root artifact index=0 candidate claim_count rmdir_failure=0
  local -a original_identities
  root="$TMP_ROOT/snapshot-irrevocable-$variant-$failure_point"
  events="$root.events"
  setup_snapshot_root "$root"
  artifact_count="$(printf '%s\n' $SNAPSHOT_ARTIFACTS | LC_ALL=C wc -l | tr -d '[:space:]')"
  if test "$failure_point" = rmdir; then rmdir_failure=1; failure_point=$((artifact_count + 1)); fi
  for artifact in $SNAPSHOT_ARTIFACTS; do
    original_identities[$index]="$(stat -f '%d:%i:%u:%l:%Lp' -- "$root/$artifact")" || fail "$variant irreversible $failure_point could not capture $artifact identity"
    index=$((index + 1))
  done
  if run_snapshot_cleanup_with_irreversible_unlink_failure "$variant" "$root" "$failure_point" "$events"; then
    fail "$variant irreversible $failure_point unexpectedly succeeded"
  fi
  assert_absent "$events" 'restore-'
  claim_root=
  for candidate in "$root".cleanup.*; do
    if test -d "$candidate"; then claim_root=$candidate; break; fi
  done
  test -n "$claim_root" || fail "$variant irreversible $failure_point did not preserve the claimed root"
  if test "$rmdir_failure" = 1; then
    test -z "$(find "$claim_root" -mindepth 1 -print)" || fail "$variant irreversible rmdir left a claimed artifact"
    return 0
  fi
  index=0
  for artifact in $SNAPSHOT_ARTIFACTS; do
    test ! -e "$claim_root/$artifact" && test ! -L "$claim_root/$artifact" || fail "$variant irreversible $failure_point restored canonical $artifact"
    claim_count=0
    for candidate in "$claim_root/$artifact".cleanup.*; do
      if test -f "$candidate" && test ! -L "$candidate"; then
        claim_count=$((claim_count + 1))
        test "$(stat -f '%d:%i:%u:%l:%Lp' -- "$candidate")" = "${original_identities[$index]}" || fail "$variant irreversible $failure_point changed $artifact claim identity"
      fi
    done
    if test "$index" -lt "$failure_point"; then
      test "$claim_count" = 0 || fail "$variant irreversible $failure_point preserved deleted $artifact claim"
    else
      test "$claim_count" = 1 || fail "$variant irreversible $failure_point did not preserve one exact $artifact claim"
    fi
    index=$((index + 1))
  done
}

assert_snapshot_irreversible_boundaries() {
  local variant artifact_count middle
  artifact_count="$(printf '%s\n' $SNAPSHOT_ARTIFACTS | LC_ALL=C wc -l | tr -d '[:space:]')"
  middle=$(((artifact_count + 1) / 2))
  for variant in step1 step3; do
    assert_snapshot_irreversible_boundary_case "$variant" 1
    assert_snapshot_irreversible_boundary_case "$variant" "$middle"
    assert_snapshot_irreversible_boundary_case "$variant" "$artifact_count"
    assert_snapshot_irreversible_boundary_case "$variant" rmdir
  done
}

assert_archive_root_capture_is_irreversible() {
  local rollback_state="$TMP_ROOT/archive-step5-rollback-state.sh"
  assert_absent "$rollback_state" 'if test -z "${ARCHIVE_ROOT_IDENTITY:-}"; then'
  assert_contains "$rollback_state" 'test "$ARCHIVE_ROOT_OWNERSHIP_CAPTURED" = 1 || return 1'
}

run_archive_root_validation_without_capture() (
  local repo=$1 root_state=$2
  cd "$repo"
  REPO_ROOT=$repo
  ARCHIVE=archives
  ARCHIVE_ROOT_IDENTITY=
  ARCHIVE_ROOT_UID=
  ARCHIVE_ROOT_MODE=
  ARCHIVE_ROOT_OWNERSHIP_CAPTURED=$root_state
  SOURCES=()
  DESTINATIONS=()
  MOVED=()
  OWNERSHIP_CAPTURED=()
  source "$TMP_ROOT/archive-step5-rollback-state.sh"
  validate_archive_rollback_state
)

assert_archive_root_failure_never_adopts_replacement() {
  local repo replacement_id
  repo="$(new_hook_canary_repo archive-root-replacement)"
  mkdir "$repo/archives"
  chmod 700 "$repo/archives"
  replacement_id="$(stat -f '%d:%i' -- "$repo/archives")"
  expect_failure run_archive_root_validation_without_capture "$repo" 0
  test "$(stat -f '%d:%i' -- "$repo/archives")" = "$replacement_id" || fail 'archive root pre-capture validation mutated the replacement root'
}

install_archive_outer_signal_git_shim() {
  ARCHIVE_OUTER_SIGNAL_BIN="$(mktemp -d "$TMP_ROOT/archive-outer-signal.XXXXXX")" || return 1
  REAL_GIT="$(type -P git)" || return 1
  export REAL_GIT
  cat > "$ARCHIVE_OUTER_SIGNAL_BIN/git" <<'EOF'
#!/bin/bash
if test "${1:-}" = update-ref && test "${2:-}" = --stdin; then
  ref=
  new_oid=
  old_oid=
  while IFS= read -r line; do
    case "$line" in
      start) printf 'start: ok\n' ;;
      'option no-deref') ;;
      update\ *) set -- $line; ref=$2; new_oid=$3; old_oid=$4 ;;
      prepare) printf 'prepare: ok\n' ;;
      commit)
        printf 'start\noption no-deref\nupdate %s %s %s\nprepare\ncommit\n' "$ref" "$new_oid" "$old_oid" | "$REAL_GIT" update-ref --stdin >/dev/null || exit 98
        printf 'exact-new\n' > "$ARCHIVE_OUTER_SIGNAL_MARKER"
        while :; do read -r ignored; done
        ;;
      *) exit 98 ;;
    esac
  done
fi
exec "$REAL_GIT" "$@"
EOF
  chmod 700 "$ARCHIVE_OUTER_SIGNAL_BIN/git"
}

run_external_archive_outer_signal_window() {
  local repo=$1 tuple_file=$2
  cd "$repo"
  mkdir -p "$repo/.git/archive-outer-signal-tmp"
  TMPDIR="$repo/.git/archive-outer-signal-tmp"
  PATH="$ARCHIVE_OUTER_SIGNAL_BIN:$REAL_PATH"
  APPROVAL_TUPLE="$(< "$tuple_file")"
  export TMPDIR PATH APPROVAL_TUPLE GIT_MASTER=1
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
}

run_external_archive_outer_exit_window() (
  local repo=$1 tuple_file=$2
  external_archive_outer_exit() {
    trap - EXIT
    run_external_archive_outer_signal_window "$repo" "$tuple_file"
  }
  trap external_archive_outer_exit EXIT
  exit 1
)

assert_archive_outer_signal_rolls_back_exact_new() {
  local runner=${1:-run_external_archive_outer_signal_window} check_transaction_directories=${2:-0} repo marker outer_pid outer_pgid parent_pgid status=0 marker_line outer_waited=0 transaction_parent transaction_dirs_before
  archive_outer_signal_cleanup() {
    if test "$outer_waited" = 0 && test -n "${outer_pgid:-}"; then
      kill -TERM -- "-$outer_pgid" 2>/dev/null || :
      if wait "$outer_pid"; then :; else :; fi
      outer_waited=1
    fi
  }
  trap archive_outer_signal_cleanup RETURN
  setup_external_archive_decision_fixture archive-outer-signal || fail 'could not prepare archive outer-signal fixture'
  extract_external_archive_execution_fence || fail 'could not extract archive execution fence'
  repo=$EXTERNAL_DECISION_REPO
  transaction_parent="$repo/.git/archive-outer-signal-tmp"
  transaction_dirs_before="$(transaction_directory_identity_set "$transaction_parent")"
  marker="$repo/.git/archive-outer-signal.marker"
  mkfifo "$marker"
  ARCHIVE_OUTER_SIGNAL_MARKER=$marker
  export ARCHIVE_OUTER_SIGNAL_MARKER
  install_archive_outer_signal_git_shim || fail 'could not install archive outer-signal shim'
  set -m
  "$runner" "$repo" "$EXTERNAL_DECISION_TUPLE" > "$TMP_ROOT/archive-outer-signal.log" 2>&1 &
  outer_pid=$!
  set +m
  outer_pgid="$(ps -p "$outer_pid" -o pgid= | tr -d '[:space:]')" || fail 'archive outer-signal PGID was unreadable'
  parent_pgid="$(ps -p "$$" -o pgid= | tr -d '[:space:]')" || fail 'archive outer-signal parent PGID was unreadable'
  test "$outer_pid" = "$outer_pgid" || fail 'archive outer-signal target did not lead its process group'
  test "$outer_pgid" != "$parent_pgid" || fail 'archive outer-signal target shared the parent process group'
  IFS= read -r marker_line < "$marker" || fail 'archive outer-signal marker was not delivered'
  test "$marker_line" = exact-new || fail 'archive outer-signal marker was malformed'
  kill -TERM -- "-$outer_pgid" || fail 'archive outer-signal group TERM failed'
  if wait "$outer_pid"; then status=0; else status=$?; fi
  outer_waited=1
  test "$status" != 0 || fail 'archive outer-signal canary unexpectedly succeeded'
  assert_external_archive_ref_is_parent "$repo" 'archive outer-signal exact-new rollback'
  if test "$check_transaction_directories" = 1; then
    assert_transaction_directory_identity_set "$transaction_parent" "$transaction_dirs_before" 'archive outer-EXIT TERM rollback'
  fi
  trap - RETURN
}

assert_outer_exit_transaction_directory_cleanup() {
  install_commit_fence_outer_signal_git_shim || fail 'could not install outer-EXIT commit fence shim'
  assert_terminal_cross_product_case plan exact 0 nonempty 1 0
  pass 'outer-EXIT rejected-terminal rollback preserves parent refs'
}

assert_stage_preflight_git_reads_are_checked() {
  local preflight="$TMP_ROOT/stage-preflight-fence.sh" guard_log="$TMP_ROOT/stage-preflight-git-read-guard.log"
  extract_all_bash_fences "$STAGE_SKILL" "$TMP_ROOT/stage-preflight-fences" || return 1
  preflight="$TMP_ROOT/stage-preflight-fences/fence-001.sh"
  test -f "$preflight" || return 1
  awk '
    /test[[:space:]]+"[$][(]git[[:space:]]/ { print FILENAME ":" NR ": unchecked Git preflight substitution" > log; invalid = 1 }
    END { exit invalid }
  ' log="$guard_log" "$preflight" || fail 'stage preflight has an unchecked Git decision read'
  test ! -s "$guard_log" || fail 'stage preflight unchecked Git guard recorded a decision read'
}

run_stage_preflight_with_failed_git_read() (
  local repo=$1 preflight=$2 command_name=$3 expected_output=$4 verification_marker=$5
  cd "$repo"
  APPROVED_IMPL_PLAN_COMMIT_FILE="$repo/.git/approved-plan-oid"
  printf '%s\n' "$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)" > "$APPROVED_IMPL_PLAN_COMMIT_FILE"
  mktemp() { printf '%s\n' "$APPROVED_IMPL_PLAN_COMMIT_FILE"; }
  PREFLIGHT_FAILURE_COMMAND=$command_name
  PREFLIGHT_FAILURE_OUTPUT=$expected_output
  PREFLIGHT_FAILURE_USED=0
  git() {
    local argument command=
    for argument in "$@"; do case "$argument" in -*) ;; *) command=$argument; break ;; esac; done
    if test "$PREFLIGHT_FAILURE_USED" = 0 && test "$command" = "$PREFLIGHT_FAILURE_COMMAND"; then
      PREFLIGHT_FAILURE_USED=1
      printf '%s' "$PREFLIGHT_FAILURE_OUTPUT"
      return 97
    fi
    command git "$@"
  }
  cat "$preflight" > "$TMP_ROOT/stage-preflight-under-test.sh"
  printf '\nprintf "verification executed\\n" > "%s"\n' "$verification_marker" >> "$TMP_ROOT/stage-preflight-under-test.sh"
  /bin/bash -euo pipefail "$TMP_ROOT/stage-preflight-under-test.sh"
)

assert_stage_preflight_failure_table() {
  local repo preflight command_name expected_output marker
  extract_all_bash_fences "$STAGE_SKILL" "$TMP_ROOT/stage-preflight-fences" || fail 'could not extract stage preflight fence'
  preflight="$TMP_ROOT/stage-preflight-fences/fence-001.sh"
  for command_name in diff-tree ls-tree ls-files rev-parse hash-object; do
    repo="$(new_commit_fence_canary_repo "stage-preflight-$command_name")"
    mkdir -p "$repo/mydocs/plans"
    printf 'approved plan\n' > "$repo/mydocs/plans/task_m100_7_impl.md"
    GIT_MASTER=1 git -C "$repo" add mydocs/plans/task_m100_7_impl.md
    commit_canary_index "$repo" approved-plan
    case "$command_name" in
      diff-tree) expected_output=$'mydocs/plans/task_m100_7_impl.md\n' ;;
      ls-tree) expected_output=$'100644 blob 0000000000000000000000000000000000000000\tmydocs/plans/task_m100_7_impl.md\n' ;;
      ls-files) expected_output=$'100644 0000000000000000000000000000000000000000 0\tmydocs/plans/task_m100_7_impl.md\n' ;;
      rev-parse|hash-object) expected_output=$'0000000000000000000000000000000000000000\n' ;;
    esac
    marker="$repo/.git/preflight-verification-$command_name"
    if run_stage_preflight_with_failed_git_read "$repo" "$preflight" "$command_name" "$expected_output" "$marker"; then
      fail "stage preflight accepted plausible nonzero $command_name stdout"
    fi
    test ! -e "$marker" || fail "stage preflight ran plan verification after failed $command_name"
  done
}

setup_external_archive_three_source_fixture() {
  local repo implementation_sha implementation_bytes parent tuple_next
  setup_external_archive_decision_fixture "$1" || return 1
  repo=$EXTERNAL_DECISION_REPO
  write_external_archive_identity "$repo/mydocs/pr/pr_7_review_impl.md" 0
  chmod 600 "$repo/mydocs/pr/pr_7_review_impl.md" || return 1
  GIT_MASTER=1 git -C "$repo" add mydocs/pr/pr_7_review_impl.md || return 1
  commit_canary_index "$repo" external-three-source-fixture || return 1
  parent="$(GIT_MASTER=1 git -C "$repo" rev-parse HEAD)" || return 1
  implementation_sha="$(shasum -a 256 "$repo/mydocs/pr/pr_7_review_impl.md" | cut -d' ' -f1)" || return 1
  implementation_bytes="$(wc -c < "$repo/mydocs/pr/pr_7_review_impl.md" | tr -d ' ')" || return 1
  tuple_next="$repo/.git/external-three-source-tuple.json"
  jq -S -c \
    --arg parent "$parent" \
    --arg sha "$implementation_sha" \
    --argjson bytes "$implementation_bytes" \
    '.parentOid = $parent | .sources.implementation = {role:"implementation",path:"mydocs/pr/pr_7_review_impl.md",destination:"mydocs/pr/archives/pr_7_round1/pr_7_review_impl.md",present:true,state:"tracked",sha256:$sha,bytes:$bytes}' \
    "$EXTERNAL_DECISION_TUPLE" > "$tuple_next" || return 1
  EXTERNAL_DECISION_PARENT=$parent
  EXTERNAL_DECISION_TUPLE=$tuple_next
}

archive_capture_three_source_state() {
  local repo=$1 state_dir=$2 prefix=$3 source destination
  for source in mydocs/pr/pr_7_review.md mydocs/pr/pr_7_report.md mydocs/pr/pr_7_review_impl.md; do
    destination="mydocs/pr/archives/pr_7_round1/${source##*/}"
    archive_capture_path_state "$repo/$source" "$state_dir" "$prefix-${source##*/}-source" || return 1
    archive_capture_path_state "$repo/$destination" "$state_dir" "$prefix-${source##*/}-destination" || return 1
    archive_capture_index_state "$repo" "$source" "$state_dir" "$prefix-${source##*/}-source" || return 1
    archive_capture_index_state "$repo" "$destination" "$state_dir" "$prefix-${source##*/}-destination" || return 1
  done
  archive_capture_path_state "$repo/mydocs/pr/archives/pr_7_round1" "$state_dir" "$prefix-archive-root"
}

archive_expect_three_source_state() {
  local repo=$1 state_dir=$2 prefix=$3 label=$4 source destination
  for source in mydocs/pr/pr_7_review.md mydocs/pr/pr_7_report.md mydocs/pr/pr_7_review_impl.md; do
    destination="mydocs/pr/archives/pr_7_round1/${source##*/}"
    archive_expect_path_state "$repo/$source" "$state_dir" "$prefix-${source##*/}-source" "$label"
    archive_expect_path_state "$repo/$destination" "$state_dir" "$prefix-${source##*/}-destination" "$label"
    archive_expect_index_state "$repo" "$source" "$state_dir" "$prefix-${source##*/}-source" "$label"
    archive_expect_index_state "$repo" "$destination" "$state_dir" "$prefix-${source##*/}-destination" "$label"
  done
  archive_expect_path_state "$repo/mydocs/pr/archives/pr_7_round1" "$state_dir" "$prefix-archive-root" "$label"
}

run_external_archive_with_post_stage_failure() (
  local repo=$1 tuple_file=$2 command_name=$3 source_name=$4 occurrence=$5 hit_file=$6
  cd "$repo" || exit 1
  repo="$(pwd -P)" || exit 1
  mkdir -p "$repo/.git/archive-post-stage-tmp" || exit 1
  TMPDIR="$repo/.git/archive-post-stage-tmp"
  APPROVAL_TUPLE="$(< "$tuple_file")"
  POST_STAGE_COMMAND=$command_name
  POST_STAGE_SOURCE=$source_name
  POST_STAGE_OCCURRENCE=$occurrence
  POST_STAGE_HITS=0
  POST_STAGE_ACTIVE=
  POST_STAGE_HIT_FILE=$hit_file
  POST_STAGE_COUNTER_FILE="$repo/.git/three-source-post-stage-counter"
  printf '0\n' > "$POST_STAGE_COUNTER_FILE" || exit 1
  export TMPDIR APPROVAL_TUPLE GIT_MASTER=1 POST_STAGE_COMMAND POST_STAGE_SOURCE POST_STAGE_OCCURRENCE POST_STAGE_HIT_FILE POST_STAGE_COUNTER_FILE
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  post_stage_matches_path() {
    local argument destination="mydocs/pr/archives/pr_7_round1/${POST_STAGE_ACTIVE##*/}"
    for argument in "$@"; do
      test "$argument" = "$destination" && return 0
      test "$argument" = "$repo/$destination" && return 0
    done
    return 1
  }
  post_stage_fail_with_plausible_output() {
    printf '%s\n' "$POST_STAGE_COMMAND:$POST_STAGE_ACTIVE:$POST_STAGE_HITS" > "$POST_STAGE_HIT_FILE"
    return 97
  }
  post_stage_record_matching_hit() {
    if IFS= read -r POST_STAGE_HITS < "$POST_STAGE_COUNTER_FILE"; then :; else return 98; fi
    case "$POST_STAGE_HITS" in ''|*[!0-9]*) return 98 ;; esac
    POST_STAGE_HITS=$((POST_STAGE_HITS + 1))
    printf '%s\n' "$POST_STAGE_HITS" > "$POST_STAGE_COUNTER_FILE" || return 98
    test -e "$POST_STAGE_HIT_FILE" && return 0
    if test "$POST_STAGE_HITS" = "$POST_STAGE_OCCURRENCE"; then post_stage_fail_with_plausible_output; return $?; fi
  }
  git() {
    local status argument last_argument= command_name
    archive_git_command_name "$@"
    command_name=$ARCHIVE_GIT_COMMAND
    for argument in "$@"; do last_argument=$argument; done
    if test "$command_name" = add; then
      command git "$@"
      status=$?
      test "$status" = 0 || return "$status"
      case "$last_argument" in
        */pr_7_review.md|*/pr_7_report.md|*/pr_7_review_impl.md)
          POST_STAGE_ACTIVE="${last_argument##*/}"
          ;;
      esac
      return 0
    fi
    command git "$@"
    status=$?
    if test "$POST_STAGE_ACTIVE" = "$POST_STAGE_SOURCE" && test "$command_name" = "$POST_STAGE_COMMAND" && post_stage_matches_path "$@"; then
      post_stage_record_matching_hit || return $?
    fi
    return "$status"
  }
  shasum() {
    command shasum "$@"
    status=$?
    if test "$POST_STAGE_ACTIVE" = "$POST_STAGE_SOURCE" && test "$POST_STAGE_COMMAND" = digest && post_stage_matches_path "$@"; then
      post_stage_record_matching_hit || return $?
    fi
    return "$status"
  }
  wc() {
    command wc "$@"
    status=$?
    if test "$POST_STAGE_ACTIVE" = "$POST_STAGE_SOURCE" && test "$POST_STAGE_COMMAND" = bytes; then
      post_stage_record_matching_hit || return $?
    fi
    return "$status"
  }
  source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
)

assert_archive_post_stage_three_source_table() {
  local command_name source_name occurrence repo state_dir hit_file output_file label
  extract_external_archive_execution_fence || fail 'could not extract three-source archive execution fence'
  for command_name in ls-files hash-object digest bytes; do
    for source_name in pr_7_review.md pr_7_report.md pr_7_review_impl.md; do
      for occurrence in 1 2; do
        label="three-source post-stage $command_name/$source_name/$occurrence"
        setup_external_archive_three_source_fixture "archive-$command_name-${source_name%.md}-$occurrence" || fail "could not prepare $label"
        repo=$EXTERNAL_DECISION_REPO
        state_dir="$repo/.git/three-source-state"
        mkdir "$state_dir" || fail "could not create $label state"
        archive_capture_three_source_state "$repo" "$state_dir" before || fail "could not capture $label state"
        hit_file="$repo/.git/three-source-hit"
        output_file="$TMP_ROOT/archive-three-source-${RANDOM}.log"
        if run_external_archive_with_post_stage_failure "$repo" "$EXTERNAL_DECISION_TUPLE" "$command_name" "$source_name" "$occurrence" "$hit_file" > "$output_file" 2>&1; then
          fail "$label unexpectedly succeeded"
        fi
        test -s "$hit_file" || fail "$label did not execute its deterministic post-stage failure"
        archive_expect_direct_ref "$repo" refs/heads/local/archive "$EXTERNAL_DECISION_PARENT" "$label"
        archive_expect_three_source_state "$repo" "$state_dir" before "$label"
        test -z "$ARCHIVE_OWNERSHIP_CANARY_GAPS" || fail "$ARCHIVE_OWNERSHIP_CANARY_GAPS"
      done
    done
  done
}

assert_external_archive_nested_cwd_absolute_digests() {
  local repo nested operand_log destination expected_count actual_count
  setup_external_archive_three_source_fixture archive-nested-cwd || fail 'could not prepare nested-CWD archive fixture'
  extract_external_archive_execution_fence || fail 'could not extract nested-CWD archive fence'
  repo=$EXTERNAL_DECISION_REPO
  repo="$(cd -P -- "$repo" && pwd -P)" || fail 'could not canonicalize nested-CWD archive fixture path'
  nested="$repo/.git/nested-cwd"
  operand_log="$repo/.git/nested-cwd-shasum-operands"
  mkdir "$nested" || fail 'could not create nested-CWD fixture directory'
  (
    cd "$nested" || exit 1
    APPROVAL_TUPLE="$(< "$EXTERNAL_DECISION_TUPLE")"
    export APPROVAL_TUPLE GIT_MASTER=1
    export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
    export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
    git() {
      command git -C "$repo" "$@"
    }
    shasum() {
      printf '%s\n' "$*" >> "$operand_log"
      command shasum "$@"
    }
    source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
  ) || fail 'nested-CWD archive execution did not succeed'
  for destination in mydocs/pr/archives/pr_7_round1/pr_7_review.md mydocs/pr/archives/pr_7_round1/pr_7_report.md mydocs/pr/archives/pr_7_round1/pr_7_review_impl.md; do
    expected_count=6
    actual_count="$(grep -Fc -- "-a 256 $repo/$destination" "$operand_log")"
    test "$actual_count" = "$expected_count" || fail "nested-CWD archive digest operand was not absolute for $destination expected=$expected_count actual=$actual_count"
  done
  GIT_MASTER=1 git -C "$repo" diff --cached --quiet || fail 'nested-CWD archive execution left staged residue'
  GIT_MASTER=1 git -C "$repo" diff --quiet || fail 'nested-CWD archive execution left worktree residue'
  test -z "$(GIT_MASTER=1 git -C "$repo" status --porcelain=v1 --untracked-files=all)" || fail 'nested-CWD archive execution left untracked residue'
}

run_external_archive_three_source_rollback_failure() (
  local repo=$1 tuple_file=$2 restore_after=$3 competitor_kind=$4 state_dir=$5
  cd "$repo" || exit 1
  repo="$(pwd -P)" || exit 1
  mkdir -p "$repo/.git/archive-three-source-rollback-tmp" || exit 1
  TMPDIR="$repo/.git/archive-three-source-rollback-tmp"
  APPROVAL_TUPLE="$(< "$tuple_file")"
  ARCHIVE_THREE_ROLLBACK=0
  ARCHIVE_THREE_RESTORES=0
  ARCHIVE_THREE_RESTORE_AFTER=$restore_after
  ARCHIVE_THREE_COMPETITOR_KIND=$competitor_kind
  ARCHIVE_THREE_INJECTED=0
  ARCHIVE_THREE_STATE_DIR=$state_dir
  ARCHIVE_THREE_ROLLBACK_MARKER="$repo/.git/three-source-rollback-active"
  ARCHIVE_THREE_RESTORES_FILE="$repo/.git/three-source-rollback-restores"
  ARCHIVE_THREE_INJECTED_MARKER="$repo/.git/three-source-rollback-injected"
  printf '0\n' > "$ARCHIVE_THREE_RESTORES_FILE" || exit 1
  export TMPDIR APPROVAL_TUPLE GIT_MASTER=1 ARCHIVE_THREE_ROLLBACK_MARKER ARCHIVE_THREE_RESTORES_FILE ARCHIVE_THREE_INJECTED_MARKER
  export GIT_AUTHOR_NAME=workflow GIT_AUTHOR_EMAIL=workflow@example.test
  export GIT_COMMITTER_NAME=workflow GIT_COMMITTER_EMAIL=workflow@example.test
  archive_three_source_capture_competitor() {
    local path=$1 label=$2
    archive_capture_path_state "$path" "$ARCHIVE_THREE_STATE_DIR" "$label" || return 1
    case "$label" in *source|*destination) archive_capture_index_state "$repo" "${path#$repo/}" "$ARCHIVE_THREE_STATE_DIR" "$label" ;; esac
  }
  archive_three_source_inject_competitor() {
    local claim_path=$1 source_path=$2 destination_path=${claim_path%.rollback.*} competitor_path
    case "$ARCHIVE_THREE_COMPETITOR_KIND" in
      source)
        printf 'competing source replacement\n' > "$source_path" || return 1
        chmod 600 "$source_path" || return 1
        archive_three_source_capture_competitor "$source_path" competitor-source
        competitor_path=$source_path
        ;;
      destination|compensation)
        printf 'competing destination replacement\n' > "$destination_path" || return 1
        chmod 600 "$destination_path" || return 1
        archive_three_source_capture_competitor "$destination_path" competitor-destination
        competitor_path=$destination_path
        ;;
      claim)
        command mv -- "$claim_path" "$claim_path.owned" || return 1
        printf 'competing claim replacement\n' > "$claim_path" || return 1
        chmod 600 "$claim_path" || return 1
        archive_three_source_capture_competitor "$claim_path" competitor-claim
        archive_three_source_capture_competitor "$claim_path.owned" owned-claim
        competitor_path=$claim_path
        ;;
      *) return 1 ;;
    esac
    ARCHIVE_THREE_INJECTED=1
    : > "$ARCHIVE_THREE_INJECTED_MARKER" || return 1
    printf '%s\n' "$ARCHIVE_THREE_COMPETITOR_KIND" > "$ARCHIVE_THREE_STATE_DIR/injected"
    printf '%s\n' "$competitor_path" > "$ARCHIVE_THREE_STATE_DIR/competitor-path"
  }
  git() {
    local status
    archive_git_command_name "$@"
    if test ! -e "$ARCHIVE_THREE_ROLLBACK_MARKER" && test "$ARCHIVE_GIT_COMMAND" = write-tree; then
      command git "$@" >/dev/null || return 1
      : > "$ARCHIVE_THREE_ROLLBACK_MARKER" || return 1
      return 97
    fi
    command git "$@"
    status=$?
    return "$status"
  }
  mv() {
    local first=${1:-} second=${2:-} source_path destination_path
    if test "$first" = --; then first=${2:-}; second=${3:-}; fi
    if test -e "$ARCHIVE_THREE_ROLLBACK_MARKER"; then
      case "$first:$second" in
        *.rollback.*:"$repo"/mydocs/pr/pr_7_*.md)
          if IFS= read -r ARCHIVE_THREE_RESTORES < "$ARCHIVE_THREE_RESTORES_FILE"; then :; else return 1; fi
          ARCHIVE_THREE_RESTORES=$((ARCHIVE_THREE_RESTORES + 1))
          printf '%s\n' "$ARCHIVE_THREE_RESTORES" > "$ARCHIVE_THREE_RESTORES_FILE" || return 1
          if test "$ARCHIVE_THREE_COMPETITOR_KIND" = compensation && test ! -e "$ARCHIVE_THREE_INJECTED_MARKER"; then
            return 97
          fi
          if test ! -e "$ARCHIVE_THREE_INJECTED_MARKER" && test "$ARCHIVE_THREE_RESTORES" -gt "$ARCHIVE_THREE_RESTORE_AFTER"; then
            archive_three_source_inject_competitor "$first" "$second" || return 1
            return 97
          fi
          ;;
        *.rollback.*:"$repo"/*)
          if test "$ARCHIVE_THREE_COMPETITOR_KIND" = compensation && test ! -e "$ARCHIVE_THREE_INJECTED_MARKER"; then
            archive_three_source_inject_competitor "$first" "$second" || return 1
            return 97
          fi
          ;;
      esac
    fi
    command mv "$@"
  }
  source "$EXTERNAL_ARCHIVE_EXECUTION_FENCE"
)

assert_archive_three_source_compensation_case() {
  local restore_after=$1 competitor_kind=$2 repo state_dir label expected_label competitor_path competitor_relative
  label="three-source rollback after $restore_after restores with $competitor_kind replacement"
  setup_external_archive_three_source_fixture "archive-compensation-$restore_after-$competitor_kind" || fail "could not prepare $label"
  repo=$EXTERNAL_DECISION_REPO
  state_dir="$repo/.git/archive-three-source-compensation"
  mkdir "$state_dir" || fail "could not create $label state"
  if run_external_archive_three_source_rollback_failure "$repo" "$EXTERNAL_DECISION_TUPLE" "$restore_after" "$competitor_kind" "$state_dir" > "$TMP_ROOT/archive-compensation-${RANDOM}.log" 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  test -f "$state_dir/injected" || fail "$label did not reach its deterministic rollback failure"
  IFS= read -r competitor_path < "$state_dir/competitor-path" || fail "$label did not record its competing path"
  archive_expect_direct_ref "$repo" refs/heads/local/archive "$EXTERNAL_DECISION_PARENT" "$label"
  GIT_MASTER=1 git -C "$repo" diff --cached --quiet || fail "$label changed a non-owned index entry"
  case "$competitor_kind" in
    source)
      expected_label=competitor-source
      archive_expect_path_state "$competitor_path" "$state_dir" "$expected_label" "$label"
      competitor_relative=${competitor_path#"$repo"/}
      archive_expect_index_state "$repo" "$competitor_relative" "$state_dir" "$expected_label" "$label"
      ;;
    destination|compensation)
      expected_label=competitor-destination
      archive_expect_path_state "$competitor_path" "$state_dir" "$expected_label" "$label"
      competitor_relative=${competitor_path#"$repo"/}
      archive_expect_index_state "$repo" "$competitor_relative" "$state_dir" "$expected_label" "$label"
      ;;
    claim)
      archive_expect_path_state "$competitor_path" "$state_dir" competitor-claim "$label"
      ;;
  esac
}

assert_archive_three_source_compensation_failures() {
  assert_archive_three_source_compensation_case 0 source
  assert_archive_three_source_compensation_case 1 destination
  assert_archive_three_source_compensation_case 2 claim
  assert_archive_three_source_compensation_case 0 compensation
}

assert_archive_three_source_compensation_contract() {
  local rollback="$TMP_ROOT/archive-step5-rollback.sh"
  assert_contains "$rollback" 'while test "$rollback_failed" != 0 && test "$j" -ge 0; do'
  assert_contains "$rollback" 'ROLLBACK_CLAIMS[$rollback_claim_count]=$claim_path'
  assert_contains "$rollback" 'test ! -e "$destination_path" && test ! -L "$destination_path" && test -f "$claim_path"'
  assert_contains "$rollback" 'archive_restore_owned_destination "$source_path" "$claim_path"'
}

assert_second_review_rejects_bare_transaction_status_capture
assert_inherited_errexit_transport_failure_rolls_back
assert_terminal_cross_product
assert_outer_exit_transaction_directory_cleanup
assert_snapshot_irreversible_boundaries
assert_archive_root_capture_is_irreversible
assert_archive_root_failure_never_adopts_replacement
assert_stage_preflight_git_reads_are_checked
assert_stage_preflight_failure_table
assert_archive_post_stage_three_source_table
assert_external_archive_nested_cwd_absolute_digests
assert_archive_three_source_compensation_contract
assert_archive_three_source_compensation_failures

printf '1..%d\n' "$pass_count"
