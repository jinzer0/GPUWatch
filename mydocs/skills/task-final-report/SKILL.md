---
name: task-final-report
description: |
  하이퍼-워터폴 타스크의 최종 보고와 승인된 exact OID PR 게시 절차를 적용한다.
  최종 보고 증거 승인과 exact publication tuple 승인을 분리하고, 승인된 상태에서만 publish/task{N} Open PR을 생성 또는 재개한다.
---

# 하이퍼-워터폴 최종 보고와 PR 게시

## 트리거

- 작업지시자가 "최종 보고서 작성", "PR 준비"를 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 최초 승인된 구현 계획서 commit은 Stage 1보다 먼저 존재하고, 모든 Stage 보고서와 승인이 완료됨
- 최신 승인 구현 계획서 OID와 통합 검증 명령을 작업지시자가 같은 스레드에서 지정함
- `local/task{N}`에 최종 보고서/오늘할일에 포함할 변경 외 미커밋 변경이 없음
- 작업지시자가 `ISSUE_NUMBER`, `APPROVED_IMPL_PLAN_COMMIT`, `IMPL_PLAN`, `ORDER_FILE`, 실행한 수용 기준의 원문 증거 `ACCEPTANCE_EVIDENCE`를 제공함. `IMPL_PLAN`은 `mydocs/plans/task_{milestone_slug}_{N}_impl.md`이고 `ORDER_FILE`은 `mydocs/orders/{yyyymmdd}.md`이다.

## 승인 경계

이 절차에는 같은 스레드의 서로 다른 두 승인만 있다.

1. final report/evidence 승인: 최종 보고서와 오늘할일 commit, 정확한 두 blob, 수용 기준 증거 hash를 결박한다. 이 승인이 있기 전에는 publication input directory, PR 제목, PR 본문을 만들지 않는다.
2. publication 승인: 원격 `devel`/publish ref와 Open PR의 분류, title/body hash를 결박한다. 이 tuple을 만들기 위한 canonical identity, issue, ref, Open PR 상태의 read-only 조회(`gh api --method GET`, GraphQL query, `ls-remote`, 검증용 `fetch`)는 이 승인 전에 허용한다. 이 승인 전에는 원격 mutation(`push`, `gh api --method POST`, PR 생성 또는 재개)을 하지 않는다.

이전 Stage 승인, 최종 보고서 작성 지시, 첫 번째 승인, 이 Skill 호출은 두 번째 publication 승인이 아니다.

## 절차

1. 이슈와 구현 계획서 승인 상태를 검증하고 수용 기준을 실행한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_IMPL_PLAN_COMMIT:-}"
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   printf '%s\n' "$IMPL_PLAN" | grep -Eq "^mydocs/plans/task_m[0-9]+x?_${ISSUE_NUMBER}_impl\\.md$"
   case "$ORDER_FILE" in
     mydocs/orders/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].md) ;;
     *) exit 1 ;;
   esac
   case "$ORDER_FILE" in *$'\r'*|*$'\n'*) exit 1 ;; esac

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   printf '%s\n' "$FINAL_REPORT" | grep -Eq "^mydocs/report/task_m[0-9]+x?_${ISSUE_NUMBER}_report\\.md$"

   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test ! -L "$IMPL_PLAN"
   test "$(git ls-tree "$APPROVED_IMPL_PLAN_COMMIT" -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644"
   test "$(git ls-tree HEAD -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644"
   test "$(git ls-files -s -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644"
   PLAN_BLOB="$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")"
   test "$PLAN_BLOB" = "$(git rev-parse "HEAD:$IMPL_PLAN")"
   test "$PLAN_BLOB" = "$(git rev-parse ":$IMPL_PLAN")"
   test "$PLAN_BLOB" = "$(git hash-object -- "$IMPL_PLAN")"
   git merge-base --is-ancestor "$APPROVED_IMPL_PLAN_COMMIT" HEAD

   test -n "${ACCEPTANCE_EVIDENCE:-}"
   case "$ACCEPTANCE_EVIDENCE" in *$'\r'*) exit 1 ;; esac
   ACCEPTANCE_EVIDENCE_SHA256="$(sha256_text "$ACCEPTANCE_EVIDENCE")"
   printf '%s\n' "acceptance_evidence_sha256=$ACCEPTANCE_EVIDENCE_SHA256"
   ```
   - 위 검증 뒤 승인된 구현 계획서의 수용 기준 또는 마지막 Stage 검증 명령을 실제로 실행한다. `ACCEPTANCE_EVIDENCE`에는 실행한 명령, exit status, 필요한 출력 요약을 순서와 줄바꿈까지 보존해 넣는다. 다음 승인 fence에서도 동일한 원문을 다시 제공할 수 있어야 한다.
2. 최종 보고서와 오늘할일을 작성한다.
   - 최종 보고서는 `$FINAL_REPORT`에 `mydocs/_templates/final_report.md`를 기준으로 작성한다.
   - `$ORDER_FILE`의 `#{N}` 행을 `완료`와 완료 시각으로 갱신한다.
