---
name: task-final-report
description: |
  하이퍼-워터폴 타스크의 최종 보고와 PR 게시 절차를 적용한다.
  최종 결과 보고서(`_report.md`) 작성·검증, 오늘할일 완료 처리, 최종 커밋,
  같은 스레드의 추가 승인 후 publish/task{N} 원격 push와 devel 대상 Open PR 생성을 수행한다.
  모든 단계 완료 후 PR 직전에만 호출.
---

# 하이퍼-워터폴 최종 보고와 PR 게시

## 트리거

- 작업지시자가 "최종 보고서 작성", "PR 준비"를 명시 지시한 경우
- 본 SKILL을 직접 호출한 경우

## 사전 조건

- 최초 승인된 구현 계획서의 독립 커밋과 작업지시자가 확인한 initial exact SHA가 Stage 1보다 먼저 존재하고, 모든 단계 종료와 각 단계 보고서 커밋이 완료됨
- Stage 1 이후 계획서를 재승인했다면 작업지시자가 확인한 latest exact SHA가 현재 HEAD의 ancestor임
- 통합 검증 명령과 전체 수용 기준이 구현계획서에 정리되어 본 절차에서 실행 가능
- `local/task{N}`에 commit 안 된 변경 없음 또는 본 절차에서 함께 커밋할 것만 남아 있음

## 절차

1. 타스크 번호와 통합 검증 입력 고정
   ```bash
   ISSUE_NUMBER_FILE="$(mktemp)"
   trap 'rm -f "$ISSUE_NUMBER_FILE"' EXIT
   # 파일 쓰기 도구로 작업지시자가 지정한 이슈 번호를 한 줄로 기록한다.
   IFS= read -r ISSUE_NUMBER < "$ISSUE_NUMBER_FILE"
   rm -f "$ISSUE_NUMBER_FILE"
   trap - EXIT
   case "$ISSUE_NUMBER" in
     ""|*[!0-9]*) printf 'ISSUE_NUMBER must be decimal digits\n' >&2; exit 1 ;;
   esac
   TASK_BRANCH="local/task${ISSUE_NUMBER}"
   PUBLISH_BRANCH="publish/task${ISSUE_NUMBER}"
   readonly ISSUE_NUMBER TASK_BRANCH PUBLISH_BRANCH
   ```
   - 작업지시자가 같은 스레드에서 확인한 최신 구현계획서 commit의 exact SHA를 파일 쓰기 도구로 전달하며 commit message 검색으로 다시 추론하지 않는다.
   - 검증 명령을 실행하기 전에 해당 commit이 `_impl.md`만 포함하고 현재 HEAD의 ancestor인지, 현재 `_impl.md`가 symlink가 아니며 HEAD와 working tree의 blob이 모두 승인 commit의 blob과 동일한지 재확인한다.
   - Stage 1 이후 계획서를 변경했다면 작업지시자의 재승인과 새 독립 commit이 있어야 하며 그 새 exact SHA를 사용한다.
   ```bash
   IMPL_PLAN="mydocs/plans/task_{milestone_slug}_${ISSUE_NUMBER}_impl.md"
   APPROVED_IMPL_PLAN_COMMIT_FILE="$(mktemp)"
   trap 'rm -f "$APPROVED_IMPL_PLAN_COMMIT_FILE"' EXIT
   # 파일 쓰기 도구로 작업지시자가 같은 스레드에서 확인한 latest exact commit SHA를 기록한다.
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
   test "$APPROVED_IMPL_PLAN_BLOB" = "$(git rev-parse ":$IMPL_PLAN")" || exit 1
   test "$APPROVED_IMPL_PLAN_BLOB" = "$(git hash-object -- "$IMPL_PLAN")" || exit 1
   git merge-base --is-ancestor "$APPROVED_IMPL_PLAN_COMMIT" HEAD || exit 1
   ```
   - 위 무결성 검증이 모두 통과한 뒤 구현 계획서의 "수용 기준" 또는 마지막 단계 "검증" 섹션 명령을 실행한다.
