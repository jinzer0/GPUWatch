---
name: task-final-report
description: |
  하이퍼-워터폴 타스크의 최종 보고와 승인된 exact OID PR 게시 절차를 적용한다.
  최종 보고·오늘할일 commit 뒤, 명시 승인된 publication tuple만 publish/task{N}으로 게시하고 devel Open PR을 생성 또는 재개한다.
---

# 하이퍼-워터폴 최종 보고와 PR 게시

## 트리거

- 작업지시자가 "최종 보고서 작성", "PR 준비"를 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 최초 승인된 구현 계획서 commit은 Stage 1보다 먼저 존재하고, 모든 Stage 보고서와 승인이 완료됨
- 최신 승인 구현 계획서 OID와 통합 검증 명령을 작업지시자가 같은 스레드에서 지정함
- `local/task{N}`에 최종 보고서/오늘할일에 포함할 변경 외 미커밋 변경이 없음

## 절차

1. 이슈와 구현 계획서 승인 상태 검증
   - 작업지시자는 `ISSUE_NUMBER`, `APPROVED_IMPL_PLAN_COMMIT`, `IMPL_PLAN`을 명시한다. `IMPL_PLAN`은 `mydocs/plans/task_{milestone_slug}_{N}_impl.md`이다.
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL
   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   case "${APPROVED_IMPL_PLAN_COMMIT:-}" in ""|*[!0-9a-f]*) exit 1 ;; esac
   test "${#APPROVED_IMPL_PLAN_COMMIT}" -eq 40
   test -n "${IMPL_PLAN:-}"
   printf '%s\n' "$IMPL_PLAN" | grep -Eq "^mydocs/plans/task_m[0-9]+x?_${ISSUE_NUMBER}_impl\\.md$"
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
   ```
   - 위 검증 뒤 구현 계획서 수용 기준 또는 마지막 Stage 검증 명령을 실행한다.
2. 최종 보고서와 오늘할일 작성
   - 최종 보고서는 `mydocs/report/task_{milestone_slug}_{N}_report.md`에 `mydocs/_templates/final_report.md`를 기준으로 작성한다.
   - 오늘할일 `mydocs/orders/{yyyymmdd}.md`의 `#{N}` 행을 `완료`와 완료 시각으로 갱신한다.
3. 최종 보고서와 오늘할일 단일 commit
   ```bash
   git status --short
   git diff --check
   git add mydocs/report/task_{milestone_slug}_{N}_report.md mydocs/orders/{yyyymmdd}.md
   git commit -m "Task #{N}: 최종 보고서 작성과 오늘할일 완료 처리" \
     -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
     -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   test -z "$(git status --porcelain)"
   ```
4. 승인 전 private PR 입력 directory 생성
    ```bash
    set -euo pipefail
    case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
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
   printf 'PUBLICATION_DIR=%s\n' "$PUBLICATION_DIR"
   ```
   - 파일 쓰기 도구로 `$PUBLICATION_DIR/title`에 승인 요청할 PR 제목 한 줄을, `$PUBLICATION_DIR/body`에 완성 PR 본문을 기록한다. 두 파일은 directory 안에만 두며 `/tmp`의 고정 이름이나 `--body-file` handoff를 사용하지 않는다.
