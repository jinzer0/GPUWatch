# 외부 PR 최종 보고서 템플릿

`mydocs/pr/pr_{번호}_report.md`의 중앙 템플릿이다. read-only 외부 PR 검토의 증거, cleanup 결과, 최종 권고를 기록한다.

## 사용 위치, 작성 시점, 언어

- 실제 파일 위치: `mydocs/pr/pr_{번호}_report.md`
- 작성 시점: 외부 PR 검토 findings와 검증 한계를 확정하고 temporary refs absence와 snapshot root removal을 실제 확인한 뒤, archive approval 전에 작성한다.
- 작성 언어: 저장소에 선택된 Hyper-Waterfall locale을 사용한다.

## 필수 섹션

- `결과 요약`, `문서 Identity`, `Immutable Evidence`, `Cleanup Result`, `Findings와 검증`, `권고와 선택적 Feedback`
- 최종 권고의 근거, 수행하지 않은 검증, cleanup-before-report evidence를 명시한다.

## 선택 섹션

- 후속 검토 조건과 GitHub에 게시하지 않은 feedback 초안을 추가할 수 있다.

## 검증 또는 승인 기준

- review 문서와 같은 snapshot/diff identity를 사용하고 `temporary_refs=absent`, `snapshot_root=removed`를 각각 정확히 한 줄 기록해야 한다.
- archive approval tuple과 archive commit은 이 보고서 작성 이후의 별도 same-thread 승인이 필요하며, 이 보고서 자체는 GitHub mutation 승인이 아니다.

## 결과 요약

- PR / 검토 round / 권고: #{번호} / {양의 정수} / {merge / 수정 요청 / 닫기}
- 핵심 근거: {한 줄 요약}
- GitHub mutation: 수행하지 않음

## 문서 Identity

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
temporary_refs=absent
snapshot_root=removed
```

## Immutable Evidence

- snapshot: `review snapshot schema v2`, SHA-256 `{digest}`
- repository: `github.com/jinzer0/GPUWatch`, ID `1256824919`
- fork/base/diff-base/head identity와 exact fetch OID compare: {값과 OK/MISS}
- title/body/author/state/draft/labels, `requestedReviewers`: {canonical snapshot 값}
- issue comments, issue timeline, reviews, review comments-replies, review threads, check runs, commit statuses: complete pagination {OK/MISS}
- timeline-derived linked-issue 및 closing-reference evidence: {timeline event id와 요약 또는 없음}
- check-run `total_count` equality: {OK/MISS}
- immutable diff SHA-256 / bytes / lines / full read range: `{digest}` / `{N}` / `{N}` / `0-{N-1}`
- before/after equality와 canonical origin: {OK/MISS}

## Cleanup Result

- temporary refs: `temporary_refs=absent`
- snapshot root: `snapshot_root=removed`
- 작성 순서: 이 결과가 둘 다 확인된 뒤에만 이 final report를 작성한다. archive approval tuple 생성과 archive commit은 이후 단계다.

## Findings와 검증

| 분류 | 내용 | 처리 |
|---|---|---|
| {bug/risk/doc/note} | {내용} | {권고 또는 후속} |

- contributor-controlled code 실행: 수행하지 않음
- 안전한 GitHub-hosted CI 결과 또는 미수행 사유: {결과}

## 권고와 선택적 Feedback

- 최종 권고: {merge / 수정 요청 / 닫기와 근거}
- 제안 feedback text: {검토자가 제안만 하는 본문 또는 없음}
- GitHub review/comment/request-changes/approve/merge/close는 이 Skill 밖의 별도 명시 절차다.
