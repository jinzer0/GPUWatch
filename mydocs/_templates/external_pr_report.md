# 외부 PR 최종 보고서 템플릿

`mydocs/pr/pr_{번호}_report.md`의 중앙 템플릿이다. read-only 외부 PR 검토의 증거와 최종 권고를 기록한다.

## 사용 위치, 작성 시점, 언어

- 실제 파일 위치: `mydocs/pr/pr_{번호}_report.md`
- 작성 시점: 외부 PR 검토 findings와 검증 한계를 확정한 뒤 archive 전에 작성한다.
- 작성 언어: 저장소에 선택된 Hyper-Waterfall locale을 사용한다.

## 필수 섹션

- `결과 요약`, `Immutable Evidence`, `Findings와 검증`, `권고와 선택적 Feedback`
- 최종 권고의 근거와 수행하지 않은 검증을 명시한다.

## 선택 섹션

- 후속 검토 조건과 GitHub에 게시하지 않은 feedback 초안을 추가할 수 있다.

## 검증 또는 승인 기준

- review 문서와 같은 snapshot/diff identity를 사용하고 cleanup 또는 explicit abandonment 결과까지 기록해야 한다.
- archive commit은 별도 same-thread 승인이 필요하며 이 보고서 자체는 GitHub mutation 승인이 아니다.

## 결과 요약

- PR / 검토 round / 권고: #{번호} / {양의 정수} / {merge / 수정 요청 / 닫기}
- 핵심 근거: {한 줄 요약}
- GitHub mutation: 수행하지 않음

## Immutable Evidence

- snapshot: `review snapshot schema v2`, SHA-256 `{digest}`
- repository: `github.com/jinzer0/GPUWatch`, ID `1256824919`
- fork/base/diff-base/head identity와 exact fetch OID compare: {값과 OK/MISS}
- title/body/author/state/draft/labels, `requestedReviewers`: {canonical snapshot 값}
- issue comments, reviews, review comments-replies, review threads, check runs, commit statuses: complete pagination {OK/MISS}
- check-run `total_count` equality: {OK/MISS}
- immutable diff SHA-256 / bytes / lines / full read range: `{digest}` / `{N}` / `{N}` / `0-{N-1}`
- before/after equality와 canonical origin: {OK/MISS}
- temporary root/ref cleanup 또는 explicit abandonment: {결과}

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