5. 승인 tuple 준비 및 출력
   ```bash
   set -euo pipefail
   LC_ALL=C
   export LC_ALL
   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   case "${APPROVED_IMPL_PLAN_COMMIT:-}" in ""|*[!0-9a-f]*) exit 1 ;; esac
   test "${#APPROVED_IMPL_PLAN_COMMIT}" -eq 40
    test -n "${IMPL_PLAN:-}" && test -n "${PUBLICATION_DIR:-}"
    TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
    test -d "$PUBLICATION_DIR" && test ! -L "$PUBLICATION_DIR"
    PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
    test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
    case "$(basename -- "$PUBLICATION_DIR")" in
      "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
      *) exit 1 ;;
    esac
   test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
   test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
   TITLE_FILE="$PUBLICATION_DIR/title"
   BODY_FILE="$PUBLICATION_DIR/body"
    for INPUT_FILE in "$TITLE_FILE" "$BODY_FILE"; do
      test -f "$INPUT_FILE" && test ! -L "$INPUT_FILE"
      test "$(stat -f '%Su' "$INPUT_FILE")" = "$(id -un)"
      test "$(stat -f '%l' "$INPUT_FILE")" = "1"
      case "$(stat -f '%Lp' "$INPUT_FILE")" in 600|400) ;; *) exit 1 ;; esac
   done
   IFS= read -r PR_TITLE < "$TITLE_FILE"
   printf '%s\n' "$PR_TITLE" | cmp -s - "$TITLE_FILE"
   test -n "$PR_TITLE"
   case "$PR_TITLE" in *$'\r'*) exit 1 ;; esac
   printf '%s' "$PR_TITLE" | iconv -f UTF-8 -t UTF-8 >/dev/null
   BODY_BYTES="$(wc -c < "$BODY_FILE" | tr -d '[:space:]')"
   case "$BODY_BYTES" in ""|*[!0-9]*) exit 1 ;; esac
   test "$BODY_BYTES" -gt 0 && test "$BODY_BYTES" -le 65536
   if od -An -tx1 -v "$BODY_FILE" | tr -s ' ' '\n' | grep -qx '00'; then exit 1; fi
   iconv -f UTF-8 -t UTF-8 "$BODY_FILE" >/dev/null
   PR_BODY="$(cat "$BODY_FILE"; printf '\001')"
   PR_BODY="${PR_BODY%?}"
   case "$PR_BODY" in *$'\r'*) exit 1 ;; esac
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   validate_canonical_origin() {
     GH_HOST=github.com gh auth status --hostname github.com >/dev/null
     test "$(GH_HOST=github.com gh api --hostname github.com repos/jinzer0/GPUWatch --jq .id)" = "1256824919"
     test "$(GH_HOST=github.com gh repo view jinzer0/GPUWatch --json nameWithOwner --jq .nameWithOwner)" = "jinzer0/GPUWatch"
     ORIGIN_URLS="$(git remote get-url --all origin; git remote get-url --push --all origin)"
     test -n "$ORIGIN_URLS"
     while IFS= read -r ORIGIN_URL; do
       case "$ORIGIN_URL" in
         git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
         *) exit 1 ;;
       esac
     done <<EOF
$ORIGIN_URLS
EOF
   }
   validate_canonical_origin
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   PUBLISH_BRANCH="publish/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   FINAL_COMMIT_OID="$(git rev-parse --verify HEAD^{commit})"
   validate_oid "$FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$FINAL_COMMIT_OID"
   test -z "$(git status --porcelain)"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$FINAL_COMMIT_OID:$IMPL_PLAN")"
   DEVEL_LINE="$(git ls-remote --heads origin refs/heads/devel)"
   case "$DEVEL_LINE" in *$'\n'*) exit 1 ;; esac
   IFS="$(printf '\t')" read -r DEVEL_OID DEVEL_REF DEVEL_EXTRA <<EOF
$DEVEL_LINE
EOF
   test -z "${DEVEL_EXTRA:-}" && test "$DEVEL_REF" = "refs/heads/devel"
   validate_oid "$DEVEL_OID"
    git fetch --no-tags origin +refs/heads/devel:refs/remotes/origin/devel
   test "$(git rev-parse --verify refs/remotes/origin/devel^{commit})" = "$DEVEL_OID"
   test -z "$(git ls-remote --heads origin "refs/heads/$PUBLISH_BRANCH")"
   TITLE_SHA256="$(sha256_text "$PR_TITLE")"
   BODY_SHA256="$(sha256_text "$PR_BODY")"
    printf '%s\n' "action=push-exact-oid-and-create-open-pr" "host=github.com" "repository=jinzer0/GPUWatch" "repository_id=1256824919" "issue_number=$ISSUE_NUMBER" "approved_plan_oid=$APPROVED_IMPL_PLAN_COMMIT" "devel_oid=$DEVEL_OID" "final_commit_oid=$FINAL_COMMIT_OID" "publish_branch=$PUBLISH_BRANCH" "base=devel" "title_sha256=$TITLE_SHA256" "body_sha256=$BODY_SHA256"
   ```
   - 여기서 즉시 멈춘다. 작업지시자는 같은 스레드에서 위의 모든 tuple 값과 action `push-exact-oid-and-create-open-pr`를 명시해 승인해야 한다. 이전 Stage 승인, 최종 보고서 작성 지시, 본 Skill 호출은 게시 승인이 아니다.