2. 최종 보고서 작성과 검증: `mydocs/report/task_{milestone_slug}_{N}_report.md`
   - 중앙 템플릿 `mydocs/_templates/final_report.md`를 기준으로 작성한다.
   - 템플릿을 읽을 수 없는 경우에만 다음 최소 섹션을 fallback으로 사용한다:
     - 작업 요약 (이슈 링크, 마일스톤, 단계 수)
     - 변경 파일 목록과 영향 범위
     - 변경 전·후 정량 비교 (라인 수, 토큰, 검증 통과 등 적용 시)
     - 검증 결과 (수용 기준별 OK/MISS)
     - 잔여 위험과 후속 작업
     - 작업지시자 승인 요청
3. 오늘할일 갱신: `mydocs/orders/{yyyymmdd}.md`의 #{N} 행
   - 출력 형식은 `mydocs/_templates/orders.md`를 기준으로 한다.
   - 상태 `완료`로 변경, 비고에 `완료: HH:mm` 기록
4. 변경 점검
   ```bash
   git status --short
   git diff --check
   git log --oneline "devel..${TASK_BRANCH}"
   ```
5. 최종 커밋 (Stage 마지막 + 최종 보고서를 묶을 수도, 보고서만 단일 커밋도 가능)
   ```bash
   git add mydocs/report/task_{milestone_slug}_{N}_report.md mydocs/orders/{yyyymmdd}.md
   git commit -m "Task #{N} Stage {마지막} + 최종 보고서: {요약}" \
     -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
     -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   # 또는
   git commit -m "Task #{N}: 최종 보고서 작성과 오늘할일 완료 처리" \
     -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" \
     -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
   ```
6. 여기서 즉시 멈추고 작업지시자에게 커밋된 최종 보고서와 수용 기준 검증 근거 승인 요청
   - 같은 스레드에서 새 승인을 받아야 한다.
   - 이전 단계 승인, 최종 보고서 작성 지시, 본 Skill 호출 지시는 PR 게시 승인으로 간주하지 않는다.
7. 승인 후 원격 게시 브랜치 push
   ```bash
   git push origin "${TASK_BRANCH}:${PUBLISH_BRANCH}"
   ```
8. 승인 후 devel 대상 Open PR 생성
   ```bash
   HEAD_SHA="$(git rev-parse HEAD)"
   PR_TITLE_FILE="$(mktemp)"
   PR_BODY="$(mktemp)"
   trap 'rm -f "$PR_TITLE_FILE" "$PR_BODY"' EXIT
   # 파일 쓰기 도구로 승인된 PR 제목을 "$PR_TITLE_FILE"에 한 줄로 기록한다.
   # .github/pull_request_template.md를 출발점으로 삼아 최종 보고서와 단계 보고서 기준으로 "$PR_BODY"를 작성한다.
   IFS= read -r PR_TITLE < "$PR_TITLE_FILE"
   gh pr create --base devel --head "$PUBLISH_BRANCH" \
     --title "$PR_TITLE" \
     --body-file "$PR_BODY"
   ```
   - PR 본문은 `.github/pull_request_template.md`를 기준으로 작성한다.
   - 최대 4개 요약 bullet (대상 타스크/왜/무엇/리뷰 포인트), Stage당 1줄 요약, 검증 결과 요약, 남은 리스크를 포함
   - Stage 제목은 단계 보고서 URL로, 옆의 짧은 commit SHA는 commit URL로 링크
   - 작업 문서는 `HEAD_SHA` 기준 `https://github.com/jinzer0/GPUWatch/blob/{HEAD_SHA}/mydocs/...` URL로 연결
   - 링크 표시는 raw URL이 아니라 `[파일명](URL)` 형식으로 작성
   - 상대 링크(`mydocs/...`)나 `blob/publish/task{N}/...` 링크는 사용하지 않음
   - PR 본문 검증 섹션은 `자동 검증`, `수동/시나리오 검증`, `CI/원격 검증`, `검증 한계` 하위 섹션을 사용한다.
   - 자동 검증은 `주제 / 검증 방법 / 결과 / 근거` 표로 적고, 명령 나열이 아니라 어떤 수용 기준을 확인했는지와 핵심 출력·통과 개수·확인 조건을 함께 남긴다.
   - 수동/시나리오 검증은 `시나리오 / 확인 절차 / 결과 / 자료` 표로 적고, 어떤 화면·파일·산출물에서 무엇을 확인했는지 남긴다.
   - CI/원격 검증은 `항목 / 결과 / 근거` 표로 적고, GitHub Check 이름, run 링크 또는 확인 시점을 남긴다.
   - 실행하지 않은 검증은 표에 남기지 말고 `검증 한계` 또는 `남은 리스크`에 사유를 적는다.
   - 긴 로그는 PR 본문에 붙이지 말고 최종 보고서나 단계 보고서 링크로 넘긴다.
   - 시각적 변경사항이 있을 때만 `스크린샷` Before/After 표를 유지
   - `관련 이슈`에는 대상 타스크가 아니라 선행, 후속, Epic, upstream, 참고 PR/issue만 작성
