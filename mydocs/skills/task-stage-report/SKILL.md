---
name: task-stage-report
description: |
  하이퍼-워터폴 타스크의 단계 종료 절차를 적용한다.
  단계별 보고서(`_stage{N}.md`) 작성, 명시 허가 시 단계 소스와 보고서 묶음 커밋,
  단계 검증 명령 실행을 수행한다. 한 단계가 끝나고 다음 단계 진입 직전에 호출.
---

# 하이퍼-워터폴 단계 종료 보고

## 트리거

- 작업지시자가 "Stage {N} 마무리", "단계 보고서 작성"을 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 구현 계획서 또는 작은 작업의 기존 이슈/맥락 기록에 요청 범위, 단계와 검증 방법이 존재
- 아래 committed context 절차를 명시 요청한 경우에만 구현계획서가 `local/task{N}`에 독립 커밋되어 exact SHA가 기록되고 Stage 1 시작 시 미커밋 계획 변경이 없어야 함
- 현재 단계의 완료/미완료 항목과 검증 결과를 기록할 수 있음 (실패도 보고 대상)
- 작업 브랜치는 `local/task{N}`

## 절차

위험 분류와 승인 범위는 [공유 위험 정책](../../manual/agent_code_hyperfall_rule_conflict.md)을 따른다. LOW는 즉시, 명확히 요청된 MEDIUM 범위는 계획·구현·검증·보고·다음 단계까지 자동 진행한다. HIGH는 해당 위험 결정만 승인받고 정확한 결정, 대상, 범위와 승인 근거를 기록한다. 독립적인 안전 작업은 계속하며 일반 단계 확인을 기다리지 않는다. 커밋 등 도구 권한은 별개로 유지한다.