6. 승인 후 exact OID 게시 및 Open PR 생성/재개
    - 승인 응답의 `APPROVED_ACTION=push-exact-oid-and-create-open-pr`, `APPROVED_HOST=github.com`, `APPROVED_REPOSITORY=jinzer0/GPUWatch`, `APPROVED_REPOSITORY_ID=1256824919`, `ISSUE_NUMBER`, `APPROVED_IMPL_PLAN_COMMIT`, `IMPL_PLAN`, `PUBLICATION_DIR`, `APPROVED_DEVEL_OID`, `APPROVED_FINAL_COMMIT_OID`, `APPROVED_TITLE_SHA256`, `APPROVED_BODY_SHA256`를 그대로 설정하고 한 번에 실행한다.
   ```bash
    set -euo pipefail
    LC_ALL=C
    export LC_ALL
    test "${APPROVED_ACTION:-}" = "push-exact-oid-and-create-open-pr"
    test "${APPROVED_HOST:-}" = "github.com"
    test "${APPROVED_REPOSITORY:-}" = "jinzer0/GPUWatch"
    test "${APPROVED_REPOSITORY_ID:-}" = "1256824919"
   case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
   for OID in "${APPROVED_IMPL_PLAN_COMMIT:-}" "${APPROVED_DEVEL_OID:-}" "${APPROVED_FINAL_COMMIT_OID:-}"; do
     case "$OID" in ""|*[!0-9a-f]*) exit 1 ;; esac
     test "${#OID}" -eq 40
   done
   for DIGEST in "${APPROVED_TITLE_SHA256:-}" "${APPROVED_BODY_SHA256:-}"; do
     case "$DIGEST" in ""|*[!0-9a-f]*) exit 1 ;; esac
     test "${#DIGEST}" -eq 64
    done
    test -n "${IMPL_PLAN:-}" && test -n "${PUBLICATION_DIR:-}"
    TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
    test -d "$PUBLICATION_DIR" && test ! -L "$PUBLICATION_DIR"
    PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
    test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
    case "$(basename -- "$PUBLICATION_DIR")" in
      "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
      *) exit 1 ;;
    esac
    test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
    test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
    cleanup() { rm -rf -- "$PUBLICATION_DIR"; }
    on_signal() { trap - HUP INT TERM; exit 1; }
    trap cleanup EXIT
    trap on_signal HUP INT TERM
   TITLE_FILE="$PUBLICATION_DIR/title"
   BODY_FILE="$PUBLICATION_DIR/body"
    for INPUT_FILE in "$TITLE_FILE" "$BODY_FILE"; do
      test -f "$INPUT_FILE" && test ! -L "$INPUT_FILE"
      test "$(stat -f '%Su' "$INPUT_FILE")" = "$(id -un)"
      test "$(stat -f '%l' "$INPUT_FILE")" = "1"
      case "$(stat -f '%Lp' "$INPUT_FILE")" in 600|400) ;; *) exit 1 ;; esac
   done
   IFS= read -r PR_TITLE < "$TITLE_FILE"
   printf '%s\n' "$PR_TITLE" | cmp -s - "$TITLE_FILE"
   test -n "$PR_TITLE"
   case "$PR_TITLE" in *$'\r'*) exit 1 ;; esac
   printf '%s' "$PR_TITLE" | iconv -f UTF-8 -t UTF-8 >/dev/null
   BODY_BYTES="$(wc -c < "$BODY_FILE" | tr -d '[:space:]')"
   case "$BODY_BYTES" in ""|*[!0-9]*) exit 1 ;; esac
   test "$BODY_BYTES" -gt 0 && test "$BODY_BYTES" -le 65536
   if od -An -tx1 -v "$BODY_FILE" | tr -s ' ' '\n' | grep -qx '00'; then exit 1; fi
   iconv -f UTF-8 -t UTF-8 "$BODY_FILE" >/dev/null
   PR_BODY="$(cat "$BODY_FILE"; printf '\001')"
   PR_BODY="${PR_BODY%?}"
   case "$PR_BODY" in *$'\r'*) exit 1 ;; esac
   sha256_text() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
   validate_oid() { case "$1" in ""|*[!0-9a-f]*) exit 1 ;; esac; test "${#1}" -eq 40; }
   validate_canonical_origin() {
     GH_HOST=github.com gh auth status --hostname github.com >/dev/null
     test "$(GH_HOST=github.com gh api --hostname github.com repos/jinzer0/GPUWatch --jq .id)" = "1256824919"
     test "$(GH_HOST=github.com gh repo view jinzer0/GPUWatch --json nameWithOwner --jq .nameWithOwner)" = "jinzer0/GPUWatch"
     ORIGIN_URLS="$(git remote get-url --all origin; git remote get-url --push --all origin)"
     test -n "$ORIGIN_URLS"
     while IFS= read -r ORIGIN_URL; do
       case "$ORIGIN_URL" in
         git@github.com:jinzer0/GPUWatch|git@github.com:jinzer0/GPUWatch.git|https://github.com/jinzer0/GPUWatch|https://github.com/jinzer0/GPUWatch.git|ssh://git@github.com/jinzer0/GPUWatch|ssh://git@github.com/jinzer0/GPUWatch.git) ;;
         *) exit 1 ;;
       esac
     done <<EOF
$ORIGIN_URLS
EOF
   }
   TITLE_SHA256="$(sha256_text "$PR_TITLE")"
   BODY_SHA256="$(sha256_text "$PR_BODY")"
   test "$TITLE_SHA256" = "$APPROVED_TITLE_SHA256"
   test "$BODY_SHA256" = "$APPROVED_BODY_SHA256"
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   PUBLISH_BRANCH="publish/task${ISSUE_NUMBER}"
   test "$(git branch --show-current)" = "$TASK_BRANCH"
   test -z "$(git status --porcelain)"
   test "$(git rev-parse --verify HEAD^{commit})" = "$APPROVED_FINAL_COMMIT_OID"
   test "$(git rev-parse --verify "${TASK_BRANCH}^{commit}")" = "$APPROVED_FINAL_COMMIT_OID"
   git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}"
   test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN"
   test "$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" = "$(git rev-parse "$APPROVED_FINAL_COMMIT_OID:$IMPL_PLAN")"
   validate_canonical_origin
   DEVEL_LINE="$(git ls-remote --heads origin refs/heads/devel)"
   case "$DEVEL_LINE" in *$'\n'*) exit 1 ;; esac
   IFS="$(printf '\t')" read -r DEVEL_OID DEVEL_REF DEVEL_EXTRA <<EOF
$DEVEL_LINE
EOF
   test -z "${DEVEL_EXTRA:-}" && test "$DEVEL_REF" = "refs/heads/devel"
   validate_oid "$DEVEL_OID"
   test "$DEVEL_OID" = "$APPROVED_DEVEL_OID"
    git fetch --no-tags origin +refs/heads/devel:refs/remotes/origin/devel
   test "$(git rev-parse --verify refs/remotes/origin/devel^{commit})" = "$APPROVED_DEVEL_OID"
   REMOTE_PUBLISH="$(git ls-remote --heads origin "refs/heads/$PUBLISH_BRANCH")"
   if test -n "$REMOTE_PUBLISH"; then
     case "$REMOTE_PUBLISH" in *$'\n'*) exit 1 ;; esac
     IFS="$(printf '\t')" read -r REMOTE_OID REMOTE_REF REMOTE_EXTRA <<EOF
$REMOTE_PUBLISH
EOF
     test -z "${REMOTE_EXTRA:-}" && test "$REMOTE_REF" = "refs/heads/$PUBLISH_BRANCH"
     test "$REMOTE_OID" = "$APPROVED_FINAL_COMMIT_OID"
   else
     git push --porcelain --force-with-lease="refs/heads/$PUBLISH_BRANCH:" origin "$APPROVED_FINAL_COMMIT_OID:refs/heads/$PUBLISH_BRANCH"
   fi
   test "$(git ls-remote --heads origin "refs/heads/$PUBLISH_BRANCH" | cut -f1)" = "$APPROVED_FINAL_COMMIT_OID"
   PR_NUMBERS="$(GH_HOST=github.com gh api --hostname github.com "repos/jinzer0/GPUWatch/pulls?state=open&base=devel&head=jinzer0%3A$PUBLISH_BRANCH&per_page=100" --jq '.[].number')"
   if test -z "$PR_NUMBERS"; then
     GH_HOST=github.com gh pr create --repo jinzer0/GPUWatch --base devel --head "$PUBLISH_BRANCH" --title "$PR_TITLE" --body "$PR_BODY"
     PR_NUMBERS="$(GH_HOST=github.com gh api --hostname github.com "repos/jinzer0/GPUWatch/pulls?state=open&base=devel&head=jinzer0%3A$PUBLISH_BRANCH&per_page=100" --jq '.[].number')"
   fi
   case "$PR_NUMBERS" in ""|*$'\n'*) exit 1 ;; esac
   PR_TUPLE="$(GH_HOST=github.com gh pr view "$PR_NUMBERS" --repo jinzer0/GPUWatch --json state,isDraft,baseRefName,headRefName,headRepository,headRefOid --jq '[.state,.isDraft,.baseRefName,.headRefName,.headRepository.nameWithOwner,.headRefOid] | @tsv')"
   IFS="$(printf '\t')" read -r PR_STATE PR_DRAFT PR_BASE PR_HEAD PR_HEAD_REPO PR_HEAD_OID PR_EXTRA <<EOF
$PR_TUPLE
EOF
    test -z "${PR_EXTRA:-}" && test "$PR_STATE" = "OPEN" && test "$PR_DRAFT" = "false"
    test "$PR_BASE" = "devel" && test "$PR_HEAD" = "$PUBLISH_BRANCH"
    test "$PR_HEAD_REPO" = "jinzer0/GPUWatch" && test "$PR_HEAD_OID" = "$APPROVED_FINAL_COMMIT_OID"
    PR_TITLE_BASE64="$(GH_HOST=github.com gh pr view "$PR_NUMBERS" --repo jinzer0/GPUWatch --json title --jq '.title | @base64')"
    PR_BODY_BASE64="$(GH_HOST=github.com gh pr view "$PR_NUMBERS" --repo jinzer0/GPUWatch --json body --jq '.body | @base64')"
    test "$PR_TITLE_BASE64" = "$(printf '%s' "$PR_TITLE" | base64 | tr -d '\n')"
    test "$PR_BODY_BASE64" = "$(printf '%s' "$PR_BODY" | base64 | tr -d '\n')"
   ```
   - absent-ref lease와 push 뒤 remote OID 확인은 ref 경쟁을 감지한다. GitHub 서버 전체에 대한 원자성을 주장하지 않으며, mismatch 또는 둘 이상의 Open PR은 중단한다.
   - execution fence의 `trap`은 성공·실패 모두 private temp directory만 제거한다. 승인 전에 중단하면 다음 명령으로 같은 범위만 정리한다.
   ```bash
    set -euo pipefail
    case "${ISSUE_NUMBER:-}" in ""|*[!0-9]*) exit 1 ;; esac
    test -n "${PUBLICATION_DIR:-}"
    TMP_PARENT="$(cd -P -- "${TMPDIR:-/tmp}" && pwd -P)"
    test -d "$PUBLICATION_DIR" && test ! -L "$PUBLICATION_DIR"
    PUBLICATION_DIR="$(cd -P -- "$PUBLICATION_DIR" && pwd -P)"
    test "$(dirname -- "$PUBLICATION_DIR")" = "$TMP_PARENT"
    case "$(basename -- "$PUBLICATION_DIR")" in
      "gpuwatcher-task${ISSUE_NUMBER}-publication."??????) ;;
      *) exit 1 ;;
    esac
    test "$(stat -f '%Su' "$PUBLICATION_DIR")" = "$(id -un)"
    test "$(stat -f '%Lp' "$PUBLICATION_DIR")" = "700"
    rm -rf -- "$PUBLICATION_DIR"
   ```