9. 작업지시자에게 PR URL 전달과 리뷰·merge 승인 요청

## 검증

- 모든 단계 보고서 + 최종 보고서 존재
- 최초 구현계획서 승인 commit과 확인된 initial exact SHA가 Stage 1 commit보다 먼저 존재
- 작업지시자가 같은 스레드에서 확인한 최신 exact SHA를 사용하며 해당 commit이 현재 HEAD의 ancestor
- 승인 commit, HEAD, index의 구현계획서 mode가 모두 `100644`이고 working tree가 symlink가 아니며 HEAD, index, working tree의 blob이 모두 최신 승인 commit의 구현계획서 blob과 동일
- 최종 보고서가 `mydocs/_templates/final_report.md`의 필수 섹션을 채움
- `git status --short` 결과 빈 출력
- `gh pr view` 결과에 draft가 아닌 PR이 정확한 base/head로 등록
- PR 본문 `변경 내역`의 Stage별 요약이 단계 보고서 링크와 짧은 commit SHA 링크를 함께 사용
- PR 본문 `변경 내역`의 작업 문서 항목이 commit SHA 고정 URL과 `[파일명](URL)` 표시 형식을 사용
- PR 본문 작업 문서 항목에 raw GitHub blob URL, 상대 링크, `blob/publish/task{N}` 링크 없음
- PR 본문 `검증` 섹션이 `자동 검증`, `수동/시나리오 검증`, `CI/원격 검증`, `검증 한계` 구조를 따름
- PR 본문에 실행하지 않은 검증 체크리스트가 남아 있지 않고, 미수행 항목은 `검증 한계` 또는 `남은 리스크`로 분리됨
- 오늘할일 #{N} 상태 `완료` + `완료: HH:mm`
- 최종 보고서/오늘할일 커밋 뒤 같은 스레드에서 별도 PR 게시 승인을 받았음

## 절대 하지 말 것

- 통합 검증 실패 상태에서 PR 생성
- `local/task{N}` 브랜치를 원격에 직접 push (반드시 `publish/task{N}`로 명명)
- decimal 검증 전 이슈 번호를 refspec, 브랜치명, 경로에 사용
- squash merge 강제 옵션 사용 (단계 커밋 의미 보존)
- 작업지시자 명시 지시 없이 Draft PR로 생성하거나 self-merge
- 최종 보고서/오늘할일 커밋 뒤 같은 스레드의 별도 승인 없이 원격 push 또는 PR 생성
- 승인된 PR 제목을 shell literal이나 command substitution으로 명령에 보간
- 구현계획서의 working-tree hash와 승인 blob을 비교하기 전에 계획서의 검증 명령 실행

## 호출 방법

- Codex: `$task-final-report` 또는 `/skills` 메뉴
- Claude Code: `/task-final-report`
