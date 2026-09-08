# 외부 PR 최종 보고서 템플릿

이 파일은 `mydocs/pr/pr_{번호}_report.md` 작성용 중앙 템플릿이다. 외부 PR 검토의 최종 판단, 실행한 검증 결과, GitHub PR 코멘트 또는 리뷰 본문을 기록하는 문서다.

## 사용 위치

- 실제 파일: `mydocs/pr/pr_{번호}_report.md`
- 작성 시점: 외부 PR 검토와 필요한 검증을 마친 뒤, GitHub PR에 코멘트/리뷰를 등록하기 전
- 작성 언어: 이 저장소에 선택된 Hyper-Waterfall locale을 따른다.

## 검토 결과 요약

- PR: #{번호}
- 검토 round: {양의 정수}
- 최종 권고: {merge / 수정 요청 / 닫기}
- 핵심 근거: {한 줄 요약}

## 승인 Snapshot

- number: {PR 번호}
- state: {OPEN/MERGED/CLOSED}
- baseRefName: `{base branch}`
- headRepository.nameWithOwner: `{owner/repository}`
- headRefName: `{head branch}`
- headRefOid: `{승인받은 commit SHA}`
- statusCheckRollup: {pending/failed/passing/no checks와 핵심 check 요약}
- 전체 diff 줄 수: {N}
- 검토 범위: `{첫 줄}-{마지막 줄}` / `{전체 N줄}`
- side effect 직전 재검증: {OK/MISS — 재검증 시각과 동일 headRefOid}
- validation fetch commit: `{승인받은 headRefOid와 동일한 FETCH_HEAD}`
- validation worktree: {detached HEAD 확인 OK/MISS}
- validation cleanup: {worktree 등록 해제와 임시 디렉터리 삭제 OK/MISS}

## 검증 결과

- contributor-controlled code 실행 위치: {조건을 만족하는 GitHub-hosted `pull_request` CI / 미수행}
- CI 안전 조건 확인: {OK/MISS/해당 CI 없음}

실행 명령:

```bash
{검증 명령}
```

결과:

- {OK/MISS와 핵심 출력 요약}

## 주요 발견 사항

| 분류 | 내용 | 처리 |
|---|---|---|
| {bug/risk/doc/note} | {내용} | {merge 전 수정/후속/참고} |

## 최종 권고

{merge / 수정 요청 / 닫기 중 하나를 명확히 적고 이유를 설명한다.}

## GitHub PR 코멘트 본문

```md
{GitHub PR에 남길 코멘트 또는 리뷰 본문}
```

## 작업지시자 승인 요청

- 위 최종 권고와 GitHub PR 코멘트 본문을 승인하면 PR에 등록한다.