7. 작업지시자에게 검증된 PR 번호와 URL 전달, 리뷰·merge 승인 요청

## PR 본문 규칙

- `.github/pull_request_template.md`를 출발점으로 사용하고 최대 4개 요약 bullet, Stage별 한 줄 요약, 검증 결과, 남은 위험을 포함한다.
- Stage 제목은 단계 보고서 URL로, 짧은 commit SHA는 commit URL로 링크한다.
- 작업 문서는 final commit OID 기준 `https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/...` URL을 `[파일명](URL)` 형식으로 쓴다.
- 상대 링크, `blob/publish/task{N}/...`, raw URL은 사용하지 않는다.
- 검증은 `자동 검증`, `수동/시나리오 검증`, `CI/원격 검증`, `검증 한계`로 기록한다. 실행하지 않은 검증은 표가 아니라 한계 또는 위험에 사유를 적는다.

## 검증

- 승인 구현 계획서 OID의 plan blob이 HEAD, index, working tree와 일치한 뒤 수용 기준을 실행함
- final report/오늘할일 commit 뒤 working tree가 깨끗함
- 승인 전 출력한 action, issue, plan OID, devel OID, final OID, publish branch, base, title/body digest tuple을 작업지시자가 같은 스레드에서 명시 승인함
- canonical `github.com`, `jinzer0/GPUWatch`, repository ID `1256824919`, 모든 origin fetch/push URL을 remote 작업 전에 확인함
- 승인 후 devel OID, final OID, plan blob, title/body digest, clean state를 다시 확인함
- absent-ref lease로 exact final OID만 게시하고 remote publish OID가 같은 값을 반환함
- canonical repository에 non-draft Open PR이 정확히 하나이며 `devel` <- `publish/task{N}`와 head OID가 승인 tuple과 일치함

## 절대 하지 말 것

- 통합 검증 실패, 마지막 Stage 승인 전, 또는 tuple 명시 승인 없이 PR 생성·push
- moving `HEAD` 또는 `local/task{N}` ref를 refspec source로 사용하거나 approved final OID 이외의 commit 게시
- `local/task{N}` 직접 원격 push, absent-ref lease 없는 publish ref 생성, 기존 publish ref overwrite
- canonical identity/origin 검증 전 `ls-remote`, `fetch`, `push`, `gh` 원격 작업
- Draft PR 생성, self-merge, `gh pr review`/`gh pr merge`의 무승인 실행

## 호출 방법

- Codex: `$task-final-report` 또는 `/skills` 메뉴
- Claude Code: `/task-final-report`
