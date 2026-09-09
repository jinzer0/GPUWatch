# 외부 기여 PR 검토 가이드

## 목적

이 문서는 외부 기여자 PR 검토 절차와 `mydocs/pr/` 기록 흐름을 정의한다. 내부 task PR에는 이 절차를 적용하지 않는다.

외부 PR 검토 실행 절차는 [`external-pr-review`](../skills/external-pr-review/SKILL.md) Skill을 따른다.

## 기본 원칙

- 외부 기여 PR은 코드 변경과 문서 변경을 함께 검토한다.
- 외부 PR 검토 결과는 `mydocs/pr/` 문서 흐름으로 관리한다.
- 검토 문서는 `review snapshot schema v2`의 immutable canonical snapshot과 diff identity로 재현 가능해야 한다.
- GitHub 접근은 read-only다. REST는 explicit `--method GET`만 허용하고 GraphQL은 read-only `query` POST만 허용한다. GitHub review, comment, request-changes, approve, merge, close, label, issue mutation은 수행하지 않는다.
- canonical 대상은 `github.com/jinzer0/GPUWatch`, repository ID `1256824919`, `OPEN`, non-draft, `devel` 대상 direct external fork PR뿐이다.
- detached worktree는 snapshot 고정용이지 보안 sandbox가 아니다. 외부 PR 코드를 실행하는 install/build/test는 secrets와 권한이 없는 maintainer-controlled `pull_request` workflow의 GitHub-hosted runner에서만 수행한다.
- 안전한 CI가 없으면 maintainer 환경에서 대신 실행하지 않고 미수행 검증과 한계를 기록한다.
- 외부 기여자 PR은 내부 타스크와 다른 본질을 가지므로 별도 절차와 폴더를 사용한다.
- 외부 PR 검토 기록은 `mydocs/pr/`에 남긴다.

## 문서 흐름

외부 PR은 `mydocs/pr/` 문서 흐름으로 처리한다.

- 검토 문서: `pr_{번호}_review.md`
- 구현 계획서: `pr_{번호}_review_impl.md` (필요 시)
- 최종 보고서: `pr_{번호}_report.md`

처리 중인 최신 round는 위 고정 이름을 사용한다. 처리 완료 문서는 기존 basename과 문서 간 상대 링크를 유지한 채 `mydocs/pr/archives/pr_{번호}_round{양의 정수}/`로 이동한다. 같은 PR을 다시 검토하면 다음 빈 round 번호를 사용한다.

모든 present review/report/implementation 문서는 다음 machine-readable identity line을 각각 정확히 한 번 포함해야 한다. 값은 같은 snapshot 출력에서 온 값이어야 하며 archive tuple 생성 전 재검증된다.

```text
snapshot_schema=review snapshot schema v2
repository_host=github.com
repository_name=jinzer0/GPUWatch
repository_id=1256824919
pr_number={PR_NUMBER}
review_round={REVIEW_ROUND}
base_oid={BASE_OID}
diff_base_oid={DIFF_BASE_OID}
head_oid={HEAD_OID}
snapshot_sha256={SNAPSHOT_SHA256}
diff_sha256={DIFF_SHA256}
diff_bytes={DIFF_BYTES}
diff_lines={DIFF_LINES}
```

`pr_{번호}_report.md`에는 위 identity line에 더해 cleanup 결과 line을 각각 정확히 한 번 포함해야 한다.

```text
temporary_refs=absent
snapshot_root=removed
```

## 절차

1. canonical origin과 repository identity를 확인하고 정확한 `devel`과 pull ref를 fetch해 immutable binary/full-index diff를 만든다.
2. REST `--method GET` only와 GraphQL read-only query로 PR, issue comments, issue timeline, reviews, review comments, review threads, check runs, statuses를 complete pagination으로 수집한다.
3. `before`/`after` canonical snapshot이 byte-identical한지 확인한다. issue timeline의 linked-issue와 closing-reference evidence도 equality 대상이다.
4. `before.diff` 전체 byte range를 읽고 contributor-controlled code를 실행하지 않는 정적 검토를 수행한다.
5. `pr_{번호}_review.md`에 snapshot identity, full diff hash evidence, timeline-derived linked-issue evidence, findings, cleanup `보존 중` 상태를 기록한다.
6. 필요 시 `pr_{번호}_review_impl.md`에 추가 검증이나 보조 작업 범위를 기록한다. 이 파일이 present면 archive tuple이 path/state/hash/bytes를 bind하고, absent면 optional absence를 bind한다.
7. diff hash와 byte/line count를 cleanup 직전에 재검증한다. 실패하면 snapshot root를 삭제하지 않고 final report도 작성하지 않는다.
8. temporary refs가 absent인지 확인하고 snapshot root를 제거한다. 두 결과가 확인된 뒤에만 `pr_{번호}_report.md`를 작성한다.
9. final report에 같은 identity line, `temporary_refs=absent`, `snapshot_root=removed`, timeline completeness, 최종 권고를 기록한다.
10. archive approval tuple을 생성한다. tuple은 immutable snapshot identity, named local branch, exact parent OID, `External PR #{번호} Round {round}: 검토 기록 보관` subject, archive destination, 모든 present source의 path, tracked/untracked state, SHA-256, byte length, optional implementation presence를 bind한다. tuple 생성 시 index와 tracked worktree는 clean이어야 하고 worktree에는 승인 대상 untracked source 외 변경이 없어야 한다.
11. 작업지시자가 같은 스레드에서 approval tuple 전체를 승인한 뒤에만 archive commit을 수행한다. Round 1 untracked source는 archive destination addition만 stage하고 tracked source는 source와 destination을 stage해 exact rename으로 처리한다. mixed state는 per-file tuple state와 정확히 일치해야 한다. commit 전후 branch/parent/subject와 exact staged/committed tree, name-status, destination `100644` mode/blob을 검증하고 hook 실행 뒤 repository-wide index와 worktree가 clean인지 확인한다.

## 머지 전 체크

- PR 대상 브랜치가 정책에 맞는지
- 리뷰 코멘트가 해결/미해결로 구분되어 있는지
- 필수 검증이 수행됐는지
- 승인/보류/반려 판단 근거가 문서에 남았는지
- issue timeline에서 linked-issue와 closing-reference evidence를 확인했는지

## 머지 후 체크

- 관련 issue 상태 확인 (auto close 또는 수동 close)
- merge 완료된 원격 브랜치 삭제 여부 확인
- 다음 작업에 필요하지 않은 로컬 worktree, build 산출물, 설치 smoke test 산출물 정리
- 후속 작업이 있으면 신규 issue로 분리
- 검토 문서를 cleanup 확인과 final report 작성 후 승인된 tuple에 맞춰 `mydocs/pr/archives/`로 이동

## 내부 task와의 경계

내부 타스크의 `수행 -> 구현 -> 단계별 보고 -> 최종 보고` 절차는 외부 기여 PR 검토에 그대로 적용하지 않는다.

내부 후속 수정이 필요해지면 외부 PR 검토 문서에 근거를 남긴 뒤 별도 GitHub Issue를 만들고 내부 타스크로 분리한다.