3. 최종 보고서와 오늘할일만 하나의 commit으로 만들고, hook 실행 전후의 저장소 전체 index와 commit 경로를 검증한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   case "${APPROVED_IMPL_PLAN_COMMIT:-}" in ""|*[!0-9a-f]*) exit 1 ;; esac
   test "${#APPROVED_IMPL_PLAN_COMMIT}" -eq 40
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   printf '%s\n' "$IMPL_PLAN" | grep -Eq "^mydocs/plans/task_m[0-9]+x?_${ISSUE_NUMBER}_impl\\.md$"
   case "$ORDER_FILE" in
     mydocs/orders/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].md) ;;
     *) exit 1 ;;
   esac

   validate_regular_0644_file() {
     ARTIFACT_PATH="$1"
     test -f "$ARTIFACT_PATH"
     test ! -L "$ARTIFACT_PATH"
     test "$(stat -f '%l' "$ARTIFACT_PATH")" = "1"
     test "$(stat -f '%Lp' "$ARTIFACT_PATH")" = "644"
   }

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   EXPECTED_COMMIT_PATHS="$(printf '%s\n%s' "$ORDER_FILE" "$FINAL_REPORT")"

   validate_regular_0644_file "$FINAL_REPORT"
   validate_regular_0644_file "$ORDER_FILE"

   test -z "$(git diff --cached --name-only)"
   git add -- "$FINAL_REPORT" "$ORDER_FILE"
   REPORT_STAGE_RECORD="$(git ls-files -s -- "$FINAL_REPORT")"
   ORDER_STAGE_RECORD="$(git ls-files -s -- "$ORDER_FILE")"
   test "$(printf '%s\n' "$REPORT_STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
   test "$(printf '%s\n' "$ORDER_STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
   REPORT_STAGED_BLOB_OID="$(printf '%s\n' "$REPORT_STAGE_RECORD" | awk '{print $2}')"
   ORDER_STAGED_BLOB_OID="$(printf '%s\n' "$ORDER_STAGE_RECORD" | awk '{print $2}')"
   test "$REPORT_STAGED_BLOB_OID" = "$(git hash-object -- "$FINAL_REPORT")"
   test "$ORDER_STAGED_BLOB_OID" = "$(git hash-object -- "$ORDER_FILE")"
   test -z "$(git diff --name-only)"
   test -z "$(git ls-files --others --exclude-standard)"
   test "$(git diff --cached --name-only)" = "$EXPECTED_COMMIT_PATHS"
   git diff --cached --check

   INDEX_BEFORE_COMMIT_HOOKS="$(git ls-files -s)"
   PRE_HOOK_TREE_OID="$(git write-tree)"
   test "$(git ls-tree "$PRE_HOOK_TREE_OID" -- "$FINAL_REPORT" | awk '{print $1 " " $3}')" = "100644 $REPORT_STAGED_BLOB_OID"
   test "$(git ls-tree "$PRE_HOOK_TREE_OID" -- "$ORDER_FILE" | awk '{print $1 " " $3}')" = "100644 $ORDER_STAGED_BLOB_OID"
   git commit -m "Task #${ISSUE_NUMBER}: 최종 보고서 작성과 오늘할일 완료 처리" \
     -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
     -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   FINAL_COMMIT_OID="$(git rev-parse --verify HEAD^{commit})"
   case "$FINAL_COMMIT_OID" in ""|*[!0-9a-f]*) exit 1 ;; esac
   test "${#FINAL_COMMIT_OID}" -eq 40
   test "$(git diff-tree --root --no-commit-id --name-only -r "$FINAL_COMMIT_OID")" = "$EXPECTED_COMMIT_PATHS"
   FINAL_COMMIT_TREE_OID="$(git rev-parse "$FINAL_COMMIT_OID^{tree}")"
   test "$FINAL_COMMIT_TREE_OID" = "$PRE_HOOK_TREE_OID"
   test "$(git ls-tree "$FINAL_COMMIT_TREE_OID" -- "$FINAL_REPORT" | awk '{print $1 " " $3}')" = "100644 $REPORT_STAGED_BLOB_OID"
   test "$(git ls-tree "$FINAL_COMMIT_TREE_OID" -- "$ORDER_FILE" | awk '{print $1 " " $3}')" = "100644 $ORDER_STAGED_BLOB_OID"
   test "$(git rev-parse "$FINAL_COMMIT_OID:$FINAL_REPORT")" = "$REPORT_STAGED_BLOB_OID"
   test "$(git rev-parse "$FINAL_COMMIT_OID:$ORDER_FILE")" = "$ORDER_STAGED_BLOB_OID"
   INDEX_AFTER_COMMIT_HOOKS="$(git ls-files -s)"
   test "$INDEX_BEFORE_COMMIT_HOOKS" = "$INDEX_AFTER_COMMIT_HOOKS"
   validate_regular_0644_file "$FINAL_REPORT"
   validate_regular_0644_file "$ORDER_FILE"
   test -z "$(git diff --cached --name-only)"
   test -z "$(git diff --name-only)"
   test -z "$(git ls-files --others --exclude-standard)"
   test -z "$(git status --porcelain)"
   ```
   - `INDEX_BEFORE_COMMIT_HOOKS`와 `INDEX_AFTER_COMMIT_HOOKS`는 `pre-commit`, `prepare-commit-msg`, `commit-msg`, `post-commit`을 포함한 commit hook 실행 경계의 repository-wide index이다. 일치하지 않거나 final commit 경로가 정확히 두 경로가 아니면 publication으로 진행하지 않는다.
4. 첫 번째 final report/evidence 승인 tuple을 만들고 즉시 중단한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_artifact_binding() {
     ARTIFACT_PATH="$1"
     EXPECTED_BLOB_OID="$2"
     test -f "$ARTIFACT_PATH"
     test ! -L "$ARTIFACT_PATH"
     test "$(stat -f '%l' "$ARTIFACT_PATH")" = "1"
     test "$(stat -f '%Lp' "$ARTIFACT_PATH")" = "644"
     STAGE_RECORD="$(git ls-files -s -- "$ARTIFACT_PATH")"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $2}')" = "$EXPECTED_BLOB_OID"
     test "$(git ls-tree "$FINAL_COMMIT_OID" -- "$ARTIFACT_PATH" | awk '{print $1 " " $3}')" = "100644 $EXPECTED_BLOB_OID"
     test "$(git hash-object -- "$ARTIFACT_PATH")" = "$EXPECTED_BLOB_OID"
   }

   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_IMPL_PLAN_COMMIT:-}"
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   test -n "${ACCEPTANCE_EVIDENCE:-}"
   printf '%s\n' "$IMPL_PLAN" | grep -Eq "^mydocs/plans/task_m[0-9]+x?_${ISSUE_NUMBER}_impl\\.md$"
   case "$ORDER_FILE" in
     mydocs/orders/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].md) ;;
     *) exit 1 ;;
   esac
   case "$ACCEPTANCE_EVIDENCE" in *$'\r'*) exit 1 ;; esac

   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   FINAL_COMMIT_OID="$(git rev-parse --verify HEAD^{commit})"
   validate_oid "$FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$FINAL_COMMIT_OID"
   test -z "$(git status --porcelain)"

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   EXPECTED_COMMIT_PATHS="$(printf '%s\n%s' "$ORDER_FILE" "$FINAL_REPORT")"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$FINAL_COMMIT_OID:$IMPL_PLAN")"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$FINAL_COMMIT_OID")" = "$EXPECTED_COMMIT_PATHS"
   REPORT_BLOB_OID="$(git rev-parse "$FINAL_COMMIT_OID:$FINAL_REPORT")"
   ORDERS_BLOB_OID="$(git rev-parse "$FINAL_COMMIT_OID:$ORDER_FILE")"
   validate_oid "$REPORT_BLOB_OID"
   validate_oid "$ORDERS_BLOB_OID"
   validate_artifact_binding "$FINAL_REPORT" "$REPORT_BLOB_OID"
   validate_artifact_binding "$ORDER_FILE" "$ORDERS_BLOB_OID"
   ACCEPTANCE_EVIDENCE_SHA256="$(sha256_text "$ACCEPTANCE_EVIDENCE")"

   printf '%s\n' \
     "action=approve-final-report-and-evidence" \
     "issue_number=$ISSUE_NUMBER" \
     "approved_plan_oid=$APPROVED_IMPL_PLAN_COMMIT" \
     "final_commit_oid=$FINAL_COMMIT_OID" \
     "final_report_path=$FINAL_REPORT" \
     "final_report_blob_oid=$REPORT_BLOB_OID" \
     "orders_path=$ORDER_FILE" \
     "orders_blob_oid=$ORDERS_BLOB_OID" \
     "acceptance_evidence_sha256=$ACCEPTANCE_EVIDENCE_SHA256"
   ```
   - 여기서 즉시 중단한다. 작업지시자는 같은 스레드에서 `action=approve-final-report-and-evidence`와 출력된 모든 tuple 값을 정확히 명시해 승인해야 한다. 승인 응답 전에는 `$PUBLICATION_DIR`을 만들거나 title/body 파일을 만들지 않는다.
5. 첫 번째 승인을 정확히 다시 검증한 뒤에만 private publication input directory와 검증된 내부 PR 제목을 준비한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   validate_sha256() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 64; }
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_artifact_binding() {
     ARTIFACT_PATH="$1"
     EXPECTED_BLOB_OID="$2"
     test -f "$ARTIFACT_PATH"
     test ! -L "$ARTIFACT_PATH"
     test "$(stat -f '%l' "$ARTIFACT_PATH")" = "1"
     test "$(stat -f '%Lp' "$ARTIFACT_PATH")" = "644"
     STAGE_RECORD="$(git ls-files -s -- "$ARTIFACT_PATH")"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $2}')" = "$EXPECTED_BLOB_OID"
     test "$(git ls-tree "$FINAL_COMMIT_OID" -- "$ARTIFACT_PATH" | awk '{print $1 " " $3}')" = "100644 $EXPECTED_BLOB_OID"
     test "$(git hash-object -- "$ARTIFACT_PATH")" = "$EXPECTED_BLOB_OID"
   }
   validate_canonical_origin() {
     GH_HOST=github.com gh auth status --hostname github.com >/dev/null
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .id)" = "1256824919"
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .full_name)" = "jinzer0/GPUWatch"
     validate_origin_url_list() {
       ORIGIN_URL_LIST="$1"
       test -n "$ORIGIN_URL_LIST"
       SEEN_ORIGIN_URLS=""
       while IFS= read -r ORIGIN_URL; do
         case "$ORIGIN_URL" in
           git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
           *) exit 1 ;;
         esac
         case "$SEEN_ORIGIN_URLS" in *$'\n'"$ORIGIN_URL"$'\n'*) exit 1 ;; esac
         SEEN_ORIGIN_URLS="${SEEN_ORIGIN_URLS}"$'\n'"${ORIGIN_URL}"$'\n'
       done <<< "$ORIGIN_URL_LIST"
     }
     FETCH_ORIGIN_URLS_RAW="$({ if git remote get-url --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     FETCH_ORIGIN_URLS_RAW="${FETCH_ORIGIN_URLS_RAW%?}"
     case "$FETCH_ORIGIN_URLS_RAW" in *$'\n') FETCH_ORIGIN_URLS="${FETCH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     PUSH_ORIGIN_URLS_RAW="$({ if git remote get-url --push --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     PUSH_ORIGIN_URLS_RAW="${PUSH_ORIGIN_URLS_RAW%?}"
     case "$PUSH_ORIGIN_URLS_RAW" in *$'\n') PUSH_ORIGIN_URLS="${PUSH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     validate_origin_url_list "$FETCH_ORIGIN_URLS"
     validate_origin_url_list "$PUSH_ORIGIN_URLS"
   }
   read_validated_issue_title() {
     ISSUE_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/issues/$ISSUE_NUMBER" --jq '[.number, .state, ((.pull_request != null) | tostring), (.title | @base64)] | @tsv')"
     case "$ISSUE_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r RETURNED_ISSUE_NUMBER ISSUE_STATE IS_PULL_REQUEST ISSUE_TITLE_BASE64 ISSUE_EXTRA <<< "$ISSUE_RECORD"
     test -z "${ISSUE_EXTRA:-}"
     test "$RETURNED_ISSUE_NUMBER" = "$ISSUE_NUMBER"
     test "$ISSUE_STATE" = "open"
     test "$IS_PULL_REQUEST" = "false"
     ISSUE_TITLE_HEX="$(printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | od -An -tx1 -v)"
     ISSUE_TITLE_OCTETS="$(printf '%s\n' "$ISSUE_TITLE_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9a-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$ISSUE_TITLE_OCTETS"; then
       exit 1
     else
       ISSUE_TITLE_SCAN_STATUS=$?
       test "$ISSUE_TITLE_SCAN_STATUS" -eq 1
     fi
     printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | iconv -f UTF-8 -t UTF-8 >/dev/null
     ISSUE_TITLE_WITH_SENTINEL="$({ if printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D; then ISSUE_TITLE_DECODE_STATUS=0; else ISSUE_TITLE_DECODE_STATUS=$?; fi; printf '\001'; exit "$ISSUE_TITLE_DECODE_STATUS"; })"
     ISSUE_TITLE="${ISSUE_TITLE_WITH_SENTINEL%?}"
     test -n "$ISSUE_TITLE"
   }

   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_IMPL_PLAN_COMMIT:-}"
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   test -n "${ACCEPTANCE_EVIDENCE:-}"
   test "${APPROVED_FINAL_REPORT_ACTION:-}" = "approve-final-report-and-evidence"
   test "${APPROVED_FINAL_REPORT_ISSUE_NUMBER:-}" = "$ISSUE_NUMBER"
   test "${APPROVED_FINAL_REPORT_PLAN_OID:-}" = "$APPROVED_IMPL_PLAN_COMMIT"
   validate_oid "${APPROVED_FINAL_REPORT_FINAL_COMMIT_OID:-}"
   validate_oid "${APPROVED_FINAL_REPORT_REPORT_BLOB_OID:-}"
   validate_oid "${APPROVED_FINAL_REPORT_ORDERS_BLOB_OID:-}"
   validate_sha256 "${APPROVED_FINAL_REPORT_ACCEPTANCE_EVIDENCE_SHA256:-}"
   case "$ACCEPTANCE_EVIDENCE" in *$'\r'*) exit 1 ;; esac
   test "$(sha256_text "$ACCEPTANCE_EVIDENCE")" = "$APPROVED_FINAL_REPORT_ACCEPTANCE_EVIDENCE_SHA256"

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   test "${APPROVED_FINAL_REPORT_REPORT_PATH:-}" = "$FINAL_REPORT"
   test "${APPROVED_FINAL_REPORT_ORDERS_PATH:-}" = "$ORDER_FILE"
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   FINAL_COMMIT_OID="$(git rev-parse --verify HEAD^{commit})"
   validate_oid "$FINAL_COMMIT_OID"
   test "$FINAL_COMMIT_OID" = "$APPROVED_FINAL_REPORT_FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$FINAL_COMMIT_OID"
   test -z "$(git status --porcelain)"
   EXPECTED_COMMIT_PATHS="$(printf '%s\n%s' "$ORDER_FILE" "$FINAL_REPORT")"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$FINAL_COMMIT_OID")" = "$EXPECTED_COMMIT_PATHS"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$FINAL_COMMIT_OID:$IMPL_PLAN")"
   test "$(git rev-parse "$FINAL_COMMIT_OID:$FINAL_REPORT")" = "$APPROVED_FINAL_REPORT_REPORT_BLOB_OID"
   test "$(git rev-parse "$FINAL_COMMIT_OID:$ORDER_FILE")" = "$APPROVED_FINAL_REPORT_ORDERS_BLOB_OID"
   validate_artifact_binding "$FINAL_REPORT" "$APPROVED_FINAL_REPORT_REPORT_BLOB_OID"
   validate_artifact_binding "$ORDER_FILE" "$APPROVED_FINAL_REPORT_ORDERS_BLOB_OID"

   validate_canonical_origin
   read_validated_issue_title
   EXPECTED_PR_TITLE="Task #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

   umask 077
   TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
   PUBLICATION_DIR="$(mktemp -d "${TMP_PARENT%/}/gpuwatcher-task${ISSUE_NUMBER}-publication.XXXXXX")"
   chmod 700 "$PUBLICATION_DIR"
   test ! -L "$PUBLICATION_DIR"
   PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
   test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
   case "$(basename -- "$PUBLICATION_DIR")" in
     "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
     *) exit 1 ;;
   esac
      test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
      test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"

   printf '%s\n' "PUBLICATION_DIR=$PUBLICATION_DIR" "EXPECTED_PR_TITLE=$EXPECTED_PR_TITLE"
   ```
   - 파일 쓰기 도구만 `$PUBLICATION_DIR/title`에 `EXPECTED_PR_TITLE` 한 줄과 끝 newline을, `$PUBLICATION_DIR/body`에 완성 PR 본문을 쓴다. 두 파일은 directory 안에만 두며 `/tmp` 고정 이름, persistent manifest, `--body-file` handoff를 사용하지 않는다.
   - PR 본문에는 target issue를 닫는 독립된 정확한 한 줄 `Closes #${ISSUE_NUMBER}`를 포함한다. 이후 fence가 title, body, 소유자, mode, hard-link count, UTF-8, NUL, CR, hash를 다시 검증하므로 다른 제목 또는 본문은 승인 tuple에 도달하지 못한다.
