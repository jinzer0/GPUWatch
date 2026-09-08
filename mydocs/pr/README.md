# `pr/` 폴더 규칙

## 목적

외부 기여자 PR 검토를 내부 task 흐름과 분리해 기록한다.

## 답하는 질문

"이 외부 PR을 merge, 수정 요청, close 중 무엇으로 판단할 것인가?"

## 작성 시점

외부 PR 메타데이터와 diff 확인 후, 추가 검증 전후, 최종 GitHub 코멘트 등록 전.

## 허용 파일명

- `pr_{번호}_review.md`
- `pr_{번호}_review_impl.md`
- `pr_{번호}_report.md`

처리 중인 최신 round는 위 이름을 사용한다. 처리 완료 문서는 기존 기록을 덮어쓰지 않도록 다음 이름으로 `pr/archives/`에 이동한다.

- `pr_{번호}_round{양의 정수}_review.md`
- `pr_{번호}_round{양의 정수}_review_impl.md` (필요 시)
- `pr_{번호}_round{양의 정수}_report.md`

같은 PR을 다시 검토하면 다음 빈 round 번호를 사용한다.

## 사용 템플릿

- `mydocs/_templates/external_pr_review.md`
- `mydocs/_templates/external_pr_review_impl.md`
- `mydocs/_templates/external_pr_report.md`

## 반드시 포함할 내용

- PR 정보
- 변경 요약
- 영향 범위
- 코드/문서 점검 결과
- 검증 계획 또는 결과
- 권고
- 작업지시자 승인 요청

## 두면 안 되는 내용

- 내부 task의 `_stage{N}.md`, `_report.md` 형식 강제 적용
- 승인 없는 merge 또는 close 결정

## 다음 세션 AI가 복원해야 할 맥락

외부 PR에 대한 현재 판단, 남은 검증, GitHub에 남길 코멘트 또는 리뷰 본문.