1. 계획/맥락 무결성 확인 후 단계별 검증 명령 실행
   - 일반 보고에서는 요청 범위와 계획/기존 맥락, 실제 변경과 단계의 일치를 확인하고 해당 검증을 실행한다. 안전한 구현·검증·보고를 위해 계획서 커밋을 요구하지 않는다.
   - committed context 기반 절차를 명시 요청한 경우에만 아래 블록을 실행한다. 최신 구현계획서 commit의 exact SHA를 직접 검증해 `APPROVED_IMPL_PLAN_COMMIT_FILE`에 파일 쓰기 도구로 기록한다. commit message 검색으로 SHA를 추론하지 않는다.
   - 이 블록의 `APPROVED_*` 입력과 승인 표현은 고정된 실행 맥락의 무결성 근거이며 Human approval을 뜻하지 않는다. 아래 주석의 같은 스레드 확인도 실행 맥락 확인으로 해석한다. HIGH 결정의 인간 승인은 별도 정확한 결정 기록으로 확인하며 SHA만으로 대체하지 않는다. identity/path/ref/index/blob 및 선행 관계 검사는 그대로 유지한다.
   - committed context를 사용하는 경우 commit의 내용, 현재 계획서 blob, 현재 단계와의 선행 관계를 먼저 확인한다.
      ```bash
       IMPL_PLAN="mydocs/plans/task_{milestone_slug}_{N}_impl.md"
       GIT_CONFIG_COUNT=1
       GIT_CONFIG_KEY_0=core.hooksPath
       GIT_CONFIG_VALUE_0=/dev/null
       export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
       export GIT_NO_REPLACE_OBJECTS=1
       REPLACE_REFS="$(git for-each-ref --format='%(refname)' refs/replace/)" || exit 1
       test -z "$REPLACE_REFS" || exit 1
      APPROVED_IMPL_PLAN_COMMIT_FILE="$(mktemp)"
      trap 'rm -f "$APPROVED_IMPL_PLAN_COMMIT_FILE"' EXIT
      # 파일 쓰기 도구로 작업지시자가 같은 스레드에서 확인한 exact commit SHA를 기록한다.
      IFS= read -r APPROVED_IMPL_PLAN_COMMIT < "$APPROVED_IMPL_PLAN_COMMIT_FILE"
      case "$APPROVED_IMPL_PLAN_COMMIT" in
        ""|*[!0-9a-f]*) printf 'APPROVED_IMPL_PLAN_COMMIT must be lowercase hexadecimal\n' >&2; exit 1 ;;
      esac
      test "${#APPROVED_IMPL_PLAN_COMMIT}" -eq 40 || exit 1
      readonly APPROVED_IMPL_PLAN_COMMIT
      git cat-file -e "$APPROVED_IMPL_PLAN_COMMIT^{commit}" || exit 1
       APPROVED_IMPL_PLAN_PATHS="$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" || exit 1
       APPROVED_IMPL_PLAN_PATH_COUNT=0
       while IFS= read -r APPROVED_IMPL_PLAN_PATH; do
         test -n "$APPROVED_IMPL_PLAN_PATH" || continue
         APPROVED_IMPL_PLAN_PATH_COUNT=$((APPROVED_IMPL_PLAN_PATH_COUNT + 1))
         test "$APPROVED_IMPL_PLAN_PATH" = "$IMPL_PLAN" || exit 1
       done <<< "$APPROVED_IMPL_PLAN_PATHS"
       test "$APPROVED_IMPL_PLAN_PATH_COUNT" = 1 || exit 1
       test ! -L "$IMPL_PLAN" || exit 1
       APPROVED_IMPL_PLAN_TREE_ENTRY="$(git ls-tree "$APPROVED_IMPL_PLAN_COMMIT" -- "$IMPL_PLAN")" || exit 1
       case "$APPROVED_IMPL_PLAN_TREE_ENTRY" in "100644 blob "*$'\t'"$IMPL_PLAN") ;; *) exit 1 ;; esac
       HEAD_IMPL_PLAN_TREE_ENTRY="$(git ls-tree HEAD -- "$IMPL_PLAN")" || exit 1
       case "$HEAD_IMPL_PLAN_TREE_ENTRY" in "100644 blob "*$'\t'"$IMPL_PLAN") ;; *) exit 1 ;; esac
       INDEX_IMPL_PLAN_ENTRY="$(git ls-files -s -- "$IMPL_PLAN")" || exit 1
       case "$INDEX_IMPL_PLAN_ENTRY" in "100644 "*" 0"$'\t'"$IMPL_PLAN") ;; *) exit 1 ;; esac
       APPROVED_IMPL_PLAN_BLOB="$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" || exit 1
       HEAD_IMPL_PLAN_BLOB="$(git rev-parse "HEAD:$IMPL_PLAN")" || exit 1
       test "$APPROVED_IMPL_PLAN_BLOB" = "$HEAD_IMPL_PLAN_BLOB" || exit 1
       INDEX_IMPL_PLAN_BLOB="$(git rev-parse ":$IMPL_PLAN")" || exit 1
       test "$APPROVED_IMPL_PLAN_BLOB" = "$INDEX_IMPL_PLAN_BLOB" || exit 1
       WORKTREE_IMPL_PLAN_BLOB="$(git hash-object -- "$IMPL_PLAN")" || exit 1
       test "$APPROVED_IMPL_PLAN_BLOB" = "$WORKTREE_IMPL_PLAN_BLOB" || exit 1
       if test "{S}" = "1"; then
         HEAD_COMMIT="$(git rev-parse HEAD)" || exit 1
         test "$HEAD_COMMIT" = "$APPROVED_IMPL_PLAN_COMMIT" || exit 1
      else
        git merge-base --is-ancestor "$APPROVED_IMPL_PLAN_COMMIT" HEAD || exit 1
      fi
      ```
   - 해당 경로의 무결성 확인이 통과한 뒤 계획/맥락의 해당 단계 검증 명령을 실행한다. 무결성 실패 시 그 맥락의 명령 실행은 중단하지만 실패 보고는 작성한다.
   - 결과를 보고서에 인용할 수 있도록 출력 보존. 실패/실행 불가도 명령, 출력 또는 불가 사유, 미완료 항목과 영향을 기록한다.
2. 단계 보고서 작성: `mydocs/working/task_{milestone_slug}_{N}_stage{S}.md`
   - 작은 작업의 일반 보고는 기존 이슈/맥락 기록에 아래 필수 내용을 남길 수 있다. 명시 요청된 단계 묶음 커밋에는 지정 보고서 파일이 필요하다.
   - 중앙 템플릿 `mydocs/_templates/stage_report.md`를 기준으로 작성한다.
   - 템플릿을 읽을 수 없는 경우에만 다음 최소 섹션을 fallback으로 사용한다:
     - 단계 목적
     - 산출물 (파일 목록 + 라인 수 또는 요약)
     - 본문 변경 정도 / 본문 무손실 여부 (해당 시)
     - 검증 결과 (위 1번 출력 인용)
     - 잔여 위험
     - 다음 단계 영향
     - 위험 결정 기록 (HIGH만 정확한 승인 결정과 근거, 없으면 해당 없음)
3. 변경 점검
    ```bash
    GIT_CONFIG_COUNT=1
    GIT_CONFIG_KEY_0=core.hooksPath
    GIT_CONFIG_VALUE_0=/dev/null
    export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
    export GIT_NO_REPLACE_OBJECTS=1
    git status --short
   git diff --check
   ```