6. publication input과 원격 상태를 분류해 두 번째 approval tuple을 출력하고 즉시 중단한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   validate_sha256() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 64; }
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_utf8() { iconv -f UTF-8 -t UTF-8 "$1" >/dev/null; }
   validate_artifact_binding() {
     ARTIFACT_PATH="$1"
     EXPECTED_BLOB_OID="$2"
     test -f "$ARTIFACT_PATH"
     test ! -L "$ARTIFACT_PATH"
     test "$(stat -f '%l' "$ARTIFACT_PATH")" = "1"
     test "$(stat -f '%Lp' "$ARTIFACT_PATH")" = "644"
     STAGE_RECORD="$(git ls-files -s -- "$ARTIFACT_PATH")"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $2}')" = "$EXPECTED_BLOB_OID"
     test "$(git ls-tree "$EXPECTED_FINAL_COMMIT_OID" -- "$ARTIFACT_PATH" | awk '{print $1 " " $3}')" = "100644 $EXPECTED_BLOB_OID"
     test "$(git hash-object -- "$ARTIFACT_PATH")" = "$EXPECTED_BLOB_OID"
   }
   validate_canonical_origin() {
     GH_HOST=github.com gh auth status --hostname github.com >/dev/null
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .id)" = "1256824919"
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .full_name)" = "jinzer0/GPUWatch"
     validate_origin_url_list() {
       ORIGIN_URL_LIST="$1"
       test -n "$ORIGIN_URL_LIST"
       SEEN_ORIGIN_URLS=""
       while IFS= read -r ORIGIN_URL; do
         case "$ORIGIN_URL" in
           git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
           *) exit 1 ;;
         esac
         case "$SEEN_ORIGIN_URLS" in *$'\n'"$ORIGIN_URL"$'\n'*) exit 1 ;; esac
         SEEN_ORIGIN_URLS="${SEEN_ORIGIN_URLS}"$'\n'"${ORIGIN_URL}"$'\n'
       done <<< "$ORIGIN_URL_LIST"
     }
     FETCH_ORIGIN_URLS_RAW="$({ if git remote get-url --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     FETCH_ORIGIN_URLS_RAW="${FETCH_ORIGIN_URLS_RAW%?}"
     case "$FETCH_ORIGIN_URLS_RAW" in *$'\n') FETCH_ORIGIN_URLS="${FETCH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     PUSH_ORIGIN_URLS_RAW="$({ if git remote get-url --push --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     PUSH_ORIGIN_URLS_RAW="${PUSH_ORIGIN_URLS_RAW%?}"
     case "$PUSH_ORIGIN_URLS_RAW" in *$'\n') PUSH_ORIGIN_URLS="${PUSH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     validate_origin_url_list "$FETCH_ORIGIN_URLS"
     validate_origin_url_list "$PUSH_ORIGIN_URLS"
   }
   validate_publication_dir() {
     test -n "${PUBLICATION_DIR:-}"
     TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
     test -d "$PUBLICATION_DIR"
     test ! -L "$PUBLICATION_DIR"
     PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
     test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
     case "$(basename -- "$PUBLICATION_DIR")" in
       "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
       *) exit 1 ;;
     esac
      test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
      test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
   }
   read_publication_inputs() {
     TITLE_FILE="$PUBLICATION_DIR/title"
     BODY_FILE="$PUBLICATION_DIR/body"
     for INPUT_FILE in "$TITLE_FILE" "$BODY_FILE"; do
       test -f "$INPUT_FILE"
       test ! -L "$INPUT_FILE"
       test "$(stat -f '%Su' "$INPUT_FILE")" = "$(id -un)"
       test "$(stat -f '%l' "$INPUT_FILE")" = "1"
       case "$(stat -f '%Lp' "$INPUT_FILE")" in 600|400) ;; *) exit 1 ;; esac
     done

     IFS= read -r PR_TITLE < "$TITLE_FILE"
     printf '%s\n' "$PR_TITLE" | cmp -s - "$TITLE_FILE"
     test -n "$PR_TITLE"
     validate_utf8 "$TITLE_FILE"
     TITLE_HEX="$(printf '%s' "$PR_TITLE" | od -An -tx1 -v)"
     TITLE_OCTETS="$(printf '%s\n' "$TITLE_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9a-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$TITLE_OCTETS"; then
       exit 1
     else
       TITLE_SCAN_STATUS=$?
       test "$TITLE_SCAN_STATUS" -eq 1
     fi

     BODY_BYTES="$(wc -c < "$BODY_FILE" | tr -d '[:space:]')"
     case "$BODY_BYTES" in ""|*[!0-9]*) exit 1 ;; esac
     test "$BODY_BYTES" -gt 0
     test "$BODY_BYTES" -le 65536
     validate_utf8 "$BODY_FILE"
     BODY_HEX="$(od -An -tx1 -v "$BODY_FILE")"
     BODY_OCTETS="$(printf '%s\n' "$BODY_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9b-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$BODY_OCTETS"; then
       exit 1
     else
       BODY_SCAN_STATUS=$?
       test "$BODY_SCAN_STATUS" -eq 1
     fi
     PR_BODY="$(cat "$BODY_FILE"; CAT_STATUS=$?; printf '\001'; exit "$CAT_STATUS")"
     PR_BODY="${PR_BODY%?}"
     test "$(printf '%s\n' "$PR_BODY" | grep -Ec "^Closes[[:space:]]+#${ISSUE_NUMBER}[[:space:]]*$")" = "1"
     EXPECTED_TITLE_BASE64="$(printf '%s' "$PR_TITLE" | base64 | tr -d '\n')"
     EXPECTED_BODY_BASE64="$(printf '%s' "$PR_BODY" | base64 | tr -d '\n')"
   }
   read_validated_issue_title() {
     ISSUE_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/issues/$ISSUE_NUMBER" --jq '[.number, .state, ((.pull_request != null) | tostring), (.title | @base64)] | @tsv')"
     case "$ISSUE_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r RETURNED_ISSUE_NUMBER ISSUE_STATE IS_PULL_REQUEST ISSUE_TITLE_BASE64 ISSUE_EXTRA <<< "$ISSUE_RECORD"
     test -z "${ISSUE_EXTRA:-}"
     test "$RETURNED_ISSUE_NUMBER" = "$ISSUE_NUMBER"
     test "$ISSUE_STATE" = "open"
     test "$IS_PULL_REQUEST" = "false"
     ISSUE_TITLE_HEX="$(printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | od -An -tx1 -v)"
     ISSUE_TITLE_OCTETS="$(printf '%s\n' "$ISSUE_TITLE_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9a-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$ISSUE_TITLE_OCTETS"; then
       exit 1
     else
       ISSUE_TITLE_SCAN_STATUS=$?
       test "$ISSUE_TITLE_SCAN_STATUS" -eq 1
     fi
     printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | iconv -f UTF-8 -t UTF-8 >/dev/null
     ISSUE_TITLE_WITH_SENTINEL="$({ if printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D; then ISSUE_TITLE_DECODE_STATUS=0; else ISSUE_TITLE_DECODE_STATUS=$?; fi; printf '\001'; exit "$ISSUE_TITLE_DECODE_STATUS"; })"
     ISSUE_TITLE="${ISSUE_TITLE_WITH_SENTINEL%?}"
     test -n "$ISSUE_TITLE"
   }
   read_devel_ref() {
     DEVEL_LINE="$(git ls-remote --heads origin refs/heads/devel)"
     case "$DEVEL_LINE" in ""|*$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r DEVEL_OID DEVEL_REF DEVEL_EXTRA <<< "$DEVEL_LINE"
     test -z "${DEVEL_EXTRA:-}"
     test "$DEVEL_REF" = "refs/heads/devel"
     validate_oid "$DEVEL_OID"
     test "$DEVEL_OID" = "$EXPECTED_DEVEL_OID"
     git fetch --no-tags origin +refs/heads/devel:refs/remotes/origin/devel
     test "$(git rev-parse --verify refs/remotes/origin/devel^{commit})" = "$EXPECTED_DEVEL_OID"
   }
   read_publish_ref() {
     PUBLISH_LINE="$(git ls-remote --heads origin "refs/heads/$PUBLISH_BRANCH")"
     case "$PUBLISH_LINE" in
       "") REMOTE_PUBLISH_OID="" ;;
       *$'\n'*) exit 1 ;;
       *)
         IFS="$(printf '\t')" read -r REMOTE_PUBLISH_OID REMOTE_PUBLISH_REF REMOTE_PUBLISH_EXTRA <<< "$PUBLISH_LINE"
         test -z "${REMOTE_PUBLISH_EXTRA:-}"
         test "$REMOTE_PUBLISH_REF" = "refs/heads/$PUBLISH_BRANCH"
         validate_oid "$REMOTE_PUBLISH_OID"
         ;;
     esac
   }
   list_matching_pr() {
      MATCHING_PR_NUMBERS="$(GH_HOST=github.com gh api --hostname github.com --method GET --paginate --slurp "repos/jinzer0/GPUWatch/pulls?state=all&head=jinzer0%3A${PUBLISH_BRANCH}&per_page=100" --jq '.[][] | .number')"
     case "$MATCHING_PR_NUMBERS" in
       "") PUBLICATION_PR_NUMBER="none" ;;
       *$'\n'*) exit 1 ;;
       *)
         case "$MATCHING_PR_NUMBERS" in *[!0-9]*) exit 1 ;; esac
         PUBLICATION_PR_NUMBER="$MATCHING_PR_NUMBERS"
         ;;
     esac
   }
   verify_open_pr_exact() {
     EXPECTED_PR_NUMBER="$1"
     EXPECTED_PR_DRAFT="$2"
     EXPECTED_PR_NODE_ID="${3:-}"
     PR_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/pulls/$EXPECTED_PR_NUMBER" --jq '[.number, .node_id, .state, (.draft | tostring), .base.ref, .base.sha, .base.repo.full_name, (.base.repo.id | tostring), .head.ref, .head.sha, .head.repo.full_name, (.head.repo.id | tostring), (.title | @base64), ((.body // "") | @base64)] | @tsv')"
     case "$PR_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r REST_PR_NUMBER REST_PR_NODE_ID REST_PR_STATE REST_PR_DRAFT REST_BASE_REF REST_BASE_SHA REST_BASE_REPO REST_BASE_REPO_ID REST_HEAD_REF REST_HEAD_SHA REST_HEAD_REPO REST_HEAD_REPO_ID REST_TITLE_BASE64 REST_BODY_BASE64 REST_PR_EXTRA <<< "$PR_RECORD"
     test -z "${REST_PR_EXTRA:-}"
     test "$REST_PR_NUMBER" = "$EXPECTED_PR_NUMBER"
     case "$REST_PR_NODE_ID" in ""|*[!A-Za-z0-9_=-]*) exit 1 ;; esac
     test "$REST_PR_STATE" = "open"
     case "$EXPECTED_PR_DRAFT" in any) case "$REST_PR_DRAFT" in true|false) ;; *) exit 1 ;; esac ;; *) test "$REST_PR_DRAFT" = "$EXPECTED_PR_DRAFT" ;; esac
     if test -n "$EXPECTED_PR_NODE_ID"; then test "$REST_PR_NODE_ID" = "$EXPECTED_PR_NODE_ID"; fi
     test "$REST_BASE_REF" = "devel"
     test "$REST_BASE_SHA" = "$EXPECTED_DEVEL_OID"
     test "$REST_BASE_REPO" = "jinzer0/GPUWatch"
     test "$REST_BASE_REPO_ID" = "1256824919"
     test "$REST_HEAD_REF" = "$PUBLISH_BRANCH"
     test "$REST_HEAD_SHA" = "$EXPECTED_FINAL_COMMIT_OID"
     test "$REST_HEAD_REPO" = "jinzer0/GPUWatch"
     test "$REST_HEAD_REPO_ID" = "1256824919"
     test "$REST_TITLE_BASE64" = "$EXPECTED_TITLE_BASE64"
     test "$REST_BODY_BASE64" = "$EXPECTED_BODY_BASE64"
     VERIFIED_PR_NODE_ID="$REST_PR_NODE_ID"
     VERIFIED_PR_DRAFT="$REST_PR_DRAFT"
   }
   classify_publication() {
     read_devel_ref
     read_publish_ref
     list_matching_pr
     if test -z "$REMOTE_PUBLISH_OID"; then
       test "$PUBLICATION_PR_NUMBER" = "none"
       PUBLICATION_STATE="branch-absent-pr-absent"
     elif test "$REMOTE_PUBLISH_OID" = "$EXPECTED_FINAL_COMMIT_OID"; then
       if test "$PUBLICATION_PR_NUMBER" = "none"; then
         PUBLICATION_STATE="branch-exact-pr-absent"
         PUBLICATION_PR_NODE_ID="none"
       else
         verify_open_pr_exact "$PUBLICATION_PR_NUMBER" any
         PUBLICATION_PR_NODE_ID="$VERIFIED_PR_NODE_ID"
         case "$VERIFIED_PR_DRAFT" in
           true) PUBLICATION_STATE="branch-exact-pr-draft" ;;
           false) PUBLICATION_STATE="branch-exact-pr-ready" ;;
         esac
       fi
     else
       exit 1
     fi
     if test "$PUBLICATION_PR_NUMBER" = "none"; then PUBLICATION_PR_NODE_ID="none"; fi
   }

   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_IMPL_PLAN_COMMIT:-}"
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   test -n "${ACCEPTANCE_EVIDENCE:-}"
   test "${APPROVED_FINAL_REPORT_ACTION:-}" = "approve-final-report-and-evidence"
   test "${APPROVED_FINAL_REPORT_ISSUE_NUMBER:-}" = "$ISSUE_NUMBER"
   test "${APPROVED_FINAL_REPORT_PLAN_OID:-}" = "$APPROVED_IMPL_PLAN_COMMIT"
   validate_oid "${APPROVED_FINAL_REPORT_FINAL_COMMIT_OID:-}"
   validate_oid "${APPROVED_FINAL_REPORT_REPORT_BLOB_OID:-}"
   validate_oid "${APPROVED_FINAL_REPORT_ORDERS_BLOB_OID:-}"
   validate_sha256 "${APPROVED_FINAL_REPORT_ACCEPTANCE_EVIDENCE_SHA256:-}"
   test "$(sha256_text "$ACCEPTANCE_EVIDENCE")" = "$APPROVED_FINAL_REPORT_ACCEPTANCE_EVIDENCE_SHA256"

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   test "${APPROVED_FINAL_REPORT_REPORT_PATH:-}" = "$FINAL_REPORT"
   test "${APPROVED_FINAL_REPORT_ORDERS_PATH:-}" = "$ORDER_FILE"
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   EXPECTED_FINAL_COMMIT_OID="$(git rev-parse --verify HEAD^{commit})"
   validate_oid "$EXPECTED_FINAL_COMMIT_OID"
   test "$EXPECTED_FINAL_COMMIT_OID" = "$APPROVED_FINAL_REPORT_FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$EXPECTED_FINAL_COMMIT_OID"
   test -z "$(git status --porcelain)"
   EXPECTED_COMMIT_PATHS="$(printf '%s\n%s' "$ORDER_FILE" "$FINAL_REPORT")"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$EXPECTED_FINAL_COMMIT_OID")" = "$EXPECTED_COMMIT_PATHS"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$EXPECTED_FINAL_COMMIT_OID:$IMPL_PLAN")"
   test "$(git rev-parse "$EXPECTED_FINAL_COMMIT_OID:$FINAL_REPORT")" = "$APPROVED_FINAL_REPORT_REPORT_BLOB_OID"
   test "$(git rev-parse "$EXPECTED_FINAL_COMMIT_OID:$ORDER_FILE")" = "$APPROVED_FINAL_REPORT_ORDERS_BLOB_OID"
   validate_artifact_binding "$FINAL_REPORT" "$APPROVED_FINAL_REPORT_REPORT_BLOB_OID"
   validate_artifact_binding "$ORDER_FILE" "$APPROVED_FINAL_REPORT_ORDERS_BLOB_OID"

   validate_publication_dir
   read_publication_inputs

   validate_canonical_origin
   read_validated_issue_title
   EXPECTED_PR_TITLE="Task #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
   test "$PR_TITLE" = "$EXPECTED_PR_TITLE"
   TITLE_SHA256="$(sha256_text "$PR_TITLE")"
   BODY_SHA256="$(sha256_text "$PR_BODY")"
   PUBLISH_BRANCH="publish/task${ISSUE_NUMBER}"
   EXPECTED_DEVEL_OID="$(git ls-remote --heads origin refs/heads/devel | cut -f1)"
   validate_oid "$EXPECTED_DEVEL_OID"
   classify_publication

   printf '%s\n' \
     "action=push-exact-oid-and-create-or-resume-open-pr" \
     "host=github.com" \
     "repository=jinzer0/GPUWatch" \
     "repository_id=1256824919" \
     "issue_number=$ISSUE_NUMBER" \
     "approved_plan_oid=$APPROVED_IMPL_PLAN_COMMIT" \
     "final_commit_oid=$EXPECTED_FINAL_COMMIT_OID" \
     "final_report_path=$FINAL_REPORT" \
     "final_report_blob_oid=$APPROVED_FINAL_REPORT_REPORT_BLOB_OID" \
     "orders_path=$ORDER_FILE" \
     "orders_blob_oid=$APPROVED_FINAL_REPORT_ORDERS_BLOB_OID" \
     "acceptance_evidence_sha256=$APPROVED_FINAL_REPORT_ACCEPTANCE_EVIDENCE_SHA256" \
     "devel_oid=$EXPECTED_DEVEL_OID" \
     "publish_branch=$PUBLISH_BRANCH" \
     "base=devel" \
     "title_sha256=$TITLE_SHA256" \
     "body_sha256=$BODY_SHA256" \
      "publication_state=$PUBLICATION_STATE" \
     "publication_pr_number=$PUBLICATION_PR_NUMBER" \
     "publication_pr_node_id=$PUBLICATION_PR_NODE_ID"
   ```
   - 이 fence는 `branch-absent-pr-absent`, `branch-exact-pr-absent`, `branch-exact-pr-draft`, `branch-exact-pr-ready`만 수용한다. 모든 state의 matching PR을 조회하므로 닫힌 PR, 둘 이상의 matching PR, branch 없이 PR이 있는 경우, base/head/repository/title/body/draft가 다른 PR은 모두 실패한다.
   - 여기서 즉시 중단한다. 작업지시자는 같은 스레드에서 위의 모든 tuple 값과 `action=push-exact-oid-and-create-or-resume-open-pr`를 정확히 명시해 승인해야 한다.
7. 두 번째 승인을 정확히 재검증하고, 승인된 exact 상태에서만 draft 생성과 ready 전환을 한 번에 수행한다.
   - 승인 응답의 `APPROVED_ACTION`, `APPROVED_HOST`, `APPROVED_REPOSITORY`, `APPROVED_REPOSITORY_ID`, `APPROVED_ISSUE_NUMBER`, `APPROVED_PLAN_OID`, `APPROVED_FINAL_COMMIT_OID`, `APPROVED_FINAL_REPORT_PATH`, `APPROVED_FINAL_REPORT_BLOB_OID`, `APPROVED_ORDERS_PATH`, `APPROVED_ORDERS_BLOB_OID`, `APPROVED_ACCEPTANCE_EVIDENCE_SHA256`, `APPROVED_DEVEL_OID`, `APPROVED_PUBLISH_BRANCH`, `APPROVED_BASE`, `APPROVED_TITLE_SHA256`, `APPROVED_BODY_SHA256`, `APPROVED_PUBLICATION_STATE`, `APPROVED_PUBLICATION_PR_NUMBER`, `APPROVED_PUBLICATION_PR_NODE_ID`를 그대로 설정한다. 이어 ambient `ISSUE_NUMBER`, `APPROVED_IMPL_PLAN_COMMIT`, `IMPL_PLAN`, `ORDER_FILE`, `ACCEPTANCE_EVIDENCE`, `PUBLICATION_DIR`도 설정하고 한 번에 실행한다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL

   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   validate_sha256() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 64; }
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_canonical_origin() {
     GH_HOST=github.com gh auth status --hostname github.com >/dev/null
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .id)" = "1256824919"
     test "$(GH_HOST=github.com gh api --hostname github.com --method GET repos/jinzer0/GPUWatch --jq .full_name)" = "jinzer0/GPUWatch"
     validate_origin_url_list() {
       ORIGIN_URL_LIST="$1"
       test -n "$ORIGIN_URL_LIST"
       SEEN_ORIGIN_URLS=""
       while IFS= read -r ORIGIN_URL; do
         case "$ORIGIN_URL" in
           git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
           *) exit 1 ;;
         esac
         case "$SEEN_ORIGIN_URLS" in *$'\n'"$ORIGIN_URL"$'\n'*) exit 1 ;; esac
         SEEN_ORIGIN_URLS="${SEEN_ORIGIN_URLS}"$'\n'"${ORIGIN_URL}"$'\n'
       done <<< "$ORIGIN_URL_LIST"
     }
     FETCH_ORIGIN_URLS_RAW="$({ if git remote get-url --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     FETCH_ORIGIN_URLS_RAW="${FETCH_ORIGIN_URLS_RAW%?}"
     case "$FETCH_ORIGIN_URLS_RAW" in *$'\n') FETCH_ORIGIN_URLS="${FETCH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     PUSH_ORIGIN_URLS_RAW="$({ if git remote get-url --push --all origin; then ORIGIN_URL_STATUS=0; else ORIGIN_URL_STATUS=$?; fi; printf '\001'; exit "$ORIGIN_URL_STATUS"; })"
     PUSH_ORIGIN_URLS_RAW="${PUSH_ORIGIN_URLS_RAW%?}"
     case "$PUSH_ORIGIN_URLS_RAW" in *$'\n') PUSH_ORIGIN_URLS="${PUSH_ORIGIN_URLS_RAW%$'\n'}" ;; *) exit 1 ;; esac
     validate_origin_url_list "$FETCH_ORIGIN_URLS"
     validate_origin_url_list "$PUSH_ORIGIN_URLS"
   }
   validate_publication_dir() {
     test -n "${PUBLICATION_DIR:-}"
     TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
     test -d "$PUBLICATION_DIR"
     test ! -L "$PUBLICATION_DIR"
     PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
     test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
     case "$(basename -- "$PUBLICATION_DIR")" in
       "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
       *) exit 1 ;;
     esac
     test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
     test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
   }
   read_validated_issue_title() {
     ISSUE_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/issues/$ISSUE_NUMBER" --jq '[.number, .state, ((.pull_request != null) | tostring), (.title | @base64)] | @tsv')"
     case "$ISSUE_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r RETURNED_ISSUE_NUMBER ISSUE_STATE IS_PULL_REQUEST ISSUE_TITLE_BASE64 ISSUE_EXTRA <<< "$ISSUE_RECORD"
     test -z "${ISSUE_EXTRA:-}"
     test "$RETURNED_ISSUE_NUMBER" = "$ISSUE_NUMBER"
     test "$ISSUE_STATE" = "open"
     test "$IS_PULL_REQUEST" = "false"
     ISSUE_TITLE_HEX="$(printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | od -An -tx1 -v)"
     ISSUE_TITLE_OCTETS="$(printf '%s\n' "$ISSUE_TITLE_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9a-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$ISSUE_TITLE_OCTETS"; then
       exit 1
     else
       ISSUE_TITLE_SCAN_STATUS=$?
       test "$ISSUE_TITLE_SCAN_STATUS" -eq 1
     fi
     printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D | iconv -f UTF-8 -t UTF-8 >/dev/null
     ISSUE_TITLE_WITH_SENTINEL="$({ if printf '%s' "$ISSUE_TITLE_BASE64" | base64 -D; then ISSUE_TITLE_DECODE_STATUS=0; else ISSUE_TITLE_DECODE_STATUS=$?; fi; printf '\001'; exit "$ISSUE_TITLE_DECODE_STATUS"; })"
     ISSUE_TITLE="${ISSUE_TITLE_WITH_SENTINEL%?}"
     test -n "$ISSUE_TITLE"
   }
   read_devel_ref() {
     DEVEL_LINE="$(git ls-remote --heads origin refs/heads/devel)"
     case "$DEVEL_LINE" in ""|*$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r DEVEL_OID DEVEL_REF DEVEL_EXTRA <<< "$DEVEL_LINE"
     test -z "${DEVEL_EXTRA:-}"
     test "$DEVEL_REF" = "refs/heads/devel"
     validate_oid "$DEVEL_OID"
     test "$DEVEL_OID" = "$APPROVED_DEVEL_OID"
     git fetch --no-tags origin +refs/heads/devel:refs/remotes/origin/devel
     test "$(git rev-parse --verify refs/remotes/origin/devel^{commit})" = "$APPROVED_DEVEL_OID"
   }
   validate_utf8() { iconv -f UTF-8 -t UTF-8 "$1" >/dev/null; }
   validate_artifact_binding() {
     ARTIFACT_PATH="$1"
     EXPECTED_BLOB_OID="$2"
     test -f "$ARTIFACT_PATH"
     test ! -L "$ARTIFACT_PATH"
     test "$(stat -f '%l' "$ARTIFACT_PATH")" = "1"
     test "$(stat -f '%Lp' "$ARTIFACT_PATH")" = "644"
     STAGE_RECORD="$(git ls-files -s -- "$ARTIFACT_PATH")"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $1 " " $3}')" = "100644 0"
     test "$(printf '%s\n' "$STAGE_RECORD" | awk '{print $2}')" = "$EXPECTED_BLOB_OID"
     test "$(git ls-tree "$APPROVED_FINAL_COMMIT_OID" -- "$ARTIFACT_PATH" | awk '{print $1 " " $3}')" = "100644 $EXPECTED_BLOB_OID"
     test "$(git hash-object -- "$ARTIFACT_PATH")" = "$EXPECTED_BLOB_OID"
   }
   read_publication_inputs() {
     TITLE_FILE="$PUBLICATION_DIR/title"
     BODY_FILE="$PUBLICATION_DIR/body"
     for INPUT_FILE in "$TITLE_FILE" "$BODY_FILE"; do
       test -f "$INPUT_FILE"
       test ! -L "$INPUT_FILE"
       test "$(stat -f '%Su' "$INPUT_FILE")" = "$(id -un)"
       test "$(stat -f '%l' "$INPUT_FILE")" = "1"
       case "$(stat -f '%Lp' "$INPUT_FILE")" in 600|400) ;; *) exit 1 ;; esac
     done

     IFS= read -r PR_TITLE < "$TITLE_FILE"
     printf '%s\n' "$PR_TITLE" | cmp -s - "$TITLE_FILE"
     test -n "$PR_TITLE"
     validate_utf8 "$TITLE_FILE"
     TITLE_HEX="$(printf '%s' "$PR_TITLE" | od -An -tx1 -v)"
     TITLE_OCTETS="$(printf '%s\n' "$TITLE_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9a-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$TITLE_OCTETS"; then
       exit 1
     else
       TITLE_SCAN_STATUS=$?
       test "$TITLE_SCAN_STATUS" -eq 1
     fi

     BODY_BYTES="$(wc -c < "$BODY_FILE" | tr -d '[:space:]')"
     case "$BODY_BYTES" in ""|*[!0-9]*) exit 1 ;; esac
     test "$BODY_BYTES" -gt 0
     test "$BODY_BYTES" -le 65536
     validate_utf8 "$BODY_FILE"
     BODY_HEX="$(od -An -tx1 -v "$BODY_FILE")"
     BODY_OCTETS="$(printf '%s\n' "$BODY_HEX" | tr -s '[:space:]' ' ')"
     if grep -Eq '(^| )(0[0-9b-f]|1[0-9a-f]|7f)( |$)|(^| )c2 (8[0-9a-f]|9[0-9a-f])( |$)' <<< "$BODY_OCTETS"; then
       exit 1
     else
       BODY_SCAN_STATUS=$?
       test "$BODY_SCAN_STATUS" -eq 1
     fi
     PR_BODY="$(cat "$BODY_FILE"; CAT_STATUS=$?; printf '\001'; exit "$CAT_STATUS")"
     PR_BODY="${PR_BODY%?}"
     test "$(printf '%s\n' "$PR_BODY" | grep -Ec "^Closes[[:space:]]+#${ISSUE_NUMBER}[[:space:]]*$")" = "1"
     EXPECTED_TITLE_BASE64="$(printf '%s' "$PR_TITLE" | base64 | tr -d '\n')"
     EXPECTED_BODY_BASE64="$(printf '%s' "$PR_BODY" | base64 | tr -d '\n')"
   }
   read_publish_ref() {
     PUBLISH_LINE="$(git ls-remote --heads origin "refs/heads/$APPROVED_PUBLISH_BRANCH")"
     case "$PUBLISH_LINE" in
       "") REMOTE_PUBLISH_OID="" ;;
       *$'\n'*) exit 1 ;;
       *)
         IFS="$(printf '\t')" read -r REMOTE_PUBLISH_OID REMOTE_PUBLISH_REF REMOTE_PUBLISH_EXTRA <<< "$PUBLISH_LINE"
         test -z "${REMOTE_PUBLISH_EXTRA:-}"
         test "$REMOTE_PUBLISH_REF" = "refs/heads/$APPROVED_PUBLISH_BRANCH"
         validate_oid "$REMOTE_PUBLISH_OID"
         ;;
     esac
   }
   list_matching_pr() {
      MATCHING_PR_NUMBERS="$(GH_HOST=github.com gh api --hostname github.com --method GET --paginate --slurp "repos/jinzer0/GPUWatch/pulls?state=all&head=jinzer0%3A${APPROVED_PUBLISH_BRANCH}&per_page=100" --jq '.[][] | .number')"
     case "$MATCHING_PR_NUMBERS" in
       "") CURRENT_PR_NUMBER="none" ;;
       *$'\n'*) exit 1 ;;
       *)
         case "$MATCHING_PR_NUMBERS" in *[!0-9]*) exit 1 ;; esac
         CURRENT_PR_NUMBER="$MATCHING_PR_NUMBERS"
         ;;
     esac
   }
   verify_open_pr_exact() {
     EXPECTED_PR_NUMBER="$1"
     EXPECTED_PR_DRAFT="$2"
     EXPECTED_PR_NODE_ID="${3:-}"
     PR_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/pulls/$EXPECTED_PR_NUMBER" --jq '[.number, .node_id, .state, (.draft | tostring), .base.ref, .base.sha, .base.repo.full_name, (.base.repo.id | tostring), .head.ref, .head.sha, .head.repo.full_name, (.head.repo.id | tostring), (.title | @base64), ((.body // "") | @base64)] | @tsv')"
     case "$PR_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r REST_PR_NUMBER REST_PR_NODE_ID REST_PR_STATE REST_PR_DRAFT REST_BASE_REF REST_BASE_SHA REST_BASE_REPO REST_BASE_REPO_ID REST_HEAD_REF REST_HEAD_SHA REST_HEAD_REPO REST_HEAD_REPO_ID REST_TITLE_BASE64 REST_BODY_BASE64 REST_PR_EXTRA <<< "$PR_RECORD"
     test -z "${REST_PR_EXTRA:-}"
     test "$REST_PR_NUMBER" = "$EXPECTED_PR_NUMBER"
     case "$REST_PR_NODE_ID" in ""|*[!A-Za-z0-9_=-]*) exit 1 ;; esac
     test "$REST_PR_STATE" = "open"
     test "$REST_PR_DRAFT" = "$EXPECTED_PR_DRAFT"
     if test -n "$EXPECTED_PR_NODE_ID"; then test "$REST_PR_NODE_ID" = "$EXPECTED_PR_NODE_ID"; fi
     test "$REST_BASE_REF" = "devel"
     test "$REST_BASE_SHA" = "$APPROVED_DEVEL_OID"
     test "$REST_BASE_REPO" = "jinzer0/GPUWatch"
     test "$REST_BASE_REPO_ID" = "1256824919"
     test "$REST_HEAD_REF" = "$APPROVED_PUBLISH_BRANCH"
     test "$REST_HEAD_SHA" = "$APPROVED_FINAL_COMMIT_OID"
     test "$REST_HEAD_REPO" = "jinzer0/GPUWatch"
     test "$REST_HEAD_REPO_ID" = "1256824919"
     test "$REST_TITLE_BASE64" = "$EXPECTED_TITLE_BASE64"
     test "$REST_BODY_BASE64" = "$EXPECTED_BODY_BASE64"
     VERIFIED_PR_NODE_ID="$REST_PR_NODE_ID"
   }
   classify_publication() {
     read_devel_ref
     read_publish_ref
     list_matching_pr
     if test -z "$REMOTE_PUBLISH_OID"; then
       test "$CURRENT_PR_NUMBER" = "none"
       CURRENT_PUBLICATION_STATE="branch-absent-pr-absent"
       CURRENT_PR_NODE_ID="none"
     elif test "$REMOTE_PUBLISH_OID" = "$APPROVED_FINAL_COMMIT_OID"; then
       if test "$CURRENT_PR_NUMBER" = "none"; then
         CURRENT_PUBLICATION_STATE="branch-exact-pr-absent"
         CURRENT_PR_NODE_ID="none"
       else
         PR_DRAFT_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method GET "repos/jinzer0/GPUWatch/pulls/$CURRENT_PR_NUMBER" --jq '[.draft, .node_id] | @tsv')"
         case "$PR_DRAFT_RECORD" in *$'\n'*) exit 1 ;; esac
         IFS="$(printf '\t')" read -r CURRENT_PR_DRAFT CURRENT_PR_NODE_ID CURRENT_PR_EXTRA <<< "$PR_DRAFT_RECORD"
         test -z "${CURRENT_PR_EXTRA:-}"
         case "$CURRENT_PR_DRAFT" in true|false) ;; *) exit 1 ;; esac
         verify_open_pr_exact "$CURRENT_PR_NUMBER" "$CURRENT_PR_DRAFT" "$CURRENT_PR_NODE_ID"
         case "$CURRENT_PR_DRAFT" in
           true) CURRENT_PUBLICATION_STATE="branch-exact-pr-draft" ;;
           false) CURRENT_PUBLICATION_STATE="branch-exact-pr-ready" ;;
         esac
       fi
     else
       exit 1
     fi
   }
   require_initial_publication_state() {
     test "$CURRENT_PUBLICATION_STATE" = "$APPROVED_PUBLICATION_STATE" || require_replacement_publication_approval "publication state drifted"
     test "$CURRENT_PR_NUMBER" = "$APPROVED_PUBLICATION_PR_NUMBER" || require_replacement_publication_approval "publication PR number drifted"
     test "$CURRENT_PR_NODE_ID" = "$APPROVED_PUBLICATION_PR_NODE_ID" || require_replacement_publication_approval "publication PR node drifted"
   }
   require_pr_still_absent() {
     classify_publication
     test "$CURRENT_PUBLICATION_STATE" = "branch-exact-pr-absent" || require_replacement_publication_approval "a PR appeared before creation"
     test "$CURRENT_PR_NUMBER" = "none" || require_replacement_publication_approval "a PR appeared before creation"
   }
   verify_created_draft_pr() {
     verify_open_pr_exact "$CREATED_PR_NUMBER" true "$CREATED_PR_NODE_ID"
     list_matching_pr
     test "$CURRENT_PR_NUMBER" = "$CREATED_PR_NUMBER"
   }
   verify_closing_issue_evidence() {
     CLOSING_ISSUE_NUMBERS="$(GH_HOST=github.com gh api --hostname github.com graphql -F owner=jinzer0 -F name=GPUWatch -F number="$CURRENT_PR_NUMBER" -f query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } } } } }' --jq '.data.repository.pullRequest.closingIssuesReferences.nodes[] | select(.repository.nameWithOwner == "jinzer0/GPUWatch") | .number')" || exit 1
     test "$CLOSING_ISSUE_NUMBERS" = "$ISSUE_NUMBER"
   }
   cleanup_publication_input() {
     EXIT_STATUS=$?
     if test "${PUBLICATION_SUCCEEDED:-0}" = "1" || test "${PUBLICATION_BECAME_AMBIGUOUS:-0}" = "1"; then
       rm -rf -- "$PUBLICATION_DIR"
       test ! -e "$PUBLICATION_DIR"
     else
       printf '%s\n' "publication did not finish; retained $PUBLICATION_DIR for exact-state retry or explicit recovery cleanup" >&2
     fi
     trap - EXIT
     exit "$EXIT_STATUS"
   }
   on_signal() { trap - HUP INT TERM; exit 1; }
   require_replacement_publication_approval() {
     printf '%s\n' "fresh publication preparation and replacement publication approval required: $1" >&2
     PUBLICATION_BECAME_AMBIGUOUS=1
     exit 1
   }

   test "${APPROVED_ACTION:-}" = "push-exact-oid-and-create-or-resume-open-pr"
   test "${APPROVED_HOST:-}" = "github.com"
   test "${APPROVED_REPOSITORY:-}" = "jinzer0/GPUWatch"
   test "${APPROVED_REPOSITORY_ID:-}" = "1256824919"
   case "${APPROVED_ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_PLAN_OID:-}"
   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   validate_oid "${APPROVED_IMPL_PLAN_COMMIT:-}"
   test "$APPROVED_ISSUE_NUMBER" = "$ISSUE_NUMBER"
   test "$APPROVED_PLAN_OID" = "$APPROVED_IMPL_PLAN_COMMIT"
   ISSUE_NUMBER="$APPROVED_ISSUE_NUMBER"
   APPROVED_IMPL_PLAN_COMMIT="$APPROVED_PLAN_OID"
   validate_oid "${APPROVED_FINAL_COMMIT_OID:-}"
   validate_oid "${APPROVED_FINAL_REPORT_BLOB_OID:-}"
   validate_oid "${APPROVED_ORDERS_BLOB_OID:-}"
   validate_oid "${APPROVED_DEVEL_OID:-}"
   validate_sha256 "${APPROVED_ACCEPTANCE_EVIDENCE_SHA256:-}"
   validate_sha256 "${APPROVED_TITLE_SHA256:-}"
   validate_sha256 "${APPROVED_BODY_SHA256:-}"
   test -n "${IMPL_PLAN:-}"
   test -n "${ORDER_FILE:-}"
   test -n "${ACCEPTANCE_EVIDENCE:-}"
   test "${APPROVED_BASE:-}" = "devel"
   test "${APPROVED_PUBLISH_BRANCH:-}" = "publish/task${ISSUE_NUMBER}"
   case "${APPROVED_PUBLICATION_STATE:-}" in
     branch-absent-pr-absent|branch-exact-pr-absent)
       test "${APPROVED_PUBLICATION_PR_NUMBER:-}" = "none"
       test "${APPROVED_PUBLICATION_PR_NODE_ID:-}" = "none"
       ;;
     branch-exact-pr-draft|branch-exact-pr-ready)
       case "${APPROVED_PUBLICATION_PR_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
       case "${APPROVED_PUBLICATION_PR_NODE_ID:-}" in ""|*[!A-Za-z0-9_=-]*) exit 1 ;; esac
       ;;
     *) exit 1 ;;
   esac
   case "$ACCEPTANCE_EVIDENCE" in *$'\r'*) exit 1 ;; esac
   test "$(sha256_text "$ACCEPTANCE_EVIDENCE")" = "$APPROVED_ACCEPTANCE_EVIDENCE_SHA256"

   FINAL_REPORT="mydocs/report/${IMPL_PLAN#mydocs/plans/}"
   FINAL_REPORT="${FINAL_REPORT%_impl.md}_report.md"
   test "${APPROVED_FINAL_REPORT_PATH:-}" = "$FINAL_REPORT"
   test "${APPROVED_ORDERS_PATH:-}" = "$ORDER_FILE"
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   test "$(git rev-parse --verify HEAD^{commit})" = "$APPROVED_FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$APPROVED_FINAL_COMMIT_OID"
   test -z "$(git status --porcelain)"
   EXPECTED_COMMIT_PATHS="$(printf '%s\n%s' "$ORDER_FILE" "$FINAL_REPORT")"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_FINAL_COMMIT_OID")" = "$EXPECTED_COMMIT_PATHS"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$APPROVED_FINAL_COMMIT_OID:$IMPL_PLAN")"
   test "$(git rev-parse "$APPROVED_FINAL_COMMIT_OID:$FINAL_REPORT")" = "$APPROVED_FINAL_REPORT_BLOB_OID"
   test "$(git rev-parse "$APPROVED_FINAL_COMMIT_OID:$ORDER_FILE")" = "$APPROVED_ORDERS_BLOB_OID"
   validate_artifact_binding "$FINAL_REPORT" "$APPROVED_FINAL_REPORT_BLOB_OID"
   validate_artifact_binding "$ORDER_FILE" "$APPROVED_ORDERS_BLOB_OID"

   validate_publication_dir
   read_publication_inputs
   test "$(sha256_text "$PR_TITLE")" = "$APPROVED_TITLE_SHA256"
   test "$(sha256_text "$PR_BODY")" = "$APPROVED_BODY_SHA256"

   validate_canonical_origin
   read_validated_issue_title
   test "$PR_TITLE" = "Task #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

   PUBLICATION_SUCCEEDED=0
   PUBLICATION_BECAME_AMBIGUOUS=0
   trap cleanup_publication_input EXIT
   trap on_signal HUP INT TERM

   classify_publication
   require_initial_publication_state

   if test "$APPROVED_PUBLICATION_STATE" = "branch-absent-pr-absent"; then
     git push --porcelain --force-with-lease="refs/heads/$APPROVED_PUBLISH_BRANCH:" origin "$APPROVED_FINAL_COMMIT_OID:refs/heads/$APPROVED_PUBLISH_BRANCH"
     classify_publication
     test "$CURRENT_PUBLICATION_STATE" = "branch-exact-pr-absent" || require_replacement_publication_approval "publish ref result was not exact and PR-absent"
   fi

   if test "$APPROVED_PUBLICATION_STATE" = "branch-absent-pr-absent" || test "$APPROVED_PUBLICATION_STATE" = "branch-exact-pr-absent"; then
     require_pr_still_absent
     PUBLICATION_BECAME_AMBIGUOUS=1
     CREATE_RECORD="$(GH_HOST=github.com gh api --hostname github.com --method POST repos/jinzer0/GPUWatch/pulls -f "title=$PR_TITLE" -f "head=$APPROVED_PUBLISH_BRANCH" -f "base=devel" -f "body=$PR_BODY" -F draft=true --jq '[.number, .node_id] | @tsv')"
     case "$CREATE_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r CREATED_PR_NUMBER CREATED_PR_NODE_ID CREATE_EXTRA <<< "$CREATE_RECORD"
     test -z "${CREATE_EXTRA:-}"
     case "$CREATED_PR_NUMBER" in ""|*[!0-9]*) exit 1 ;; esac
     case "$CREATED_PR_NODE_ID" in ""|*[!A-Za-z0-9_=-]*) exit 1 ;; esac
     verify_created_draft_pr
   elif test "$APPROVED_PUBLICATION_STATE" = "branch-exact-pr-draft"; then
     CREATED_PR_NUMBER="$APPROVED_PUBLICATION_PR_NUMBER"
     CREATED_PR_NODE_ID="$APPROVED_PUBLICATION_PR_NODE_ID"
     verify_created_draft_pr
   else
     test "$APPROVED_PUBLICATION_STATE" = "branch-exact-pr-ready"
   fi

   if test "$APPROVED_PUBLICATION_STATE" != "branch-exact-pr-ready"; then
     PUBLICATION_BECAME_AMBIGUOUS=1
     READY_RECORD="$(GH_HOST=github.com gh api --hostname github.com graphql -F pullRequestId="$CREATED_PR_NODE_ID" -f query='mutation($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { number id isDraft } } }' --jq '[.data.markPullRequestReadyForReview.pullRequest.number, .data.markPullRequestReadyForReview.pullRequest.id, .data.markPullRequestReadyForReview.pullRequest.isDraft] | @tsv')"
     case "$READY_RECORD" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r READY_PR_NUMBER READY_PR_NODE_ID READY_PR_DRAFT READY_EXTRA <<< "$READY_RECORD"
     test -z "${READY_EXTRA:-}"
     test "$READY_PR_NUMBER" = "$CREATED_PR_NUMBER"
     test "$READY_PR_NODE_ID" = "$CREATED_PR_NODE_ID"
     test "$READY_PR_DRAFT" = "false"
     CURRENT_PR_NUMBER="$CREATED_PR_NUMBER"
     CURRENT_PR_NODE_ID="$CREATED_PR_NODE_ID"
   fi

   verify_open_pr_exact "$CURRENT_PR_NUMBER" false "$CURRENT_PR_NODE_ID"
   list_matching_pr
   test "$CURRENT_PR_NUMBER" != "none"
   verify_open_pr_exact "$CURRENT_PR_NUMBER" false "$CURRENT_PR_NODE_ID"
   verify_closing_issue_evidence

   PUBLICATION_SUCCEEDED=1
   printf '%s\n' \
     "pr_number=$CURRENT_PR_NUMBER" \
     "pr_node_id=$CURRENT_PR_NODE_ID" \
     "pr_url=https://github.com/jinzer0/GPUWatch/pull/$CURRENT_PR_NUMBER" \
     "closing_issue_number=$ISSUE_NUMBER"
   ```
   - ref가 없을 때만 absent-ref lease로 approved final OID를 게시한다. 기존 ref는 overwrite하지 않으며, 승인 state와 실행 시작 state가 exact하게 같아야 한다.
   - no-PR 승인은 생성 직전에도 all-state 조회 결과가 `none`이어야 한다. own POST는 draft PR을 만들고 반환한 number/node ID를 같은 shell에서 결박한다. 그 exact draft를 REST GET으로 검증한 뒤에만 같은 node를 ready로 전환하고 exact non-draft REST GET과 closing linkage를 검증한다.
   - `branch-exact-pr-ready` 승인은 remote mutation 없는 verification-only 경로이다. absent 승인은 실행 전에 나타난 PR을 adopt하지 않으며, duplicate/closed/mismatched PR은 모두 새 preparation과 replacement publication 승인을 요구한다.
   - create 또는 ready mutation을 시작한 뒤 실패, signal, 잘못된 응답, 잘못된 GET, state drift가 발생하면 결과가 ambiguous하므로 private input을 폐기하고 fresh preparation과 replacement publication 승인을 요구한다. persistent manifest나 이전 승인으로 fuzzy adoption하지 않는다.
