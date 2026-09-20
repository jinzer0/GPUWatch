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
- 타스크 시작: 이미 생성된 이슈 번호가 있으면 [`task-start`](../skills/task-start/SKILL.md) Skill로 exact open non-PR issue, live open milestone, canonical origin, immutable `devel` OID를 검증한 뒤 브랜치, 오늘할일, 수행계획서를 만든다. 내부 PR 제목 데이터는 검증된 live issue title에서 정확히 `Task #N: <live issue title>`로 만든다.
- 브랜치명: `local/task{issue번호}` (예: `local/task1`)
- PR 생성용 원격 브랜치명: `publish/task{issue번호}` (예: `publish/task1`)
- 커밋 메시지 규칙:
  - 기본형: `Task #{issue번호}: 내용`
  - 단계 커밋: `Task #{issue번호} Stage {N}: 내용`
  - 세부 하위 단계 허용: `Task #{issue번호} [Stage {N.M}]: 내용`
  - 최종 보고서 커밋: `Task #{issue번호}: 최종 보고서 작성과 오늘할일 완료 처리`
- `mydocs/orders/`에서 `M100 #1` 형식으로 마일스톤+이슈 참조
- 타스크 완료 시: PR merge 후 `pr-merge-cleanup`의 read-only preflight가 atomically fetched issue `state`와 exact server `updated_at`를 포함해 출력한 host, repository, repository ID, PR 번호, 이슈 번호, merged head OID, base/head refs, action `close-issue:completed` exact tuple을 같은 스레드에서 승인한 뒤 cleanup transaction을 실행한다. merge 자체는 현재 `OPEN` 이슈 close 승인이 아니다. 이슈가 처음 `CLOSED`여도 삭제 직전 또는 close 직전 `OPEN`으로 관측되면 exact `updated_at`까지 일치하는 같은 exact tuple 승인이 필요하다. 이미 `CLOSED`인 이슈는 검증된 no-op으로 처리한다.

## 타스크 진행 절차

