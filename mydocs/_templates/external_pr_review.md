# 외부 PR 검토 템플릿

이 파일은 `mydocs/pr/pr_{번호}_review.md` 작성용 중앙 템플릿이다. 외부 기여자 PR 검토의 초기 판단, 영향 범위, 검증 계획, 권고를 기록하고 작업지시자에게 검토 방향 승인을 받기 위한 문서다.

## 사용 위치

- 실제 파일: `mydocs/pr/pr_{번호}_review.md`
- 작성 시점: 외부 기여자 PR 메타데이터와 diff를 확인한 직후
- 작성 언어: 이 저장소에 선택된 Hyper-Waterfall locale을 따른다.

## PR 정보

- PR: #{번호}
- 검토 round: {양의 정수}
- 제목: {PR 제목}
- 작성자: {작성자}
- base/head: `{base}` ← `{head}`
- head repository: `{fork 또는 same repo}`
- 상태: {OPEN/MERGED/CLOSED}
- 연결 이슈: {있으면 링크, 없으면 없음}

## 검토 Snapshot

- number: {PR 번호}
- state: {OPEN/MERGED/CLOSED}
- baseRefName: `{base branch}`
- headRepository.nameWithOwner: `{owner/repository}`
- headRefName: `{head branch}`
- headRefOid: `{완전히 검토한 commit SHA}`
- statusCheckRollup: {pending/failed/passing/no checks와 핵심 check 요약}
- 캡처 전·후 metadata 일치: {OK/MISS}
- 전체 diff 줄 수: {N}
- 검토 범위: `{첫 줄}-{마지막 줄}` / `{전체 N줄}`

## 변경 요약

- {PR이 바꾸는 핵심 내용}

## 영향 범위와 호환성

| 영역 | 영향 | 호환성 판단 |
|---|---|---|
| {영역} | {영향} | {호환/주의/위험} |

## 코드/문서 점검 결과

- {검토 중 발견한 주요 사항}

## 검증 계획

- 로컬 detached worktree: {contributor-controlled code를 실행하지 않는 정적 검토 또는 없음}
- GitHub-hosted `pull_request` CI: {maintainer-controlled safe check 또는 없음}
- 실행 검증 한계: {안전한 CI가 없으면 미수행 사유}

```bash
{필요한 검증 명령}
```

- {수동 확인 항목}

## 권고

권고: {merge / 수정 요청 / 닫기}

근거:

- {판단 근거}

## 작업지시자 승인 요청

- 위 검토 방향과 권고에 동의하면 검증 또는 GitHub PR 코멘트 작성 단계로 진행한다.