8. publication input을 폐기하거나 재승인 전에 안전하게 정리해야 할 때만 다음 recovery cleanup을 실행한다.
   ```bash
   set -euo pipefail

   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   test -n "${PUBLICATION_DIR:-}"
   TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
   test -d "$PUBLICATION_DIR"
   test ! -L "$PUBLICATION_DIR"
   PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
   test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
   case "$(basename -- "$PUBLICATION_DIR")" in
     "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
     *) exit 1 ;;
   esac
   test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
   test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
   rm -rf -- "$PUBLICATION_DIR"
   test ! -e "$PUBLICATION_DIR"
   ```
9. 작업지시자에게 검증된 PR 번호와 URL을 전달하고, 리뷰 및 merge 승인을 요청한다.

## PR 본문 규칙

- title은 canonical target issue REST 응답에서 검증한 정확한 `Task #N: <issue title>` 한 줄이다. 다른 title, 사용자 입력 title, 줄바꿈 title은 허용하지 않는다.
- `.github/pull_request_template.md`를 출발점으로 사용하고 최대 4개 요약 bullet, Stage별 한 줄 요약, 검증 결과, 남은 위험을 포함한다.
- target issue를 닫는 `Closes #N` 독립 줄을 반드시 포함한다.
- Stage 제목은 단계 보고서 URL로, 짧은 commit SHA는 commit URL로 링크한다.
- 작업 문서는 final commit OID 기준 `https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/...` URL을 `[파일명](URL)` 형식으로 쓴다.
- 상대 링크, `blob/publish/task{N}/...`, raw URL은 사용하지 않는다.
- 검증은 `자동 검증`, `수동/시나리오 검증`, `CI/원격 검증`, `검증 한계`로 기록한다. 실행하지 않은 검증은 표가 아니라 한계 또는 위험에 사유를 적는다.
- title/body hash는 approval tuple에만 두고 PR body 자체 hash나 publication 뒤 closing linkage 결과는 본문에 기록하지 않는다.

