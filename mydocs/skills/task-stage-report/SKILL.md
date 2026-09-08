---
name: task-stage-report
description: |
  하이퍼-워터폴 타스크의 단계 종료 절차를 적용한다.
  단계별 완료 보고서(`_stage{N}.md`) 작성, 단계 소스와 보고서 묶음 커밋,
  단계 검증 명령 실행을 수행한다. 한 단계가 끝나고 다음 단계 진입 직전에 호출.
---

# 하이퍼-워터폴 단계 종료 보고

## 트리거

- 작업지시자가 "Stage {N} 마무리", "단계 보고서 작성"을 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 구현 계획서(`task_{milestone_slug}_{N}_impl.md`)가 존재하고 작업지시자 내용 승인 후 `local/task{N}`에 독립 커밋되며 exact SHA까지 같은 스레드에서 확인됨
- Stage 1 시작 시 구현계획서에 미커밋 변경이 없었음
- 현재 단계의 작업 항목이 모두 코드/문서에 반영됨
- 작업 브랜치는 `local/task{N}`

## 절차

1. 승인 계획서 무결성 확인 후 단계별 검증 명령 실행
   - 작업지시자가 같은 스레드에서 확인한 최신 구현계획서 commit의 exact SHA를 `APPROVED_IMPL_PLAN_COMMIT_FILE`에 파일 쓰기 도구로 기록한다. commit message 검색으로 승인 SHA를 다시 추론하지 않는다.
   - 승인 commit의 내용, 현재 계획서 blob, 현재 단계와의 선행 관계를 먼저 확인한다.
      ```bash
      IMPL_PLAN="mydocs/plans/task_{milestone_slug}_{N}_impl.md"
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
      test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT" | wc -l | tr -d ' ')" -eq 1 || exit 1
      test "$(git diff-tree --root --no-commit-id --name-only -r "$APPROVED_IMPL_PLAN_COMMIT")" = "$IMPL_PLAN" || exit 1
      test ! -L "$IMPL_PLAN" || exit 1
      test "$(git ls-tree "$APPROVED_IMPL_PLAN_COMMIT" -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644" || exit 1
      test "$(git ls-tree HEAD -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644" || exit 1
      test "$(git ls-files -s -- "$IMPL_PLAN" | cut -d' ' -f1)" = "100644" || exit 1
      APPROVED_IMPL_PLAN_BLOB="$(git rev-parse "$APPROVED_IMPL_PLAN_COMMIT:$IMPL_PLAN")" || exit 1
      test "$APPROVED_IMPL_PLAN_BLOB" = "$(git rev-parse "HEAD:$IMPL_PLAN")" || exit 1
      test "$APPROVED_IMPL_PLAN_BLOB" = "$(git hash-object -- "$IMPL_PLAN")" || exit 1
      if test "{S}" = "1"; then
        test "$(git rev-parse HEAD)" = "$APPROVED_IMPL_PLAN_COMMIT" || exit 1
      else
        git merge-base --is-ancestor "$APPROVED_IMPL_PLAN_COMMIT" HEAD || exit 1
      fi
      ```
   - 위 무결성 검증이 모두 통과한 뒤 구현 계획서의 해당 단계 "검증" 섹션 명령을 실행한다.
   - 결과를 보고서에 인용할 수 있도록 출력 보존
2. 단계 보고서 작성: `mydocs/working/task_{milestone_slug}_{N}_stage{S}.md`
   - 중앙 템플릿 `mydocs/_templates/stage_report.md`를 기준으로 작성한다.
   - 템플릿을 읽을 수 없는 경우에만 다음 최소 섹션을 fallback으로 사용한다:
     - 단계 목적
     - 산출물 (파일 목록 + 라인 수 또는 요약)
     - 본문 변경 정도 / 본문 무손실 여부 (해당 시)
     - 검증 결과 (위 1번 출력 인용)
     - 잔여 위험
     - 다음 단계 영향
     - 승인 요청 (다음 단계 진입 또는 PR 단계)
3. 변경 점검
   ```bash
   git status --short
   git diff --check
   ```
4. 단계 소스 + 보고서 묶음 커밋
   ```bash
   git add {단계 산출 파일들} mydocs/working/task_{milestone_slug}_{N}_stage{S}.md
   git commit -m "Task #{N} Stage {S}: {핵심 내용 요약}" \
     -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
     -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   ```
   - 하위 단계: `Task #{N} [Stage {S.M}]: 내용`
   - 최종 단계 + 최종 보고서 묶음: `Task #{N} Stage {S} + 최종 보고서: 내용` (이 경우 별도 SKILL `task-final-report`로 처리 권장)
5. 작업지시자에게 단계 보고서 검토와 다음 단계 진입 승인 요청

## 검증

- `git ls-files --error-unmatch mydocs/plans/task_{milestone_slug}_{N}_impl.md` 통과
- `git diff --quiet HEAD -- mydocs/plans/task_{milestone_slug}_{N}_impl.md` 통과
- `git log -1 --format='%H' -- mydocs/plans/task_{milestone_slug}_{N}_impl.md`가 commit SHA를 출력
- 작업지시자가 같은 스레드에서 확인한 exact SHA를 사용하며 commit message 검색으로 대체하지 않음
- 최신 구현계획서 승인 commit의 변경 파일이 해당 `_impl.md` 하나뿐임
- 승인 commit, HEAD, index의 구현계획서 mode가 모두 `100644`이고 working tree가 symlink가 아니며 HEAD와 working tree의 blob이 모두 승인 commit의 구현계획서 blob과 동일함
- Stage 1이면 최초 구현계획서 승인 commit이 현재 HEAD임
- 이후 Stage면 최신 구현계획서 승인 commit이 현재 HEAD의 ancestor이며, 완료된 Stage 1 보고서가 최초 승인 SHA 검증 결과를 포함함
- `git log --oneline -1`이 단계 커밋 메시지 표준 형식 충족
- `mydocs/working/task_{milestone_slug}_{N}_stage{S}.md` 존재
- 단계 보고서가 `mydocs/_templates/stage_report.md`의 필수 섹션을 채움
- 단계별 검증 명령이 실패 없이 통과 (실패 시 단계 미완료로 처리하고 보고서 작성 보류)

## 절대 하지 말 것

- 검증 실패 상태로 보고서 작성·커밋
- 단계 산출물과 보고서를 분리해 별도 커밋 (한 단계는 한 커밋 원칙)
- 작업지시자 승인 없이 다음 단계 진입
- 승인된 구현계획서를 독립 커밋하기 전에 Stage 1 진입
- 작업지시자의 재승인과 새 독립 commit 없이 승인된 구현계획서 변경. Stage 1 이후 재승인했다면 새 exact SHA를 이후 단계 검증에 사용
- 구현계획서의 working-tree hash와 승인 blob을 비교하기 전에 계획서의 검증 명령 실행

## 호출 방법

- Codex: `$task-stage-report` 또는 `/skills` 메뉴
- Claude Code: `/task-stage-report`