4. 명시적으로 요청·허가된 경우에만 단계 소스 + 보고서 묶음 커밋
   - 실패 보고는 작성하되 완료로 표시하지 않는다. 실패한 단계의 완료 커밋으로 아래 블록을 실행하지 않는다. 커밋하지 않는 보고와 독립적인 안전 작업은 계속한다.
   - 아래 fence 설명의 승인 경로는 명시 허가된 커밋의 요청 범위에서 고정한 exact 경로 allowlist다. 단계 산출물에 대한 별도 Human approval 대기를 의미하지 않는다.
    ```bash
    EXPECTED_BRANCH="local/task{N}"
    STAGE_OUTPUT_PATHS=(
      "{단계 산출 파일 1}"
      "{단계 산출 파일 2}"
    )
    STAGE_REPORT_PATH="mydocs/working/task_{milestone_slug}_{N}_stage{S}.md"
    stage_commit_fence() {
      local expected_path stage_output expected_path_output expected_path_set actual_path_output actual_path_set VALIDATED_OPERAND_KIND
      local DOCUMENT_PATH DOCUMENT_METADATA STAGED_DOCUMENT_ENTRY STAGED_DOCUMENT_MODE STAGED_DOCUMENT_REMAINDER STAGED_DOCUMENT_BLOB STAGED_DOCUMENT_TAIL WORKTREE_DOCUMENT_BLOB
      local REPLACE_REFS INITIAL_INDEX_PATHS STAGED_DIFF_CHECK_OUTPUT WORKTREE_DIFF_OUTPUT UNTRACKED_PATHS
      local BRANCH_REF BRANCH_BEFORE_COMMIT HEAD_REF PARENT_COMMIT STAGED_TREE CURRENT_BRANCH CURRENT_HEAD_REF CURRENT_PARENT CURRENT_STAGED_TREE
      local BRANCH_SYMBOLIC_TARGET SYMBOLIC_REF_STATUS DIRECT_REF_RECORD
       local REF_TRANSACTION_INPUT_PIPE REF_TRANSACTION_RESPONSE_FILE REF_TRANSACTION_ERROR_FILE REF_TRANSACTION_DIR REF_TRANSACTION_PID REF_TRANSACTION_PGID REF_TRANSACTION_PARENT_PGID REF_TRANSACTION_GIT REF_TRANSACTION_DIR_IDENTITY REF_TRANSACTION_DIR_UID REF_TRANSACTION_INPUT_IDENTITY REF_TRANSACTION_RESPONSE_IDENTITY REF_TRANSACTION_ERROR_IDENTITY REF_TRANSACTION_CLEANUP_DIR REF_TRANSACTION_OUTPUT REF_TRANSACTION_FINAL_TRANSCRIPT
       local REF_TRANSACTION_WAIT_STATUS REF_TRANSACTION_TRANSCRIPT_STATUS REF_TRANSACTION_REAP_STATUS REF_TRANSACTION_GROUP_LIVE REF_TRANSACTION_LEADER_REAPABLE
       local CREATED_COMMIT_OID COMMIT_OID HEAD_AFTER_UPDATE COMMITTED_PARENT COMMITTED_TREE COMMITTED_DOCUMENT_ENTRY COMMITTED_PATH_OUTPUT COMMITTED_PATH_SET TRANSACTION_STATUS STAGE_REF_CLASS STAGE_PUBLICATION_SUCCEEDED STAGE_PUBLICATION_ROLLBACK_COMPLETED
      local POST_INDEX_PATHS POST_WORKTREE_DIFF_OUTPUT POST_UNTRACKED_PATHS POST_STATUS_OUTPUT
      test -n "${EXPECTED_BRANCH:-}" || exit 1
      test -n "${STAGE_REPORT_PATH:-}" || exit 1
      for stage_output in "${STAGE_OUTPUT_PATHS[@]}"; do
        test "$stage_output" != "$STAGE_REPORT_PATH" || exit 1
      done
      EXPECTED_STAGE_PATHS=("${STAGE_OUTPUT_PATHS[@]}" "$STAGE_REPORT_PATH")
      EXPECTED_STAGE_OPERAND_KINDS=()
      test "${#EXPECTED_STAGE_PATHS[@]}" -gt 0 || exit 1
      DOCUMENT_PATH="$STAGE_REPORT_PATH"
      BRANCH_REF="refs/heads/$EXPECTED_BRANCH"
      GIT_CONFIG_COUNT=1
      GIT_CONFIG_KEY_0=core.hooksPath
      GIT_CONFIG_VALUE_0=/dev/null
      export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
       export GIT_NO_REPLACE_OBJECTS=1
       export GIT_LITERAL_PATHSPECS=1
      stage_validate_literal_path() {
        case "$1" in
          ""|/*|*//*) return 1 ;;
          *[!A-Za-z0-9._/-]*) return 1 ;;
        esac
        case "/$1/" in
          */./*|*/../*) return 1 ;;
        esac
        return 0
      }
      stage_validate_file_operand() {
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
      for expected_path in "${EXPECTED_STAGE_PATHS[@]}"; do
        stage_validate_literal_path "$expected_path" || exit 1
        stage_validate_file_operand "$expected_path" || exit 1
        EXPECTED_STAGE_OPERAND_KINDS+=("$VALIDATED_OPERAND_KIND")
        if test -n "$expected_path_output"; then
          expected_path_output="$expected_path_output"$'\n'
        fi
        expected_path_output="$expected_path_output$expected_path"
      done
      stage_update_exact_index_operand() {
        local operand=$1 expected_kind=$2
        stage_validate_file_operand "$operand" || return 1
        test "$VALIDATED_OPERAND_KIND" = "$expected_kind" || return 1
        if test "$expected_kind" = present; then
          git update-index --add -- "$operand" || return 1
          return 0
        fi
        test ! -e "$operand" && test ! -L "$operand" || return 1
        git update-index --force-remove -- "$operand" || return 1
      }
      stage_validate_expected_operand_kinds() {
        local operand_index operand expected_kind
        for ((operand_index=0; operand_index<${#EXPECTED_STAGE_PATHS[@]}; operand_index++)); do
          operand="${EXPECTED_STAGE_PATHS[$operand_index]}"
          expected_kind="${EXPECTED_STAGE_OPERAND_KINDS[$operand_index]}"
          if test "$expected_kind" = deletion; then
            test ! -e "$operand" && test ! -L "$operand" || return 1
          else
            stage_validate_file_operand "$operand" || return 1
            test "$VALIDATED_OPERAND_KIND" = present || return 1
          fi
        done
      }
      stage_sort_path_output() {
        LC_ALL=C sort <<< "$1"
      }
      expected_path_set="$(stage_sort_path_output "$expected_path_output")" || exit 1
      test -n "$expected_path_set" || exit 1
      stage_validate_replace_refs() {
        REPLACE_REFS="$(git for-each-ref --format='%(refname)' refs/replace/)" || return 1
        test -z "$REPLACE_REFS" || return 1
      }
      stage_validate_document_identity() {
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
      stage_validate_staged_state() {
        stage_validate_expected_operand_kinds || return 1
        STAGED_DIFF_CHECK_OUTPUT="$(git diff --cached --check)" || return 1
        test -z "$STAGED_DIFF_CHECK_OUTPUT" || return 1
        actual_path_output="$(git diff --cached --name-only --no-renames)" || return 1
        actual_path_set="$(stage_sort_path_output "$actual_path_output")" || return 1
        test "$actual_path_set" = "$expected_path_set" || return 1
        WORKTREE_DIFF_OUTPUT="$(git diff --name-only --no-renames)" || return 1
        test -z "$WORKTREE_DIFF_OUTPUT" || return 1
        UNTRACKED_PATHS="$(git ls-files --others --exclude-standard)" || return 1
        test -z "$UNTRACKED_PATHS" || return 1
        stage_validate_document_identity || return 1
      }
      stage_validate_pre_ref_update() {
        stage_validate_replace_refs || return 1
        CURRENT_BRANCH="$(git branch --show-current)" || return 1
        test "$CURRENT_BRANCH" = "$BRANCH_BEFORE_COMMIT" || return 1
        CURRENT_HEAD_REF="$(git symbolic-ref --quiet HEAD)" || return 1
        test "$CURRENT_HEAD_REF" = "$BRANCH_REF" || return 1
        CURRENT_PARENT="$(git rev-parse --verify HEAD^{commit})" || return 1
        test "$CURRENT_PARENT" = "$PARENT_COMMIT" || return 1
        stage_validate_staged_state || return 1
        CURRENT_STAGED_TREE="$(git write-tree)" || return 1
        test "$CURRENT_STAGED_TREE" = "$STAGED_TREE" || return 1
      }
      stage_validate_direct_branch_ref() {
        if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then
          return 1
        else
          SYMBOLIC_REF_STATUS=$?
        fi
        test "$SYMBOLIC_REF_STATUS" = 1 || return 1
        DIRECT_REF_RECORD="$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' "$BRANCH_REF")" || return 1
        test "$DIRECT_REF_RECORD" = "$BRANCH_REF $1 symref=" || return 1
      }
          stage_update_branch_ref_transaction() {
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
          stage_validate_direct_branch_ref "$old_oid" || return 1
          REF_TRANSACTION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpuwatcher-ref-transaction.XXXXXX")" || return 1
          stage_finalize_ref_transaction() {
            local original_status=$1 cleanup_status=0
            if test "${REF_TRANSACTION_FINALIZED:-0}" = 1; then
              return "${REF_TRANSACTION_FINAL_STATUS:-1}"
            fi
            REF_TRANSACTION_FINALIZED=1
            exec 3>&- 2>/dev/null || :
            exec 8>&- 2>/dev/null || :
            if ! type stage_reap_transaction_child >/dev/null 2>&1; then
              rmdir -- "$REF_TRANSACTION_DIR" 2>/dev/null || cleanup_status=1
            elif stage_reap_transaction_child; then
              stage_cleanup_ref_transaction_dir || cleanup_status=1
            else
              cleanup_status=1
            fi
            REF_TRANSACTION_FINAL_STATUS=$original_status
            if test "$original_status" = 0 && test "$cleanup_status" != 0; then
              REF_TRANSACTION_FINAL_STATUS=1
            fi
            return "$REF_TRANSACTION_FINAL_STATUS"
          }
          stage_finish_ref_transaction() {
            local original_status=$?
            trap - EXIT HUP INT TERM
            stage_finalize_ref_transaction "$original_status"
            exit $?
          }
          stage_signal_finish_ref_transaction() {
            trap - HUP INT TERM
            REF_TRANSACTION_SIGNAL_RECEIVED=1
            stage_finalize_ref_transaction 1
            exit 1
          }
          trap stage_finish_ref_transaction EXIT
          trap stage_signal_finish_ref_transaction HUP INT TERM
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
          stage_validate_transaction_child_ids() {
            case "$REF_TRANSACTION_PID" in *[!0-9]*|'') return 1 ;; esac
            case "$REF_TRANSACTION_PGID" in *[!0-9]*|'') return 1 ;; esac
            case "$REF_TRANSACTION_PARENT_PGID" in *[!0-9]*|'') return 1 ;; esac
            test "$REF_TRANSACTION_PGID" = "$REF_TRANSACTION_PID" || return 1
            test "$REF_TRANSACTION_PGID" != "$REF_TRANSACTION_PARENT_PGID" || return 1
          }
          stage_snapshot_transaction_group() {
            local transaction_snapshot transaction_snapshot_status transaction_snapshot_line transaction_snapshot_pid transaction_snapshot_pgid transaction_snapshot_state transaction_snapshot_extra transaction_leader_state transaction_leader_reapable
            REF_TRANSACTION_GROUP_LIVE=0
            stage_validate_transaction_child_ids || return 1
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
          stage_reap_transaction_child() {
            local attempt
            test -n "${REF_TRANSACTION_PID:-}" || return 0
            stage_validate_transaction_child_ids || return 1
            stage_snapshot_transaction_group || return 1
            if test "$REF_TRANSACTION_GROUP_LIVE" = 1; then
              kill -TERM -- "-$REF_TRANSACTION_PGID" 2>/dev/null || :
              attempt=0
              while test "$REF_TRANSACTION_GROUP_LIVE" = 1 && test "$attempt" -lt 2; do
                /bin/sleep 0.05 || return 1
                attempt=$((attempt + 1))
                stage_snapshot_transaction_group || return 1
              done
              if test "$REF_TRANSACTION_GROUP_LIVE" = 1; then
                kill -KILL -- "-$REF_TRANSACTION_PGID" 2>/dev/null || :
                attempt=0
                while test "$REF_TRANSACTION_GROUP_LIVE" = 1 && test "$attempt" -lt 1; do
                  /bin/sleep 0.05 || return 1
                  attempt=$((attempt + 1))
                  stage_snapshot_transaction_group || return 1
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
          stage_restore_claimed_ref_transaction_dir() {
            test -n "${REF_TRANSACTION_CLEANUP_DIR:-}" || return 1
            test ! -e "$REF_TRANSACTION_DIR" && test ! -L "$REF_TRANSACTION_DIR" || return 1
            mv -- "$REF_TRANSACTION_CLEANUP_DIR" "$REF_TRANSACTION_DIR" 2>/dev/null
          }
          stage_validate_claimed_ref_transaction_dir() {
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
          stage_cleanup_ref_transaction_dir() {
            test -n "${REF_TRANSACTION_DIR:-}" || return 0
            REF_TRANSACTION_CLEANUP_DIR="$REF_TRANSACTION_DIR.cleanup.$$.${RANDOM:-0}"
            mv -- "$REF_TRANSACTION_DIR" "$REF_TRANSACTION_CLEANUP_DIR" 2>/dev/null || return 1
            if ! stage_validate_claimed_ref_transaction_dir; then
              stage_restore_claimed_ref_transaction_dir || :
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
          stage_validate_transaction_child_ids || return 1
          exec 3> "$REF_TRANSACTION_INPUT_PIPE"
          exec 8>&-
          stage_wait_transaction_lines() {
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
          (trap '' PIPE; printf 'start\noption no-deref\nupdate %s %s %s\nprepare\n' "$BRANCH_REF" "$new_oid" "$old_oid" >&3) || { exec 3>&-; stage_reap_transaction_child || return 1; stage_validate_direct_branch_ref "$old_oid" || return 1; return 1; }
          if ! stage_wait_transaction_lines 2 $'start: ok\nprepare: ok' || ! (exec 3>&-; stage_validate_direct_branch_ref "$old_oid"); then
            (trap '' PIPE; printf 'abort\n' >&3) || :
            exec 3>&-
            stage_wait_transaction_lines 3 $'start: ok\nprepare: ok\nabort: ok' || :
            stage_reap_transaction_child || return 1
            (exec 3>&-; stage_validate_direct_branch_ref "$old_oid") || return 1
            return 1
          fi
          (trap '' PIPE; printf 'commit\n' >&3) || { exec 3>&-; stage_reap_transaction_child || return 1; stage_validate_direct_branch_ref "$old_oid" || return 1; return 1; }
          exec 3>&-
          if stage_wait_transaction_lines 3 $'start: ok\nprepare: ok\ncommit: ok'; then
            REF_TRANSACTION_TRANSCRIPT_STATUS=0
          else
            REF_TRANSACTION_TRANSCRIPT_STATUS=$?
          fi
          if stage_reap_transaction_child; then
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
            stage_validate_direct_branch_ref "$new_oid" && return 0
          fi
          stage_validate_direct_branch_ref "$old_oid" && return 1
          return 1
          )
        }
       stage_classify_transaction_ref() {
         local ref_record symbolic_status
         if BRANCH_SYMBOLIC_TARGET="$(git symbolic-ref --quiet "$BRANCH_REF")"; then
           STAGE_REF_CLASS=symbolic
           return 0
         else
           symbolic_status=$?
         fi
         if test "$symbolic_status" != 1; then
           STAGE_REF_CLASS=unreadable
           return 0
         fi
         ref_record="$(git for-each-ref --format='%(refname) %(objectname) symref=%(symref)' "$BRANCH_REF")" || { STAGE_REF_CLASS=unreadable; return 0; }
         case "$ref_record" in
           "$BRANCH_REF $COMMIT_OID symref=") STAGE_REF_CLASS=exact-new ;;
           "$BRANCH_REF $PARENT_COMMIT symref=") STAGE_REF_CLASS=exact-old ;;
           '') STAGE_REF_CLASS=missing ;;
           "$BRANCH_REF "*' symref=') STAGE_REF_CLASS=competing-direct ;;
           "$BRANCH_REF "*' symref='*) STAGE_REF_CLASS=symbolic ;;
           *) STAGE_REF_CLASS=unreadable ;;
         esac
       }
       stage_rollback_commit_fence() {
         stage_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID" || exit 1
         exit 1
       }
       stage_rollback_exact_new_ref() {
         stage_validate_direct_branch_ref "$COMMIT_OID" || return 1
         stage_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID" || return 1
         stage_validate_direct_branch_ref "$PARENT_COMMIT"
       }
        stage_finish_publication() {
          local exit_status=$?
          trap - EXIT HUP INT TERM
          if test "${STAGE_PUBLICATION_SIGNAL_RECEIVED:-0}" = 1; then
            exit_status=1
          fi
          test "${STAGE_PUBLICATION_SUCCEEDED:-0}" = 0 || exit "$exit_status"
          test -n "${BRANCH_REF:-}" || exit 1
          test -n "${COMMIT_OID:-}" || exit 1
          test -n "${PARENT_COMMIT:-}" || exit 1
          stage_classify_transaction_ref || exit 1
         case "$STAGE_REF_CLASS" in
           exact-old)
             STAGE_PUBLICATION_ROLLBACK_COMPLETED=1
             ;;
           exact-new)
             stage_validate_direct_branch_ref "$COMMIT_OID" || exit 1
             if stage_update_branch_ref_transaction "$PARENT_COMMIT" "$COMMIT_OID"; then
               STAGE_PUBLICATION_ROLLBACK_COMPLETED=1
             else
               exit 1
             fi
             stage_validate_direct_branch_ref "$PARENT_COMMIT" || exit 1
             ;;
           competing-direct|symbolic|missing|unreadable)
             exit 1
             ;;
           *) exit 1 ;;
         esac
         exit "$exit_status"
       }
       stage_signal_finish_publication() {
         trap - HUP INT TERM
         STAGE_PUBLICATION_SIGNAL_RECEIVED=1
         stage_finish_publication
       }
      stage_verify_committed_state() {
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
        stage_validate_expected_operand_kinds || return 1
        stage_validate_document_identity || return 1
        COMMITTED_PATH_OUTPUT="$(git diff-tree --no-commit-id --name-only -r --no-renames "$COMMIT_OID")" || return 1
        COMMITTED_PATH_SET="$(stage_sort_path_output "$COMMITTED_PATH_OUTPUT")" || return 1
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
      stage_validate_replace_refs || exit 1
      INITIAL_INDEX_PATHS="$(git diff --cached --name-only --no-renames)" || exit 1
      test -z "$INITIAL_INDEX_PATHS" || exit 1
      git diff --cached --quiet || exit 1
      BRANCH_BEFORE_COMMIT="$(git branch --show-current)" || exit 1
      test "$BRANCH_BEFORE_COMMIT" = "$EXPECTED_BRANCH" || exit 1
      HEAD_REF="$(git symbolic-ref --quiet HEAD)" || exit 1
      test "$HEAD_REF" = "$BRANCH_REF" || exit 1
      PARENT_COMMIT="$(git rev-parse --verify HEAD^{commit})" || exit 1
      for expected_path in "${!EXPECTED_STAGE_PATHS[@]}"; do
        stage_update_exact_index_operand "${EXPECTED_STAGE_PATHS[$expected_path]}" "${EXPECTED_STAGE_OPERAND_KINDS[$expected_path]}" || exit 1
      done
      stage_validate_staged_state || exit 1
      STAGED_TREE="$(git write-tree)" || exit 1
      stage_validate_pre_ref_update || exit 1
      CREATED_COMMIT_OID="$(git commit-tree "$STAGED_TREE" -p "$PARENT_COMMIT" \
        -m "Task #{N} Stage {S}: {핵심 내용 요약}" \
        -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
        -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>")" || exit 1
       COMMIT_OID="$(git rev-parse --verify "$CREATED_COMMIT_OID^{commit}")" || exit 1
       stage_validate_pre_ref_update || exit 1
       STAGE_PUBLICATION_SUCCEEDED=0
       STAGE_PUBLICATION_ROLLBACK_COMPLETED=0
       STAGE_PUBLICATION_SIGNAL_RECEIVED=0
       trap stage_finish_publication EXIT
       trap stage_signal_finish_publication HUP INT TERM
       if stage_update_branch_ref_transaction "$COMMIT_OID" "$PARENT_COMMIT"; then
         TRANSACTION_STATUS=0
       else
         TRANSACTION_STATUS=$?
       fi
       if test "$TRANSACTION_STATUS" != 0; then
         stage_classify_transaction_ref
         case "$STAGE_REF_CLASS" in
           exact-new) stage_rollback_exact_new_ref || exit 1 ;;
           exact-old|competing-direct|symbolic|missing|unreadable) ;;
           *) exit 1 ;;
         esac
         exit 1
       fi
       stage_verify_committed_state || stage_rollback_commit_fence
       STAGE_PUBLICATION_SUCCEEDED=1
       trap - EXIT HUP INT TERM
       printf '%s\n' "$COMMIT_OID"
    }
    stage_commit_fence
    ```
    - `STAGE_OUTPUT_PATHS`에는 이번 단계가 승인한 모든 산출 경로를 각각 넣고, 보고서 경로는 중복 없이 `STAGE_REPORT_PATH`에만 넣는다. fence는 두 입력에서 기대 경로 배열을 새로 만들며 caller-provided expected array는 사용하지 않는다. 각 경로는 repository-relative이고 `/`로 시작하지 않으며, `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`, `/`만 사용하고 빈 값, control character, pathspec magic, `//`, `.` 또는 `..` segment를 포함하지 않아야 한다. 각 operand는 existing regular/symlink file 또는 exact stage-0 tracked-file deletion 하나여야 하며, directory, FIFO/socket 등 existing special node, recursive prefix, zero/multiple tracked entry는 index operation 전에 거절한다. fence는 `GIT_LITERAL_PATHSPECS=1`로 이 literal file/deletion subset만 Git path operation에 전달한다.
    - fence는 시작 index가 비어 있지 않거나, stage 뒤 경로 집합이 다르거나, staged whitespace 오류, staged 이외의 tracked/untracked 변경이 남으면 commit 전에 실패한다. 시작 index가 clean이므로 exact `git update-index --add` 또는 `--force-remove` 뒤 ref 전 검증이 실패하면 index에는 승인 경로 집합만 남아 inspection할 수 있으며, fence는 이를 지우거나 reset하지 않는다.
    - 보고서는 regular/non-symlink/single-link working-tree mode `0644`, stage-0 mode `100644`이고 staged blob이 working-tree hash와 같아야 한다. 삭제, symlink, executable, hardlink 보고서는 commit 전에 거절한다.
    - fence는 승인 경로만 exact `git update-index --add` 또는 `--force-remove`로 stage한 verified index tree에서 `git commit-tree`로 commit object를 만든다. forward와 postcondition rollback은 모두 직전 direct-ref precheck 뒤 `start`, `option no-deref`, exact old OID를 포함한 `update`, `prepare`, `commit`을 stdin으로 전달하는 checked `git update-ref --stdin` transaction으로 수행한다. `prepare`가 ref lock을 만든 뒤 direct ref/OID를 다시 확인하고, 일치할 때만 `commit`, symref 또는 drift면 `abort`한다. 정확한 transcript, wait `0`, 빈 stderr, reaping과 cleanup 성공만 정상 성공으로 인정한다. response-loss reconciliation은 terminal transcript가 exact `start: ok\nprepare: ok\n` prefix이고 final `commit: ok` response만 missing이며, wait의 십진수 값이 `1`부터 `127`이고 stderr가 비어 있지 않으며 reaping과 cleanup이 성공하고 새 direct exact-new ref를 다시 확인한 경우에만 성공한다. empty, truncated, malformed, extra transcript는 모두 reject하며, 그 밖의 모든 terminal 결과는 fail closed한다. terminal transport 결과가 nonzero이고 ref가 exact-new이면 caller는 exact new->parent `--no-deref` CAS rollback만 시도하고, exact-old, competing direct ref, symbolic ref, missing, unreadable 상태는 그대로 보존하고 실패한다. write-tree 뒤 drift는 ref 전 재검증으로 branch 전진 전에 실패하며, ref 전진 뒤 postcondition이 실패하면 exact commit OID를 expected-old 값으로 하는 transaction CAS rollback만 시도한다. rollback CAS conflict 또는 symref drift는 competing ref를 그대로 보존하고 실패한다.
    - 하위 단계: `Task #{N} [Stage {S.M}]: 내용`