1. 이슈가 없는 작업은 `task-register`로 GitHub Issue 등록. 기존 이슈가 있으면 해당 번호 사용
2. 작업지시자가 지정한 이슈를 `task-start`로 시작하고 `local/task{issue번호}` 브랜치 생성 후 진행
3. 수행 전 수행계획서 작성 → 승인 요청
4. 구현 계획서 작성 (최소 3단계, 최대 6단계) → 내용 승인 요청. 승인 후 Stage 1 시작 전에 승인본을 독립 커밋으로 기록
    ```bash
    EXPECTED_BRANCH="local/task{issue번호}"
    IMPLEMENTATION_PLAN_PATH="mydocs/plans/task_{milestone_slug}_{issue번호}_impl.md"
    implementation_plan_commit_fence() {
      local expected_path expected_path_output expected_path_set actual_path_output actual_path_set VALIDATED_OPERAND_KIND
      local DOCUMENT_PATH DOCUMENT_METADATA STAGED_DOCUMENT_ENTRY STAGED_DOCUMENT_MODE STAGED_DOCUMENT_REMAINDER STAGED_DOCUMENT_BLOB STAGED_DOCUMENT_TAIL WORKTREE_DOCUMENT_BLOB
      local REPLACE_REFS INITIAL_INDEX_PATHS STAGED_DIFF_CHECK_OUTPUT WORKTREE_DIFF_OUTPUT UNTRACKED_PATHS
      local BRANCH_BEFORE_COMMIT HEAD_REF STAGED_TREE CURRENT_BRANCH CURRENT_HEAD_REF CURRENT_PARENT CURRENT_STAGED_TREE
      local BRANCH_SYMBOLIC_TARGET SYMBOLIC_REF_STATUS DIRECT_REF_RECORD
      local REF_TRANSACTION_INPUT_PIPE REF_TRANSACTION_RESPONSE_FILE REF_TRANSACTION_ERROR_FILE REF_TRANSACTION_DIR REF_TRANSACTION_PID REF_TRANSACTION_PGID REF_TRANSACTION_PARENT_PGID REF_TRANSACTION_GIT REF_TRANSACTION_DIR_IDENTITY REF_TRANSACTION_DIR_METADATA REF_TRANSACTION_OWNER_UID REF_TRANSACTION_INPUT_PIPE_IDENTITY REF_TRANSACTION_RESPONSE_FILE_IDENTITY REF_TRANSACTION_ERROR_FILE_IDENTITY REF_TRANSACTION_CLEANUP_DIR REF_TRANSACTION_OUTPUT REF_TRANSACTION_WAIT_STATUS REF_TRANSACTION_TRANSCRIPT_STATUS REF_TRANSACTION_FINAL_TRANSCRIPT REF_TRANSACTION_FINAL_TRANSCRIPT_STATUS REF_TRANSACTION_REAP_STATUS REF_TRANSACTION_STATUS
      local CREATED_COMMIT_OID HEAD_AFTER_UPDATE COMMITTED_PARENT COMMITTED_TREE COMMITTED_DOCUMENT_ENTRY COMMITTED_PATH_OUTPUT COMMITTED_PATH_SET
      local POST_INDEX_PATHS POST_WORKTREE_DIFF_OUTPUT POST_UNTRACKED_PATHS POST_STATUS_OUTPUT
      test -n "${EXPECTED_BRANCH:-}" || exit 1
      test -n "${IMPLEMENTATION_PLAN_PATH:-}" || exit 1
      EXPECTED_IMPL_PLAN_PATHS=("$IMPLEMENTATION_PLAN_PATH")
      EXPECTED_IMPL_PLAN_OPERAND_KINDS=()
      test "${#EXPECTED_IMPL_PLAN_PATHS[@]}" -eq 1 || exit 1
      DOCUMENT_PATH="$IMPLEMENTATION_PLAN_PATH"
      BRANCH_REF="refs/heads/$EXPECTED_BRANCH"
      GIT_CONFIG_COUNT=1
      GIT_CONFIG_KEY_0=core.hooksPath
      GIT_CONFIG_VALUE_0=/dev/null
      export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
      export GIT_NO_REPLACE_OBJECTS=1
      export GIT_LITERAL_PATHSPECS=1
      plan_validate_literal_path() {
        case "$1" in
          ""|/*|*//*) return 1 ;;
          *[!A-Za-z0-9._/-]*) return 1 ;;
        esac
        case "/$1/" in
          */./*|*/../*) return 1 ;;
        esac
        return 0
      }
      plan_validate_file_operand() {
        local operand=$1 tracked_entries tracked_entry tracked_count tracked_mode tracked_remainder tracked_tail
        if test -L "$operand"; then
          VALIDATED_OPERAND_KIND=present
          return 0
        fi
        if test -d "$operand"; then
          return 1
        fi
        if test -f "$operand"; then
          VALIDATED_OPERAND_KIND=present
          return 0
        fi
        if test -e "$operand"; then
          return 1
        fi
        tracked_entries="$(git ls-files --stage -- "$operand")" || return 1
        tracked_count=0
        while IFS= read -r tracked_entry; do
          test -n "$tracked_entry" || continue
          tracked_count=$((tracked_count + 1))
          tracked_mode="${tracked_entry%% *}"
          tracked_remainder="${tracked_entry#* }"
          tracked_tail="${tracked_remainder#* }"
        done <<< "$tracked_entries"
        test "$tracked_count" = 1 || return 1
        case "$tracked_mode" in 100644|100755|120000) ;; *) return 1 ;; esac
        test "$tracked_tail" = "0"$'\t'"$operand" || return 1
        VALIDATED_OPERAND_KIND=deletion
      }
      expected_path_output=
      for expected_path in "${EXPECTED_IMPL_PLAN_PATHS[@]}"; do
        plan_validate_literal_path "$expected_path" || exit 1
        plan_validate_file_operand "$expected_path" || exit 1
        EXPECTED_IMPL_PLAN_OPERAND_KINDS+=("$VALIDATED_OPERAND_KIND")
        if test -n "$expected_path_output"; then
          expected_path_output="$expected_path_output"$'\n'
        fi
        expected_path_output="$expected_path_output$expected_path"
      done
      plan_update_exact_index_operand() {
        local operand=$1 expected_kind=$2
        plan_validate_file_operand "$operand" || return 1
        test "$VALIDATED_OPERAND_KIND" = "$expected_kind" || return 1
        if test "$expected_kind" = present; then
          git update-index --add -- "$operand" || return 1
          return 0
        fi
        test ! -e "$operand" && test ! -L "$operand" || return 1
        git update-index --force-remove -- "$operand" || return 1
      }
      plan_validate_expected_operand_kinds() {
        local operand_index operand expected_kind
        for ((operand_index=0; operand_index<${#EXPECTED_IMPL_PLAN_PATHS[@]}; operand_index++)); do
          operand="${EXPECTED_IMPL_PLAN_PATHS[$operand_index]}"
          expected_kind="${EXPECTED_IMPL_PLAN_OPERAND_KINDS[$operand_index]}"
          if test "$expected_kind" = deletion; then
            test ! -e "$operand" && test ! -L "$operand" || return 1
          else
            plan_validate_file_operand "$operand" || return 1
            test "$VALIDATED_OPERAND_KIND" = present || return 1
          fi
        done
      }
      plan_sort_path_output() {
        LC_ALL=C sort <<< "$1"
      }
      expected_path_set="$(plan_sort_path_output "$expected_path_output")" || exit 1
      test -n "$expected_path_set" || exit 1
      plan_validate_replace_refs() {
        REPLACE_REFS="$(git for-each-ref --format='%(refname)' refs/replace/)" || return 1
        test -z "$REPLACE_REFS" || return 1
      }
      plan_validate_document_identity() {
        test -f "$DOCUMENT_PATH" || return 1
        test ! -L "$DOCUMENT_PATH" || return 1
        DOCUMENT_METADATA="$(stat -f '%Lp %l' -- "$DOCUMENT_PATH")" || return 1
        test "$DOCUMENT_METADATA" = "644 1" || return 1
        STAGED_DOCUMENT_ENTRY="$(git ls-files --stage -- "$DOCUMENT_PATH")" || return 1
        STAGED_DOCUMENT_MODE="${STAGED_DOCUMENT_ENTRY%% *}"
        STAGED_DOCUMENT_REMAINDER="${STAGED_DOCUMENT_ENTRY#* }"
        STAGED_DOCUMENT_BLOB="${STAGED_DOCUMENT_REMAINDER%% *}"
        STAGED_DOCUMENT_TAIL="${STAGED_DOCUMENT_REMAINDER#* }"
        test "$STAGED_DOCUMENT_MODE" = "100644" || return 1
        test "$STAGED_DOCUMENT_TAIL" = "0"$'\t'"$DOCUMENT_PATH" || return 1
        WORKTREE_DOCUMENT_BLOB="$(git hash-object -- "$DOCUMENT_PATH")" || return 1
        test "$WORKTREE_DOCUMENT_BLOB" = "$STAGED_DOCUMENT_BLOB" || return 1
      }
      plan_validate_staged_state() {
        plan_validate_expected_operand_kinds || return 1
        STAGED_DIFF_CHECK_OUTPUT="$(git diff --cached --check)" || return 1
        test -z "$STAGED_DIFF_CHECK_OUTPUT" || return 1
        actual_path_output="$(git diff --cached --name-only --no-renames)" || return 1
        actual_path_set="$(plan_sort_path_output "$actual_path_output")" || return 1
        test "$actual_path_set" = "$expected_path_set" || return 1
        WORKTREE_DIFF_OUTPUT="$(git diff --name-only --no-renames)" || return 1
        test -z "$WORKTREE_DIFF_OUTPUT" || return 1
        UNTRACKED_PATHS="$(git ls-files --others --exclude-standard)" || return 1
        test -z "$UNTRACKED_PATHS" || return 1
        plan_validate_document_identity || return 1
      }
      plan_validate_pre_ref_update() {
        plan_validate_replace_refs || return 1
        CURRENT_BRANCH="$(git branch --show-current)" || return 1
        test "$CURRENT_BRANCH" = "$BRANCH_BEFORE_COMMIT" || return 1
        CURRENT_HEAD_REF="$(git symbolic-ref --quiet HEAD)" || return 1
        test "$CURRENT_HEAD_REF" = "$BRANCH_REF" || return 1
        CURRENT_PARENT="$(git rev-parse --verify HEAD^{commit})" || return 1
        test "$CURRENT_PARENT" = "$PARENT_COMMIT" || return 1
        plan_validate_staged_state || return 1
        CURRENT_STAGED_TREE="$(git write-tree)" || return 1
        test "$CURRENT_STAGED_TREE" = "$STAGED_TREE" || return 1
      }
      plan_validate_direct_branch_ref() {
        if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then
          return 1
        else
          SYMBOLIC_REF_STATUS=$?
        fi
        test "$SYMBOLIC_REF_STATUS" = 1 || return 1
        DIRECT_REF_RECORD="$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' "$BRANCH_REF")" || return 1
        test "$DIRECT_REF_RECORD" = "$BRANCH_REF $1 symref=" || return 1
      }
      plan_classify_branch_ref() {
        local exact_new=$1 exact_old=$2
        BRANCH_REF_CLASS=unreadable
        if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then
          BRANCH_REF_CLASS=symbolic
          return 0
        else
          SYMBOLIC_REF_STATUS=$?
        fi
        test "$SYMBOLIC_REF_STATUS" = 1 || return 0
        DIRECT_REF_RECORD="$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' "$BRANCH_REF")" || return 0
        case "$DIRECT_REF_RECORD" in
          "") BRANCH_REF_CLASS=missing ;;
          "$BRANCH_REF $exact_new symref=") BRANCH_REF_CLASS=exact-new ;;
          "$BRANCH_REF $exact_old symref=") BRANCH_REF_CLASS=exact-old ;;
          "$BRANCH_REF "*' symref=') BRANCH_REF_CLASS=competing-direct ;;
        esac
      }
      plan_update_branch_ref_transaction() {
        (
        trap - EXIT HUP INT TERM
        local new_oid=$1 old_oid=$2
        REF_TRANSACTION_DIR=
        REF_TRANSACTION_FINALIZED=0
        REF_TRANSACTION_FINAL_STATUS=
        REF_TRANSACTION_PID=
        REF_TRANSACTION_PGID=
        REF_TRANSACTION_PARENT_PGID=
        REF_TRANSACTION_WAIT_STATUS=
        REF_TRANSACTION_SIGNAL_RECEIVED=0
        plan_validate_direct_branch_ref "$old_oid" || return 1
        REF_TRANSACTION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpuwatcher-ref-transaction.XXXXXX")" || return 1
        plan_finalize_ref_transaction() {
          local original_status=$1 cleanup_status=0
          if test "${REF_TRANSACTION_FINALIZED:-0}" = 1; then
            return "${REF_TRANSACTION_FINAL_STATUS:-1}"
          fi
          REF_TRANSACTION_FINALIZED=1
          exec 3>&- 2>/dev/null || :
          exec 8>&- 2>/dev/null || :
          if ! type plan_reap_transaction_child >/dev/null 2>&1; then
            rmdir -- "$REF_TRANSACTION_DIR" 2>/dev/null || cleanup_status=1
          elif plan_reap_transaction_child; then
            plan_cleanup_ref_transaction_dir || cleanup_status=1
          else
            cleanup_status=1
          fi
          REF_TRANSACTION_FINAL_STATUS=$original_status
          if test "$original_status" = 0 && test "$cleanup_status" != 0; then
            REF_TRANSACTION_FINAL_STATUS=1
          fi
          return "$REF_TRANSACTION_FINAL_STATUS"
        }
        plan_finish_ref_transaction() {
          local original_status=$?
          trap - EXIT HUP INT TERM
          plan_finalize_ref_transaction "$original_status"
          exit $?
        }
        plan_signal_finish_ref_transaction() {
          trap - HUP INT TERM
          REF_TRANSACTION_SIGNAL_RECEIVED=1
          plan_finalize_ref_transaction 1
          exit 1
        }
        trap plan_finish_ref_transaction EXIT
        trap plan_signal_finish_ref_transaction HUP INT TERM
        REF_TRANSACTION_DIR_IDENTITY="$(stat -f '%d:%i' -- "$REF_TRANSACTION_DIR")" || return 1
        REF_TRANSACTION_OWNER_UID="$(id -u)" || return 1
        case "$REF_TRANSACTION_OWNER_UID" in *[!0-9]*|'') return 1 ;; esac
        REF_TRANSACTION_DIR_METADATA="$(stat -f '%u:%Lp' -- "$REF_TRANSACTION_DIR")" || return 1
        test "$REF_TRANSACTION_DIR_METADATA" = "$REF_TRANSACTION_OWNER_UID:700" || return 1
        test -d "$REF_TRANSACTION_DIR" && test ! -L "$REF_TRANSACTION_DIR" || return 1
        REF_TRANSACTION_INPUT_PIPE="$REF_TRANSACTION_DIR/input"
        REF_TRANSACTION_RESPONSE_FILE="$REF_TRANSACTION_DIR/response"
        REF_TRANSACTION_ERROR_FILE="$REF_TRANSACTION_DIR/error"
        REF_TRANSACTION_GIT="$(type -P git)" || return 1
        test -n "$REF_TRANSACTION_GIT" && test -x "$REF_TRANSACTION_GIT" || return 1
        plan_validate_transaction_child_ids() {
          case "$REF_TRANSACTION_PID" in *[!0-9]*|'') return 1 ;; esac
          case "$REF_TRANSACTION_PGID" in *[!0-9]*|'') return 1 ;; esac
          case "$REF_TRANSACTION_PARENT_PGID" in *[!0-9]*|'') return 1 ;; esac
          test "$REF_TRANSACTION_PGID" = "$REF_TRANSACTION_PID" || return 1
          test "$REF_TRANSACTION_PGID" != "$REF_TRANSACTION_PARENT_PGID" || return 1
        }
        plan_snapshot_transaction_group() {
          local transaction_snapshot transaction_snapshot_status transaction_snapshot_line transaction_snapshot_pid transaction_snapshot_pgid transaction_snapshot_state transaction_snapshot_extra transaction_leader_state transaction_leader_reapable
          REF_TRANSACTION_GROUP_LIVE=0
          plan_validate_transaction_child_ids || return 1
          transaction_leader_state="$(ps -p "$REF_TRANSACTION_PID" -o state= 2>/dev/null | tr -d '[:space:]')" || transaction_leader_state=
          case "$transaction_leader_state" in
            ""|Z*) transaction_leader_reapable=1 ;;
            *[!A-Za-z+]*) return 1 ;;
            *) transaction_leader_reapable=0 ;;
          esac
          transaction_snapshot="$(LC_ALL=C ps -g "$REF_TRANSACTION_PGID" -o pid=,pgid=,state= 2>/dev/null)"
          transaction_snapshot_status=$?
          if test "$transaction_snapshot_status" != 0; then
            test -z "$transaction_snapshot" && test "$transaction_leader_reapable" = 1 || return 1
          fi
          while IFS= read -r transaction_snapshot_line; do
            test -n "$transaction_snapshot_line" || continue
            transaction_snapshot_extra=
            IFS=' ' read -r transaction_snapshot_pid transaction_snapshot_pgid transaction_snapshot_state transaction_snapshot_extra <<EOF
$transaction_snapshot_line
EOF
            case "$transaction_snapshot_pid" in *[!0-9]*|'') return 1 ;; esac
            case "$transaction_snapshot_pgid" in *[!0-9]*|'') return 1 ;; esac
            case "$transaction_snapshot_state" in [A-Za-z]*) ;; *) return 1 ;; esac
            test -z "$transaction_snapshot_extra" || return 1
            if test "$transaction_snapshot_pgid" = "$REF_TRANSACTION_PGID"; then
              case "$transaction_snapshot_state" in Z*) ;; *) REF_TRANSACTION_GROUP_LIVE=1 ;; esac
            fi
          done <<EOF
$transaction_snapshot
EOF
        }
        plan_reap_transaction_child() {
          local attempt
          test -n "${REF_TRANSACTION_PID:-}" || return 0
          plan_validate_transaction_child_ids || return 1
          plan_snapshot_transaction_group || return 1
          if test "$REF_TRANSACTION_GROUP_LIVE" = 1; then
            kill -TERM -- "-$REF_TRANSACTION_PGID" 2>/dev/null || :
            attempt=0
            while test "$REF_TRANSACTION_GROUP_LIVE" = 1 && test "$attempt" -lt 2; do
              /bin/sleep 0.05 || return 1
              attempt=$((attempt + 1))
              plan_snapshot_transaction_group || return 1
            done
            if test "$REF_TRANSACTION_GROUP_LIVE" = 1; then
              kill -KILL -- "-$REF_TRANSACTION_PGID" 2>/dev/null || :
              attempt=0
              while test "$REF_TRANSACTION_GROUP_LIVE" = 1 && test "$attempt" -lt 1; do
                /bin/sleep 0.05 || return 1
                attempt=$((attempt + 1))
                plan_snapshot_transaction_group || return 1
              done
            fi
          fi
          test "$REF_TRANSACTION_GROUP_LIVE" = 0 || return 1
          if wait "$REF_TRANSACTION_PID" 2>/dev/null; then
            REF_TRANSACTION_WAIT_STATUS=0
          else
            REF_TRANSACTION_WAIT_STATUS=$?
          fi
          REF_TRANSACTION_PID=
          REF_TRANSACTION_PGID=
          REF_TRANSACTION_PARENT_PGID=
          return 0
        }
        plan_restore_claimed_ref_transaction_dir() {
          test -n "${REF_TRANSACTION_CLEANUP_DIR:-}" || return 1
          test ! -e "$REF_TRANSACTION_DIR" && test ! -L "$REF_TRANSACTION_DIR" || return 1
          mv -- "$REF_TRANSACTION_CLEANUP_DIR" "$REF_TRANSACTION_DIR" 2>/dev/null
        }
        plan_validate_claimed_ref_transaction_dir() {
          local cleanup_members cleanup_member
          test -d "$REF_TRANSACTION_CLEANUP_DIR" && test ! -L "$REF_TRANSACTION_CLEANUP_DIR" || return 1
          test "$(stat -f '%d:%i' -- "$REF_TRANSACTION_CLEANUP_DIR")" = "$REF_TRANSACTION_DIR_IDENTITY" || return 1
          test "$(stat -f '%u:%Lp' -- "$REF_TRANSACTION_CLEANUP_DIR")" = "$REF_TRANSACTION_DIR_METADATA" || return 1
          shopt -s nullglob dotglob
          cleanup_members=("$REF_TRANSACTION_CLEANUP_DIR"/*)
          test "${#cleanup_members[@]}" = 3 || return 1
          for cleanup_member in "${cleanup_members[@]}"; do
            case "$cleanup_member" in
              "$REF_TRANSACTION_CLEANUP_DIR/input")
                test -p "$cleanup_member" && test ! -L "$cleanup_member" || return 1
                test "$(stat -f '%d:%i' -- "$cleanup_member")" = "$REF_TRANSACTION_INPUT_PIPE_IDENTITY" || return 1
                test "$(stat -f '%u:%Lp:%l' -- "$cleanup_member")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
                ;;
              "$REF_TRANSACTION_CLEANUP_DIR/response")
                test -f "$cleanup_member" && test ! -L "$cleanup_member" || return 1
                test "$(stat -f '%d:%i' -- "$cleanup_member")" = "$REF_TRANSACTION_RESPONSE_FILE_IDENTITY" || return 1
                test "$(stat -f '%u:%Lp:%l' -- "$cleanup_member")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
                ;;
              "$REF_TRANSACTION_CLEANUP_DIR/error")
                test -f "$cleanup_member" && test ! -L "$cleanup_member" || return 1
                test "$(stat -f '%d:%i' -- "$cleanup_member")" = "$REF_TRANSACTION_ERROR_FILE_IDENTITY" || return 1
                test "$(stat -f '%u:%Lp:%l' -- "$cleanup_member")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
                ;;
              *) return 1 ;;
            esac
          done
        }
        plan_cleanup_ref_transaction_dir() {
          test -n "${REF_TRANSACTION_DIR:-}" || return 0
          REF_TRANSACTION_CLEANUP_DIR="$REF_TRANSACTION_DIR.cleanup.$$.${RANDOM:-0}"
          mv -- "$REF_TRANSACTION_DIR" "$REF_TRANSACTION_CLEANUP_DIR" 2>/dev/null || return 1
          if ! plan_validate_claimed_ref_transaction_dir; then
            plan_restore_claimed_ref_transaction_dir || :
            return 1
          fi
          rm -- "$REF_TRANSACTION_CLEANUP_DIR/input" "$REF_TRANSACTION_CLEANUP_DIR/response" "$REF_TRANSACTION_CLEANUP_DIR/error" || return 1
          rmdir -- "$REF_TRANSACTION_CLEANUP_DIR" || return 1
          REF_TRANSACTION_DIR=
        }
        mkfifo "$REF_TRANSACTION_INPUT_PIPE" && chmod 600 "$REF_TRANSACTION_INPUT_PIPE" || return 1
        test -p "$REF_TRANSACTION_INPUT_PIPE" && test ! -L "$REF_TRANSACTION_INPUT_PIPE" && test "$(stat -f '%u:%Lp:%l' -- "$REF_TRANSACTION_INPUT_PIPE")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
        : > "$REF_TRANSACTION_RESPONSE_FILE" && chmod 600 "$REF_TRANSACTION_RESPONSE_FILE" || return 1
        : > "$REF_TRANSACTION_ERROR_FILE" && chmod 600 "$REF_TRANSACTION_ERROR_FILE" || return 1
        test -f "$REF_TRANSACTION_RESPONSE_FILE" && test ! -L "$REF_TRANSACTION_RESPONSE_FILE" && test "$(stat -f '%u:%Lp:%l' -- "$REF_TRANSACTION_RESPONSE_FILE")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
        test -f "$REF_TRANSACTION_ERROR_FILE" && test ! -L "$REF_TRANSACTION_ERROR_FILE" && test "$(stat -f '%u:%Lp:%l' -- "$REF_TRANSACTION_ERROR_FILE")" = "$REF_TRANSACTION_OWNER_UID:600:1" || return 1
        REF_TRANSACTION_INPUT_PIPE_IDENTITY="$(stat -f '%d:%i' -- "$REF_TRANSACTION_INPUT_PIPE")" || return 1
        REF_TRANSACTION_RESPONSE_FILE_IDENTITY="$(stat -f '%d:%i' -- "$REF_TRANSACTION_RESPONSE_FILE")" || return 1
        REF_TRANSACTION_ERROR_FILE_IDENTITY="$(stat -f '%d:%i' -- "$REF_TRANSACTION_ERROR_FILE")" || return 1
        REF_TRANSACTION_PARENT_PGID="$(ps -p "$$" -o pgid= | tr -d '[:space:]')" || return 1
        case "$REF_TRANSACTION_PARENT_PGID" in *[!0-9]*|'') return 1 ;; esac
        set -m
        exec 8<> "$REF_TRANSACTION_INPUT_PIPE"
        (
          set +m
          exec 3>&- 2>/dev/null || :
          exec 8>&-
          exec "$REF_TRANSACTION_GIT" update-ref --stdin < "$REF_TRANSACTION_INPUT_PIPE" > "$REF_TRANSACTION_RESPONSE_FILE" 2> "$REF_TRANSACTION_ERROR_FILE"
        ) &
        REF_TRANSACTION_PID=$!
        REF_TRANSACTION_PGID="$(ps -p "$REF_TRANSACTION_PID" -o pgid= | tr -d '[:space:]')"
        REF_TRANSACTION_STATUS=$?
        set +m
        test "$REF_TRANSACTION_STATUS" = 0 || return 1
        plan_validate_transaction_child_ids || return 1
        exec 3> "$REF_TRANSACTION_INPUT_PIPE"
        exec 8>&-
        plan_wait_transaction_lines() {
          local expected_lines=$1 expected_output=$2 attempt line_count
          attempt=0
          while test "$attempt" -lt 5; do
            line_count="$(wc -l < "$REF_TRANSACTION_RESPONSE_FILE" | tr -d '[:space:]')" || return 1
            if test "$line_count" = "$expected_lines"; then
              REF_TRANSACTION_OUTPUT="$(cat "$REF_TRANSACTION_RESPONSE_FILE")" || return 1
              test "$REF_TRANSACTION_OUTPUT" = "$expected_output" && return 0
              return 1
            fi
            kill -0 "$REF_TRANSACTION_PID" 2>/dev/null || return 1
            /bin/sleep 0.05
            attempt=$((attempt + 1))
          done
          return 1
        }
        (trap '' PIPE; printf 'start\noption no-deref\nupdate %s %s %s\nprepare\n' "$BRANCH_REF" "$new_oid" "$old_oid" >&3) || { exec 3>&-; plan_reap_transaction_child || return 1; plan_validate_direct_branch_ref "$old_oid" || return 1; return 1; }
        if ! plan_wait_transaction_lines 2 $'start: ok\nprepare: ok' || ! (exec 3>&-; plan_validate_direct_branch_ref "$old_oid"); then
          (trap '' PIPE; printf 'abort\n' >&3) || :
          exec 3>&-
          plan_wait_transaction_lines 3 $'start: ok\nprepare: ok\nabort: ok' || :
          plan_reap_transaction_child || return 1
          (exec 3>&-; plan_validate_direct_branch_ref "$old_oid") || return 1
          return 1
        fi
        (trap '' PIPE; printf 'commit\n' >&3) || { exec 3>&-; plan_reap_transaction_child || return 1; plan_validate_direct_branch_ref "$old_oid" || return 1; return 1; }
        exec 3>&-
        if plan_wait_transaction_lines 3 $'start: ok\nprepare: ok\ncommit: ok'; then
          REF_TRANSACTION_TRANSCRIPT_STATUS=0
        else
          REF_TRANSACTION_TRANSCRIPT_STATUS=$?
        fi
        if plan_reap_transaction_child; then
          REF_TRANSACTION_REAP_STATUS=0
        else
          REF_TRANSACTION_REAP_STATUS=$?
        fi
        if REF_TRANSACTION_FINAL_TRANSCRIPT="$(if cat "$REF_TRANSACTION_RESPONSE_FILE"; then printf '\001'; else exit $?; fi)"; then
          REF_TRANSACTION_FINAL_TRANSCRIPT="${REF_TRANSACTION_FINAL_TRANSCRIPT%$'\001'}"
          REF_TRANSACTION_FINAL_TRANSCRIPT_STATUS=0
        else
          REF_TRANSACTION_FINAL_TRANSCRIPT_STATUS=$?
        fi
        if test "$REF_TRANSACTION_FINAL_TRANSCRIPT_STATUS" = 0 && test "$REF_TRANSACTION_FINAL_TRANSCRIPT" = $'start: ok\nprepare: ok\ncommit: ok\n' && test "$REF_TRANSACTION_WAIT_STATUS" = 0 && test "$REF_TRANSACTION_REAP_STATUS" = 0 && test ! -s "$REF_TRANSACTION_ERROR_FILE"; then
          return 0
        fi
        case "$REF_TRANSACTION_WAIT_STATUS" in *[!0-9]*|'') return 1 ;; esac
        if test "$REF_TRANSACTION_FINAL_TRANSCRIPT_STATUS" = 0 && test "$REF_TRANSACTION_FINAL_TRANSCRIPT" = $'start: ok\nprepare: ok\n' && test "$REF_TRANSACTION_REAP_STATUS" = 0 && test "$REF_TRANSACTION_WAIT_STATUS" -ge 1 && test "$REF_TRANSACTION_WAIT_STATUS" -le 127 && test -s "$REF_TRANSACTION_ERROR_FILE"; then
          plan_validate_direct_branch_ref "$new_oid" && return 0
        fi
        plan_validate_direct_branch_ref "$old_oid" && return 1
        return 1
        )
      }
      plan_rollback_commit_fence() {
        plan_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID" || exit 1
        exit 1
      }
      plan_outer_publication_cleanup() {
        local exit_status=$?
        trap - EXIT HUP INT TERM
        if test "${PLAN_PUBLICATION_SIGNAL_RECEIVED:-0}" = 1; then
          exit_status=1
        fi
        if test "${PLAN_PUBLICATION_SUCCEEDED:-0}" = 1; then
          exit "$exit_status"
        fi
        plan_classify_branch_ref "$COMMIT_OID" "$PARENT_COMMIT"
        case "$BRANCH_REF_CLASS" in
          exact-old) ;;
          exact-new)
            plan_validate_direct_branch_ref "$COMMIT_OID" || exit 1
            if plan_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID"; then
              plan_validate_direct_branch_ref "$PARENT_COMMIT" || exit 1
            else
              exit 1
            fi
            ;;
          competing-direct|symbolic|missing|unreadable) ;;
          *) exit 1 ;;
        esac
        exit "$exit_status"
      }
      plan_outer_publication_signal() {
        trap - HUP INT TERM
        PLAN_PUBLICATION_SIGNAL_RECEIVED=1
        plan_outer_publication_cleanup
      }
      plan_verify_committed_state() {
        CURRENT_BRANCH="$(git branch --show-current)" || return 1
        test "$CURRENT_BRANCH" = "$BRANCH_BEFORE_COMMIT" || return 1
        CURRENT_HEAD_REF="$(git symbolic-ref --quiet HEAD)" || return 1
        test "$CURRENT_HEAD_REF" = "$BRANCH_REF" || return 1
        HEAD_AFTER_UPDATE="$(git rev-parse --verify HEAD^{commit})" || return 1
        test "$HEAD_AFTER_UPDATE" = "$COMMIT_OID" || return 1
        COMMITTED_PARENT="$(git rev-parse --verify "$COMMIT_OID^")" || return 1
        test "$COMMITTED_PARENT" = "$PARENT_COMMIT" || return 1
        COMMITTED_TREE="$(git rev-parse --verify "$COMMIT_OID^{tree}")" || return 1
        test "$COMMITTED_TREE" = "$STAGED_TREE" || return 1
        COMMITTED_DOCUMENT_ENTRY="$(git ls-tree "$COMMIT_OID" -- "$DOCUMENT_PATH")" || return 1
        test "$COMMITTED_DOCUMENT_ENTRY" = "100644 blob $STAGED_DOCUMENT_BLOB"$'\t'"$DOCUMENT_PATH" || return 1
        plan_validate_expected_operand_kinds || return 1
        plan_validate_document_identity || return 1
        COMMITTED_PATH_OUTPUT="$(git diff-tree --no-commit-id --name-only -r --no-renames "$COMMIT_OID")" || return 1
        COMMITTED_PATH_SET="$(plan_sort_path_output "$COMMITTED_PATH_OUTPUT")" || return 1
        test "$COMMITTED_PATH_SET" = "$expected_path_set" || return 1
        POST_INDEX_PATHS="$(git diff --cached --name-only --no-renames)" || return 1
        test -z "$POST_INDEX_PATHS" || return 1
        POST_WORKTREE_DIFF_OUTPUT="$(git diff --name-only --no-renames)" || return 1
        test -z "$POST_WORKTREE_DIFF_OUTPUT" || return 1
        POST_UNTRACKED_PATHS="$(git ls-files --others --exclude-standard)" || return 1
        test -z "$POST_UNTRACKED_PATHS" || return 1
        POST_STATUS_OUTPUT="$(git status --porcelain)" || return 1
        test -z "$POST_STATUS_OUTPUT" || return 1
      }
      plan_validate_replace_refs || exit 1
      INITIAL_INDEX_PATHS="$(git diff --cached --name-only --no-renames)" || exit 1
      test -z "$INITIAL_INDEX_PATHS" || exit 1
      git diff --cached --quiet || exit 1
      BRANCH_BEFORE_COMMIT="$(git branch --show-current)" || exit 1
      test "$BRANCH_BEFORE_COMMIT" = "$EXPECTED_BRANCH" || exit 1
      HEAD_REF="$(git symbolic-ref --quiet HEAD)" || exit 1
      test "$HEAD_REF" = "$BRANCH_REF" || exit 1
      PARENT_COMMIT="$(git rev-parse --verify HEAD^{commit})" || exit 1
      for expected_path in "${!EXPECTED_IMPL_PLAN_PATHS[@]}"; do
        plan_update_exact_index_operand "${EXPECTED_IMPL_PLAN_PATHS[$expected_path]}" "${EXPECTED_IMPL_PLAN_OPERAND_KINDS[$expected_path]}" || exit 1
      done
      plan_validate_staged_state || exit 1
      STAGED_TREE="$(git write-tree)" || exit 1
      plan_validate_pre_ref_update || exit 1
      CREATED_COMMIT_OID="$(git commit-tree "$STAGED_TREE" -p "$PARENT_COMMIT" \
        -m "Task #{issue번호}: 승인된 구현 계획서 확정" \
        -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
        -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>")" || exit 1
      COMMIT_OID="$(git rev-parse --verify "$CREATED_COMMIT_OID^{commit}")" || exit 1
      plan_validate_pre_ref_update || exit 1
      PLAN_PUBLICATION_SUCCEEDED=0
      PLAN_PUBLICATION_SIGNAL_RECEIVED=0
      trap plan_outer_publication_cleanup EXIT
      trap plan_outer_publication_signal HUP INT TERM
      if plan_update_branch_ref_transaction "$COMMIT_OID" "$PARENT_COMMIT"; then
        REF_TRANSACTION_STATUS=0
      else
        REF_TRANSACTION_STATUS=$?
      fi
      if test "$REF_TRANSACTION_STATUS" != 0; then
        exit 1
      fi
      plan_verify_committed_state || plan_rollback_commit_fence
      PLAN_PUBLICATION_SUCCEEDED=1
      trap - EXIT HUP INT TERM
      printf '%s\n' "$COMMIT_OID"
    }
    implementation_plan_commit_fence
    ```
    - `IMPLEMENTATION_PLAN_PATH`만 하나의 승인 계획서 경로로 설정한다. fence는 이 입력에서 하나의 기대 경로 배열을 새로 만들며 caller-provided expected array는 사용하지 않는다. 경로는 repository-relative이고 `/`로 시작하지 않으며, `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`, `/`만 사용하고 빈 값, control character, pathspec magic, `//`, `.` 또는 `..` segment를 포함하지 않아야 한다. operand는 existing regular/symlink file 또는 exact stage-0 tracked-file deletion 하나여야 하며, directory, FIFO/socket 등 existing special node, recursive prefix, zero/multiple tracked entry는 index operation 전에 거절한다. fence는 `GIT_LITERAL_PATHSPECS=1`로 이 literal file/deletion subset만 Git path operation에 전달한다.
    - fence는 시작 index가 비어 있지 않거나, stage 뒤 경로 집합이 하나의 승인 계획서와 다르거나, staged whitespace 오류, staged 이외의 tracked/untracked 변경이 남으면 commit 전에 실패한다. 시작 index가 clean이므로 exact `git update-index --add` 또는 `--force-remove` 뒤 ref 전 검증이 실패하면 index에는 승인 계획서 경로만 남아 inspection할 수 있으며, fence는 이를 지우거나 reset하지 않는다.
    - 계획서는 regular/non-symlink/single-link working-tree mode `0644`, stage-0 mode `100644`이고 staged blob이 working-tree hash와 같아야 한다. 삭제, symlink, executable, hardlink 계획서는 commit 전에 거절한다.
    - fence는 승인 계획서만 exact `git update-index --add` 또는 `--force-remove`로 stage한 verified index tree에서 `git commit-tree`로 commit object를 만든다. 정상 forward와 postcondition rollback은 모두 직전 direct-ref precheck 뒤 `start`, `option no-deref`, exact old OID를 포함한 `update`, `prepare`, `commit`을 stdin으로 전달하는 checked `git update-ref --stdin` transaction으로만 수행한다. `prepare`가 ref lock을 만든 뒤 direct ref/OID를 다시 확인하고, 일치할 때만 `commit`, symref 또는 drift면 `abort`한다. transaction response/error/status를 모두 검사한다. transaction status를 이어서 검사할 때는 bare invocation 뒤 `$?`를 읽지 않고 `if plan_update_branch_ref_transaction ...; then ...; else ...; fi`로 capture하여 caller의 `set -e` 또는 `set -euo pipefail` option을 바꾸지 않는다. plan/stage/archive transaction의 terminal reconciliation은 동일하다: exact `start: ok`, `prepare: ok`, `commit: ok` transcript, wait status `0`, empty stderr, clean reaping/owned cleanup만 정상 성공이다. response-loss reconciliation은 terminal transcript가 exact `start: ok\nprepare: ok\n` prefix이고 final `commit: ok` response만 missing이며, wait status `1..127`, nonempty stderr, clean lifecycle, direct exact-new ref가 모두 성립할 때만 성공한다. empty, truncated, malformed, extra transcript, wait `0` transcript mismatch, `128` 이상 status는 거절한다. TERM grace polling은 최대 두 번, KILL polling은 최대 한 번으로 총 planned sleep budget을 `150ms` 이하로 유지하고, leader PID에는 정확히 한 번만 `wait`한 뒤 wait status를 capture하고 PID/PGID를 즉시 비운다. wait 뒤에는 PGID를 probe, signal, reuse하지 않는다. forward publication 전 explicit success state와 outer EXIT/HUP/INT/TERM trap을 설치하며 signal handler는 one-shot nonzero exit만 수행한다. outer EXIT cleanup은 success 전에는 live ref를 exact-new, exact-old, competing-direct, symbolic, missing, unreadable로 다시 분류하고, exact-old는 no-op, exact-new만 direct commit 확인 뒤 checked `plan_update_branch_ref_transaction PARENT COMMIT`와 direct parent validation으로 rollback하며 다른 state는 mutation 없이 보존하고 실패한다. trap은 `plan_verify_committed_state`까지 유지하고 success state를 설정한 뒤 OID 출력 전에만 해제한다. transport transaction이 nonzero로 끝났는데 branch가 exact new OID이면 같은 Bash 3.2-compatible checked transaction으로 exact new-to-parent CAS rollback만 시도하고 실패한다. write-tree 뒤 drift는 ref 전 재검증으로 branch 전진 전에 실패하며, ref 전진 뒤 postcondition이 실패하면 exact commit OID를 expected-old 값으로 하는 transaction CAS rollback만 시도한다. rollback CAS conflict 또는 symref drift는 competing ref를 그대로 보존하고 실패한다.
    - 출력된 exact commit SHA를 작업지시자에게 보고하고 같은 스레드에서 SHA 확인을 받은 뒤 Stage 1에 진입한다. 이후 검증에서 commit message 검색으로 승인 commit을 다시 추론하지 않는다.
   - 구현계획서 내용 승인과 exact SHA 확인은 승인본 커밋과 Stage 1 진입만 허용한다. 이후 단계 진입, 최종 게시, merge 승인을 대신하지 않는다.
   - Stage 1 이후 계획서를 변경해야 하면 현재 단계를 멈추고 변경본 내용을 다시 승인받아 `_impl.md`만 새 독립 commit으로 기록한다. 새 exact SHA까지 확인받은 뒤 이후 단계에서 그 SHA와 현재 plan blob의 일치를 검증한다.
