# 외부 PR 검토 템플릿

`mydocs/pr/pr_{번호}_review.md`의 중앙 템플릿이다. 이 문서는 GitHub read-only 검토 증거, findings, 권고를 기록한다.

## 사용 위치, 작성 시점, 언어

- 실제 파일 위치: `mydocs/pr/pr_{번호}_review.md`
- 작성 시점: 외부 PR의 immutable snapshot과 전체 diff를 수집한 뒤, 최종 보고서 작성 전에 작성한다.
- 작성 언어: 저장소에 선택된 Hyper-Waterfall locale을 사용한다.

## 필수 섹션

- `PR 정보`, `문서 Identity`, `불변 Review Snapshot`, `Timeline Evidence`, `Findings, 검증, 권고`
- schema v2 snapshot identity, complete pagination, diff digest/범위, timeline-derived linked-issue evidence, cleanup 보존 상태를 빠짐없이 기록한다.

## 선택 섹션

- 재검토가 필요하면 검토 round별 변경점과 게시하지 않은 feedback 초안을 추가할 수 있다.

## 검증 또는 승인 기준

- `before`/`after` canonical snapshot이 byte-identical하고 immutable diff의 SHA-256, bytes, lines, 전체 읽기 범위가 일치해야 한다.
- 이 문서 작성은 GitHub mutation 승인이 아니며 review/comment/request-changes/approve/merge/close를 허용하지 않는다.
- 아래 `문서 Identity`의 machine-readable `key=value` line은 각 key마다 정확히 한 줄만 있어야 하며 archive tuple 생성 전 재검증된다.

## 허용 대상과 고정 용어

- 대상 repository: `github.com/jinzer0/GPUWatch`, ID `1256824919`
- 허용 PR: `OPEN`, non-draft, base `devel`, direct external fork (`isFork=true`, `parentId=1256824919`)
- snapshot: `review snapshot schema v2`
- GitHub REST 호출은 explicit `--method GET`만 허용한다. GraphQL은 read-only `query` POST만 허용하고 `mutation`은 금지한다.
- GitHub review, request-changes, comment, approve, merge, close는 이 문서와 Skill의 범위 밖이다.

## PR 정보

- PR / 검토 round: #{번호} / {양의 정수}
- 제목 / 작성자: {title} / {author}
- state / draft / base/head: `OPEN` / `false` / `devel` ← `{head}`
- labels: {정렬된 labels}

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
```

## 불변 Review Snapshot

- captured snapshot SHA-256: `{64자 digest}`
- repository / fork / base / diff-base / head identity: {각 ID, ref, 40자 OID}
- canonical origin allowlist, exact `devel`/pull ref fetch OID compare: {OK/MISS}
- diff: `git diff --no-ext-diff --no-textconv --binary --full-index {diffBaseOid} {headOid}`
- diff SHA-256 / bytes / lines / read range: `{digest}` / `{N}` / `{N}` / `0-{N-1}`
- title/body/author/state/draft/labels 및 `requestedReviewers`: {canonical snapshot 값}
- complete pagination: issue comments / issue timeline / reviews / review comments-replies / review threads / check runs / commit statuses 모두 OK/MISS
- check-run `total_count`와 수집 수 일치: {OK/MISS}
- before/after canonical snapshot byte equality: {OK/MISS}
- root/ref cleanup: `보존 중`, final report 작성 전까지 확정하지 않음

## Timeline Evidence

- linked-issue 및 closing-reference evidence: {issue timeline event id, event, source, created_at, 연결 issue 또는 없음}
- timeline completeness: `before`/`after` canonical snapshot byte equality에 포함됨

## Findings, 검증, 권고

- findings: {bug/risk/doc/note}
- 로컬 검증은 contributor code를 실행하지 않는 정적 diff 검토만 수행: {결과}
- GitHub-hosted safe CI 결과 또는 미수행 사유: {결과}
- 권고: {merge / 수정 요청 / 닫기}
- 선택적 제안 feedback text: {GitHub에 게시하지 않는 제안문 또는 없음}