5. 보고서와 증거를 남긴 뒤 요청 범위 내 다음 단계로 자동 진행
   - HIGH가 있으면 해당 위험 결정만 승인 요청하고 정확한 결정과 근거를 기록한다. 단계 전체나 마지막 Stage 보고서의 통상 확인을 기다리지 않는다.
   - 마지막 Stage 이후 별도 `task-final-report` 절차로 진입한다. 명시 허가된 커밋에서는 마지막 Stage와 최종 보고서를 한 commit으로 합치지 않는다.

## 검증

다음 committed context 및 커밋 검사는 해당 작업을 명시 요청·허가한 경우에만 적용하며 일반 구현·보고·다음 단계의 Human approval 요건이 아니다.

- `git ls-files --error-unmatch mydocs/plans/task_{milestone_slug}_{N}_impl.md` 통과
- `git diff --quiet HEAD -- mydocs/plans/task_{milestone_slug}_{N}_impl.md` 통과
- `git log -1 --format='%H' -- mydocs/plans/task_{milestone_slug}_{N}_impl.md`가 commit SHA를 출력
- 같은 스레드에 실행 맥락 근거로 기록한 exact SHA를 사용하며 commit message 검색으로 대체하지 않음
- 최신 고정 구현계획서 commit의 변경 파일이 해당 `_impl.md` 하나뿐임
- 고정 commit, HEAD, index의 구현계획서 mode가 모두 `100644`이고 working tree가 symlink가 아니며 HEAD, index, working tree의 blob이 모두 고정 commit의 구현계획서 blob과 동일함
- Stage 1이면 최초 고정 구현계획서 commit이 현재 HEAD임
- 이후 Stage면 최신 고정 구현계획서 commit이 현재 HEAD의 ancestor이며, 완료된 Stage 1 보고서가 최초 고정 SHA 검증 결과를 포함함
- `git log --oneline -1`이 단계 커밋 메시지 표준 형식 충족
- 명시 요청된 단계 묶음 커밋에는 `mydocs/working/task_{milestone_slug}_{N}_stage{S}.md` 존재

