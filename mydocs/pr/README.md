# `pr/` 폴더 규칙

## 목적

외부 기여 PR의 read-only 검토 기록을 내부 task와 분리한다.

## 답하는 질문

"외부 PR을 어떤 immutable evidence로 검토했고 어떤 권고를 내렸는가?"

## 작성 시점

외부 기여 PR의 snapshot 수집, 정적 diff 검토, 최종 권고 또는 재검토 기록이 필요할 때 작성한다.

## 허용 파일명과 archive

- `pr_{번호}_review.md`, 필요 시 `pr_{번호}_review_impl.md`, `pr_{번호}_report.md`
- 완료 기록은 `archives/pr_{번호}_round{양의 정수}/`로 옮긴다. archive는 clean index에서 시작하고 exact staged path만 허용하며 partial move는 rollback한다.

## 사용 템플릿

- `mydocs/_templates/external_pr_review.md`
- 필요 시 `mydocs/_templates/external_pr_review_impl.md`
- `mydocs/_templates/external_pr_report.md`

## 고정 검토 계약

- 대상은 `github.com/jinzer0/GPUWatch`, ID `1256824919`의 `OPEN`, non-draft, `devel` 대상 direct external fork뿐이다.
- 증거 형식은 `review snapshot schema v2`다. repository/fork/base/diff-base/head identity, title/body/author/state/draft/labels, `requestedReviewers`, complete paginated comments/reviews/replies/threads/checks/statuses, check-run `total_count` equality, immutable diff SHA-256/bytes/lines/full read range, before/after equality를 기록한다.
- GitHub review, request-changes, comment, approve, merge, close는 이 폴더와 external-pr-review Skill의 범위 밖이다.

## 반드시 포함할 내용

- findings, 검증 한계, 권고, 선택적 제안 feedback text, physical temp root/ref cleanup 또는 abandonment 결과를 남긴다.

## 두면 안 되는 내용

- 내부 Issue 기반 task의 계획서, 단계 보고서, 최종 보고서
- contributor-controlled code 실행 결과를 안전한 검증으로 표현한 기록
- GitHub review/comment/request-changes/approve/merge/close를 승인하거나 수행하는 명령

## 다음 세션 AI가 복원해야 할 맥락

검토한 exact repository/PR/OID, snapshot schema와 digest, 전체 diff 읽기 결과, findings, 검증 한계, 최종 권고, archive round를 복원해야 한다.
