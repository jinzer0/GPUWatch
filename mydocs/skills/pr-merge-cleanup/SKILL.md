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

- 대상 PR이 GitHub에서 실제 merged 상태 (`gh pr view {번호} --json state,mergeCommit`)
- 작업지시자의 이슈 close 승인 (또는 PR 본문에 `closes #N` 명시되어 자동 close된 상태)

## 절차

1. PR과 이슈 상태 확인
   ```bash
   gh pr view {번호} --json state,mergedAt,mergeCommit,headRefName
   gh issue view {N} --json state
   ```
   - PR `state == MERGED` 아니면 즉시 중단하고 작업지시자 보고
2. 안전한 cleanup 실행 위치 확정
   ```bash
   CURRENT_WORKTREE="$(git rev-parse --show-toplevel)"
   COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
   case "$COMMON_DIR" in
     */.git) PRIMARY_WORKTREE="${COMMON_DIR%/.git}" ;;
     *) printf 'Unable to identify the primary worktree\n' >&2; exit 1 ;;
   esac
   TASK_WORKTREE_TO_REMOVE=""
   if test "$CURRENT_WORKTREE" != "$PRIMARY_WORKTREE"; then
     test "$(git branch --show-current)" = "local/task{N}"
     TASK_WORKTREE_TO_REMOVE="$CURRENT_WORKTREE"
     cd -- "$PRIMARY_WORKTREE"
   fi
   test "$(git rev-parse --show-toplevel)" = "$PRIMARY_WORKTREE"
   test -z "$(git status --porcelain)"
   git worktree list --porcelain
   ```
   - 기본 worktree에서 시작했지만 별도 `local/task{N}` worktree가 존재하면 위 목록에서 절대 경로를 확인해 `TASK_WORKTREE_TO_REMOVE`에 기록한다.
   - 이후 모든 명령은 기본 worktree에서 실행한다. 기본 worktree가 dirty하거나 경로를 확정할 수 없으면 side effect 전에 중단한다.
   - one-shot shell 도구를 사용하는 agent는 이후 호출의 `workdir`를 기록한 `PRIMARY_WORKTREE`로 지정하고, 제거할 경로가 있으면 기록한 `TASK_WORKTREE_TO_REMOVE`를 환경 변수로 명시 전달한다. 이전 호출의 `cd`나 shell 변수가 유지된다고 가정하지 않는다.
3. 이슈 close (자동 close 안 된 경우만)
   ```bash
   gh issue close {N}
   ```
4. devel 최신화
   ```bash
   git fetch origin --prune
   if test "$(git branch --show-current)" != "devel"; then
     git checkout devel
   fi
   git pull --ff-only
   test "$(git branch --show-current)" = "devel"
   ```
5. 원격 publish 브랜치 삭제 (이미 PR merge 시 `--delete-branch`로 삭제된 경우 skip)
   ```bash
   git push origin --delete publish/task{N} 2>&1 || echo "이미 삭제됨"
   ```
6. 분리 worktree 사용했다면 기본 worktree에서 제거
   ```bash
   if test -n "${TASK_WORKTREE_TO_REMOVE:-}"; then
     test "$TASK_WORKTREE_TO_REMOVE" != "$(git rev-parse --show-toplevel)"
     git worktree remove "$TASK_WORKTREE_TO_REMOVE"
     git worktree prune
   fi
   ```
   - dirty 또는 locked worktree는 강제 제거하지 않고 중단해 작업지시자에게 보고한다.
7. 로컬 작업 브랜치 삭제 (재사용 가능성 없을 때만)
   ```bash
   git branch -d local/task{N}
   # 강제 삭제는 작업지시자 명시 승인 후에만: git branch -D local/task{N}
   ```
8. 오늘할일 최종 정리: `mydocs/orders/{yyyymmdd}.md`의 #{N} 행이 `완료` + 시각 기록되어 있는지 재확인
9. 결과 보고: 정리된 항목 목록을 작업지시자에게 짧게 회신

## 검증

- `gh pr view {번호}` `state == MERGED` 확인
- `git branch -vv | grep local/task{N}` 출력 없음 (삭제된 경우)
- `git ls-remote origin publish/task{N}` 빈 출력 (원격 삭제 확인)
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

## 호출 방법

- Codex: `$pr-merge-cleanup` 또는 `/skills` 메뉴
- Claude Code: `/pr-merge-cleanup`