모든 보고 경로의 필수 확인:

- 단계 보고서 또는 작은 작업의 기존 맥락 기록이 `mydocs/_templates/stage_report.md`의 필수 내용을 채움
- 모든 보고 경로에서 단계별 검증 결과와 증거를 보존 (실패/실행 불가 시 단계 미완료로 기록하고 보고서는 작성)

## 절대 하지 말 것

- 검증 실패를 성공으로 보고하거나 실패한 단계를 완료 커밋으로 기록
- 명시적 커밋 허가 없이 커밋 블록 실행
- 명시 허가된 단계 커밋에서 산출물과 보고서를 분리해 별도 커밋 또는 마지막 Stage와 최종 보고서 결합
- HIGH 위험 결정의 정확한 승인 없이 해당 결정 실행
- 계획서 커밋이나 일반 단계 확인을 안전한 구현·보고·다음 단계의 선행 조건으로 사용
- committed context 기반 작업을 명시 요청한 경우 고정된 계획서를 변경하고 새 독립 commit과 exact SHA 기록 없이 기존 맥락으로 계속 진행
- committed context 기반 검증에서 구현계획서의 working-tree hash와 고정 blob을 비교하기 전에 계획서의 검증 명령 실행

## 호출 방법

- Codex: `$task-stage-report` 또는 `/skills` 메뉴
- Claude Code: `/task-stage-report`