## 검증

- 승인 구현 계획서 OID의 plan blob이 HEAD, index, working tree와 일치한 뒤 수용 기준을 실제 실행하고, acceptance evidence SHA-256을 첫 승인에 결박함
- final report/orders commit 전 staged/untracked 변경을 거부하고, hook 전후 repository-wide index와 final commit 경로가 정확히 report/orders 두 파일임을 검증함
- 첫 승인 tuple이 issue, plan OID, final commit OID, report/orders paths와 blob OIDs, acceptance evidence SHA-256을 정확히 결박하고 publication input 생성 전에 멈춤
- 두 번째 승인 tuple이 canonical repository identity, approved issue/plan scalar, exact devel/final OIDs, first-approval artifacts, private title/body hashes, publish branch/base, 네 publication states와 PR number/node ID 또는 none을 결박함
- canonical `github.com`, `jinzer0/GPUWatch`, repository ID `1256824919`, 모든 origin fetch/push URL을 `ls-remote`, `fetch`, `push`, `gh api` 전에 확인함
- 실행 시 승인 state와 exact하게 같은 원격 상태만 수용하고, branch가 없을 때만 absent-ref lease와 approved final OID refspec으로 push하며, 생성 직전 all-state PR absence를 다시 확인함
- own POST 반환 number/node ID의 exact draft REST GET 뒤 같은 node만 ready로 전환하고, 명시적 REST GET이 정확히 하나의 canonical non-draft Open PR의 `.base.sha == APPROVED_DEVEL_OID`, `.head.sha == APPROVED_FINAL_COMMIT_OID`, base/head refs와 repositories, title/body를 검증함
- `Closes #N`를 본문에 요구하고, mandatory read-only GraphQL `closingIssuesReferences`가 canonical repository의 target issue 번호 하나만 반환하는지 검증함. GraphQL 오류 또는 불일치는 publication을 중단하며, 이 증거는 REST exact 검증을 대체하지 않음
- mutation 전 재시도 가능한 실패에는 input을 보존한다. create/ready 시작 뒤 ambiguous 실패 또는 state drift에는 input을 폐기하고 fresh preparation과 replacement publication 승인을 요구하며, 성공 때도 private input을 정리함