5. 단계별 진행 시작
   - 각 Stage와 최종 통합 검증 명령을 실행하기 전에 작업지시자가 확인한 최신 구현계획서 exact SHA를 입력으로 사용한다.
   - 승인 commit이 `_impl.md` 하나만 변경하고 현재 HEAD의 ancestor인지 확인한다.
   - 승인 commit, HEAD, index의 `_impl.md` mode가 모두 `100644`인지, working tree의 `_impl.md`가 symlink가 아닌지 확인한다.
   - 승인 commit의 plan blob이 HEAD, index, 실제 working-tree file hash 모두와 동일한지 확인한다. 하나라도 실패하면 계획서의 검증 명령을 실행하지 않는다.
6. 각 단계 완료 후 단계별 완료보고서 작성 → 승인 요청
7. **단계별 완료보고서(`_stage{N}.md`)는 해당 단계 소스 커밋과 함께 타스크 브랜치에서 커밋한다.**
8. 승인 후 다음 단계 진행
9. 마지막 단계 보고서 commit과 작업지시자 승인이 완료된 뒤 최종 결과보고서 작성·검증과 오늘할일 갱신을 수행한다. 마지막 Stage와 최종 보고서를 한 commit으로 합치지 않는다.
10. **최종 결과보고서(`_report.md`)와 오늘할일(`orders/`) 갱신이 regular/non-symlink/single-link working-tree mode `0644`, stage/commit mode `100644`인지 확인하고 hook-suppressed commit boundary의 tree/blob을 결박한 뒤 타스크 브랜치에서 커밋한다.**
11. 커밋 직후 즉시 멈추고, 같은 스레드에서 커밋된 최종 보고서와 수용 기준 검증 근거 승인 요청. 이전 단계 승인이나 task-final-report 호출 지시는 이 승인으로 대체되지 않는다.
12. 첫 번째 final report/evidence 승인을 받은 뒤에만 `task-final-report`가 private publication input을 만들고 두 번째 publication approval tuple을 출력한다. 첫 승인은 input 준비만 허용한다. 두 번째 tuple은 `action=push-exact-oid-and-create-or-resume-open-pr`, canonical `host=github.com`, owner/repository `jinzer0/GPUWatch`, canonical repository database ID `repository_id=1256824919`, approved issue number와 approved plan OID, exact remote `refs/heads/devel` OID와 approved final OID를 결박한다. 또한 첫 승인에서 검증한 exact artifact paths인 `final_report_path`, `orders_path`, 원문 `ACCEPTANCE_EVIDENCE`의 source/path와 report/orders blob OID, acceptance evidence SHA-256을 다시 결박한다. path 없이 hash만 같은 artifact는 허용하지 않는다. tuple은 private title/body SHA-256, base `devel`, head `publish/task{issue번호}`, 그리고 existing PR이면 exact PR number, node ID, state를 함께 결박한다. canonical repository identity와 first-approval artifact paths는 hash만으로 대체할 수 없다. 허용 state는 `branch-absent-pr-absent`, `branch-exact-pr-absent`, `branch-exact-pr-draft`, `branch-exact-pr-ready`다.
13. 두 번째 publication 승인을 받은 뒤에만 `task-final-report`가 approved final OID를 게시한다. no-PR 승인은 생성 직전 all-state absence를 다시 확인하고 draft PR을 만든 뒤 반환 number/node ID의 exact draft를 검증한다. 이어 그 PR만 ready로 전환하고 exact non-draft REST GET과 모든 page 및 GraphQL error를 검증하는 read-only GraphQL `closingIssuesReferences`를 실행한다. ready 승인은 mutation 없는 verification-only 경로다. concurrent PR, duplicate, state drift, create/ready interruption 또는 잘못된 응답/GET은 fresh preparation과 replacement publication 승인을 요구한다. 일반 내부 task에서 직접 `git push` 또는 `gh pr create`를 실행하지 않는다.
14. 승인 요청 시 작업지시자가 피드백 문서를 `mydocs/feedback/`에 등록
15. 모든 테스트 통과 시 피드백 없음
16. PR merge 확인 후 `pr-merge-cleanup`으로 read-only preflight를 실행한다. 이슈가 `OPEN`이면 host, repository, repository ID, PR 번호, 이슈 번호, atomically fetched issue `state`, exact server `updated_at`, merged head OID, base/head refs, action `close-issue:completed` exact tuple을 같은 스레드에서 승인받은 뒤 cleanup 실행 fence에 해당 scalar 값을 입력한다. cleanup은 삭제 직전과 close 직전에 PR/이슈 tuple과 issue `state`/`updated_at`를 다시 읽고, 각 경계에서 `OPEN`이면 exact `updated_at`까지 같은 tuple 승인이 있어야만 계속한다. merge 완료된 `publish/task{issue번호}` 원격 브랜치와 재생성 가능한 로컬 부산물을 정리한 다음 마지막에 `gh issue close {번호} --reason completed`를 실행해 `CLOSED`를 확인한다. 이미 `CLOSED`인 이슈는 승인 없이 검증된 no-op으로 처리한다.

