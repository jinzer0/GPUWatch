# `pr/` 폴더 규칙

## 목적

외부 기여 PR의 read-only 검토 기록을 내부 task와 분리한다.

## 답하는 질문

"외부 PR을 어떤 immutable evidence로 검토했고 어떤 권고를 내렸는가?"

## 작성 시점

외부 기여 PR의 schema v2 snapshot 수집, 정적 diff 검토, cleanup 확인 뒤 최종 권고, 또는 재검토 기록이 필요할 때 작성한다.

## 허용 파일명과 archive

- `pr_{번호}_review.md`, 필요 시 `pr_{번호}_review_impl.md`, `pr_{번호}_report.md`
- 완료 기록은 `archives/pr_{번호}_round{양의 정수}/`로 옮긴다. archive는 cleanup 확인과 final report 작성 후, content-bound approval tuple의 same-thread 승인을 받아 실행한다. tuple은 named local branch, exact parent OID와 `External PR #{번호} Round {round}: 검토 기록 보관` subject도 bind한다.
- archive 실행은 승인된 review, report, optional implementation만 소유 resource로 취급한다. source, destination, index entry, file identity, mode, link count, SHA-256, byte length를 publication 전에 캡처하고, move와 staging 후 세 source의 post-stage 상태를 다시 검증한다. filesystem SHA-256과 byte 읽기는 `$REPO_ROOT` 기준 absolute path로 수행하고, blob 읽기는 `git -C "$REPO_ROOT"`에 repository-relative destination을 넘긴다.
- Round 1 untracked source는 archive destination addition만 stage한다. tracked source는 source와 destination을 stage해 exact rename으로 처리한다. review/report/optional implementation의 mixed tracked/untracked state는 tuple의 per-file state와 같아야 한다. commit 전후 exact tree/name-status와 destination `100644` mode/blob을 검증하고 exported `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=core.hooksPath`, `GIT_CONFIG_VALUE_0=/dev/null` tuple로 hooks를 비활성화한 index와 worktree가 clean이어야 한다.
- publication은 full OID가 일치하는 direct local branch에만 `update-ref --stdin`의 `option no-deref` exact-old transaction으로 게시한다. competing direct ref, symbolic ref, missing ref, unreadable ref, filesystem drift, index drift가 보이면 rollback이나 정리를 강행하지 않고 competing state를 보존한다. outer signal이나 postcondition 실패 뒤 ref가 exact-new로 확인될 때만 같은 no-deref exact-old transaction으로 parent에 되돌린다.
- archive rollback은 captured owned destination과 owned index path가 모두 replay될 때만 source, destination, index를 되돌린다. owned-resource 검증이 하나라도 실패하면 승인된 path 외 filesystem과 index를 건드리지 않는다.

## 사용 템플릿

- `mydocs/_templates/external_pr_review.md`
- 필요 시 `mydocs/_templates/external_pr_review_impl.md`
- `mydocs/_templates/external_pr_report.md`

## 고정 검토 계약

- 대상은 `github.com/jinzer0/GPUWatch`, ID `1256824919`의 `OPEN`, non-draft, `devel` 대상 direct external fork뿐이다.
- 증거 형식은 `review snapshot schema v2`다. repository/fork/base/diff-base/head identity, title/body/author/state/draft/labels, `requestedReviewers`, complete paginated issue comments/issue timeline/reviews/replies/threads/checks/statuses, check-run `total_count` equality, immutable diff SHA-256/bytes/lines/full read range, before/after equality를 기록한다.
- issue timeline에서 linked-issue와 closing-reference evidence를 확인하고, 그 맥락을 canonical equality와 review/report 기록에 포함한다.
- GitHub 접근은 read-only다. REST는 explicit `--method GET`만 허용하고 GraphQL은 read-only `query` POST만 허용한다. GitHub review, request-changes, comment, approve, merge, close, label, issue mutation은 이 폴더와 external-pr-review Skill의 범위 밖이다.
- 모든 present review/report/implementation 문서는 `snapshot_schema`, `repository_host`, `repository_name`, `repository_id`, `pr_number`, `review_round`, `base_oid`, `diff_base_oid`, `head_oid`, `snapshot_sha256`, `diff_sha256`, `diff_bytes`, `diff_lines`의 exact `key=value` line을 각 key마다 한 줄만 포함한다. report는 `temporary_refs=absent`와 `snapshot_root=removed`도 각 한 줄 포함한다.
- archive approval tuple은 immutable snapshot identity, named local branch, exact parent OID와 commit subject, destination path, 모든 present source path, tracked/untracked state, SHA-256, byte length, optional implementation presence 또는 absence를 bind한다. tuple 생성과 실행은 source/destination/index identity를 재검증하며, filesystem SHA-256과 byte 읽기는 `$REPO_ROOT` absolute path를 쓰고 blob 읽기는 `git -C "$REPO_ROOT"`에 repository-relative destination을 넘긴다. 승인 대상 untracked source 외 worktree 변경은 허용하지 않는다.

## 반드시 포함할 내용

- findings, 검증 한계, 권고, 선택적 제안 feedback text, temporary refs absence, snapshot root removal 결과를 남긴다.

## 두면 안 되는 내용

- 내부 Issue 기반 task의 계획서, 단계 보고서, 최종 보고서
- contributor-controlled code 실행 결과를 안전한 검증으로 표현한 기록
- GitHub review/comment/request-changes/approve/merge/close를 승인하거나 수행하는 명령

## 다음 세션 AI가 복원해야 할 맥락

검토한 exact repository/PR/OID, snapshot schema와 digest, 전체 diff 읽기 결과, timeline-derived linked-issue evidence, findings, 검증 한계, cleanup 결과, 최종 권고, archive round를 복원해야 한다.