## 절대 하지 말 것

- 통합 검증 실패, 마지막 Stage 승인 전, 첫 final report/evidence 승인 전, 또는 두 번째 publication tuple 명시 승인 없이 publication input 생성이나 원격 mutation(`push`, `gh api --method POST`, PR 생성 또는 재개)
- moving `HEAD` 또는 `local/task{N}` ref를 refspec source로 사용하거나 approved final OID 이외의 commit 게시
- `local/task{N}` 직접 원격 push, absent-ref lease 없는 publish ref 생성, 기존 publish ref overwrite
- 네 valid publication state 밖의 branch/PR 상태를 추정하거나 resume 처리
- canonical identity/origin 검증 전 `ls-remote`, `fetch`, `push`, `gh api` 원격 작업
- PR 생성 직전 base/head 재검증 또는 생성/재개 뒤 explicit REST GET exact 검증을 생략
- create/ready ambiguity 뒤 publication input 또는 기존 두 번째 승인을 재사용하거나 persistent manifest로 PR을 adopt
- 반환 identity와 exact draft GET 검증 없이 PR을 ready로 전환하거나, self-merge, `gh pr review`/`gh pr merge`를 무승인 실행

## 호출 방법

- Codex: `$task-final-report` 또는 `/skills` 메뉴
- Claude Code: `/task-final-report`