## 작업 규칙

- 작업 시간의 시작과 종료는 작업지시자가 결정한다. 에이전트가 임의로 작업 종료를 제안하거나 시간을 한정하지 않는다.

## 승인 간주 조건

- 작업지시자가 같은 스레드에서 "계속 진행", "다음 단계 진행"처럼 명시 지시한 경우 응답 직전에 이름 붙여 요청한 단일 gate만 승인한 것으로 간주한다. 이후 stage, final report/evidence, publication, merge, 현재 `OPEN` 이슈 close 승인을 대신하지 않는다.

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

`task-final-report`는 최종 보고서뿐 아니라 위 PR 본문 검증 구조까지 맞춰 Open PR을 게시하는 유일한 일반 내부 task publication 절차다. release-specific 예외는 release 문서에서 승인된 경우에만 별도로 따른다.

최종 보고서와 오늘할일 커밋 뒤에는 반드시 멈춘다. 작업지시자가 같은 스레드에서 최종 보고서와 수용 기준 검증 근거를 승인한 뒤에도 바로 원격 push나 PR 생성을 하지 않는다. 그 승인은 publication input 작성까지만 허용하며, 원격 mutation은 별도 publication tuple 승인 뒤에만 가능하다.

설치·업데이트 lifecycle 판단 자체는 별도 하이퍼-워터폴 절차 호출 표시 대상이 아니다. 다만 그 결과로 GitHub Issue를 등록하거나 타스크를 시작하면 `task-register`, `task-start` 등 실제로 적용하는 core Skill의 호출 표시 원칙을 따른다.

GPUWatch app release, hotfix, README 보정처럼 `main`에만 변경이 생기면 별도 승인된 동기화 단계에서 `main` -> `devel` 반영을 수행한다. 이 동기화도 review/approval gate를 보존한다.

## 관련 매뉴얼

- [`document_structure_guide.md`](document_structure_guide.md): 수행계획서, 단계 보고서, 최종 보고서 위치, 파일명, 중앙 템플릿 정책.
- [`git_workflow_guide.md`](git_workflow_guide.md): `local/taskN`, `publish/taskN`, `devel` 브랜치 운용과 PR 게시.
- [`framework_lifecycle_guide.md`](framework_lifecycle_guide.md): 신규 적용, 기존 업데이트, 업데이트 PR 전환 기준.
- [`release_update_protocol.md`](release_update_protocol.md): release/tag와 update protocol.
- [`agent_code_hyperfall_rule_conflict.md`](agent_code_hyperfall_rule_conflict.md): 하이퍼-워터폴 규칙과 에이전트 기본 동작이 충돌하는 지점.
