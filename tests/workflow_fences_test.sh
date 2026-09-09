#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd -P -- "$(dirname -- "$0")/.." && pwd -P)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gpuwatcher-workflow-fences.XXXXXX")"
trap 'rm -rf -- "$TMP_ROOT"' EXIT HUP INT TERM

pass_count=0
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
pass() { pass_count=$((pass_count + 1)); printf 'ok %d - %s\n' "$pass_count" "$1"; }
expect_success() { "$@" || fail "$1"; }
expect_failure() { if "$@"; then fail "$1 unexpectedly succeeded"; fi; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || fail "missing $2 in $1"; }
assert_absent() { if grep -F -- "$2" "$1" >/dev/null; then fail "forbidden $2 in $1"; fi; }

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
WORKFLOW_MANUAL="$REPO_ROOT/mydocs/manual/task_workflow_guide.md"
assert_absent "$START_SKILL" 'gh repo view "$CANONICAL_REPOSITORY" --json databaseId'
if rg -n -- '--slurp[^\n]*--jq' "$FINAL_SKILL"; then fail 'slurp and gh jq are combined'; fi
assert_contains "$FINAL_SKILL" 'graphql --paginate --slurp'
assert_contains "$FINAL_SKILL" 'closingIssuesReferences(first: 100, after: $endCursor)'
assert_contains "$FINAL_SKILL" 'chmod 600 "$PUBLICATION_DIR/title" "$PUBLICATION_DIR/body"'
assert_contains "$FINAL_SKILL" '0[0-8b-f]'
assert_contains "$START_SKILL" 'git -c core.hooksPath=/dev/null commit'
assert_contains "$STAGE_SKILL" 'git -c core.hooksPath=/dev/null commit'
assert_contains "$FINAL_SKILL" 'git -c core.hooksPath=/dev/null commit'
assert_contains "$EXTERNAL_SKILL" '-c core.hooksPath=/dev/null commit'
assert_contains "$WORKFLOW_MANUAL" 'git -c core.hooksPath=/dev/null commit'
assert_contains "$AGENTS_FILE" 'PR merge만으로 close를 승인하지 않으며'
assert_contains "$AGENTS_FILE" '타스크 진행 16단계'
test "$(grep -Ec '이 절차에는 같은 스레드의 서로 다른 두 승인만 있다\.|1\. final report/evidence 승인:|2\. publication 승인:' "$FINAL_SKILL")" = 3 || fail 'approval contract changed'
assert_absent "$EXTERNAL_SKILL" 'graphql mutation'
assert_absent "$EXTERNAL_SKILL" '--method POST'
assert_contains "$EXTERNAL_SKILL" 'gh api --method GET'
pass 'workflow source retains two approvals, read-only external calls, and fail-closed contracts'

printf '1..%d\n' "$pass_count"
