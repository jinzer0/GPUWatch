# Release와 Update Protocol 가이드

이 문서는 GPUWatch app release와 upstream Hyper-Waterfall framework release를 구분하고, 기존 적용 저장소 update protocol을 정의한다. 일반 task 브랜치 운용은 `git_workflow_guide.md`를 따른다.

## Canonical 배포 기준

GPUWatch app release는 이 저장소의 `devel`에 검증된 앱 변경을 `main`으로 승격하고 앱 tag를 만드는 흐름이다. Upstream Hyper-Waterfall framework release는 `postmelee/hyper-waterfall`의 GitHub Release/tag이며, GPUWatch 설치본 업데이트는 `.hyper-waterfall/version.json`과 immutable upstream artifact를 기준으로 판단한다.

GPUWatch에 현재 설치된 framework 기준은 v0.3.0 release(`https://github.com/postmelee/hyper-waterfall/releases/tag/v0.3.0`)와 immutable commit `83836828a4da24385d0410515d35ee43946b981f`(`https://github.com/postmelee/hyper-waterfall/tree/83836828a4da24385d0410515d35ee43946b981f`)이다.

프롬프트, npm CLI, plugin, Homebrew 같은 채널은 release/tag 기준을 실행하거나 발견하기 쉽게 하는 경로일 뿐 canonical 기준을 대체하지 않는다.

## Release 준비 체크

Release 준비 시 다음 항목을 확인한다.

- GPUWatch app release인지 upstream framework update인지 먼저 구분
- app release이면 `devel`의 검증 결과, PR 승인, tag 대상 commit을 확인
- framework update이면 `.hyper-waterfall/version.json`의 현재 version, 목표 upstream release artifact, 적용 저장소의 사용자 수정 diff를 확인
- 적용 저장소의 `.hyper-waterfall/version.json`이 목표 version과 선택 locale을 기록하거나 보존할 수 있는지 확인

## PR 유형 구분

일반 task PR, release PR, Hyper-Waterfall 버전 업데이트 PR은 서로 다른 목적을 가진다.

| 유형 | 목적 | 브랜치 흐름 | PR 제목 |
|---|---|---|---|
| task PR | 저장소 기능, 문서, 운영 작업을 이슈 단위로 반영 | `local/task{N}` -> `publish/task{N}` -> `devel` | `Task #{N}: {작업 제목}` |
| release PR | `devel`에 누적된 GPUWatch app 변경을 `main`로 승격하고 app tag 기준을 만든다 | `devel` -> `main` | `Release: {version}` |
| Hyper-Waterfall 버전 업데이트 PR | 기존 적용 저장소를 현재 version에서 목표 release/tag로 올린다 | `local/task{N}` -> `publish/task{N}` -> `devel` | `Task #{N}: Hyper-Waterfall {fromVersion} -> {toVersion} 버전 업데이트` |

일반 task PR, GPUWatch app release PR, upstream Hyper-Waterfall framework release는 분리한다. 기존 적용 저장소 업데이트는 upstream framework release 이후 별도 Hyper-Waterfall 버전 업데이트 PR로 수행한다.

## Release PR 흐름

GPUWatch app 릴리즈 시점에는 `devel`에서 검증된 변경을 `main`로 승격하는 PR을 만든다.

```bash
gh pr create --base main --head devel --title "Release: {version}"
# 현재 턴의 작업지시자 승인과 base/head/PR 번호를 다시 확인한 뒤 실행
gh pr view {PR_NUMBER} --json number,baseRefName,headRefName,mergeable,mergeStateStatus
gh pr review {PR_NUMBER} --approve
gh pr merge {PR_NUMBER} --merge --delete-branch=false
```

실제 tag 생성과 GitHub Release 발행은 별도 승인된 release 단계에서 수행한다.

`main`에만 생긴 release commit, hotfix, README 보정은 그대로 방치하지 않는다. 같은 턴에서 명시 승인받았거나 별도 승인된 동기화 단계에서 `main` -> `devel` PR이나 승인된 일반 merge로 반영한다. 이때도 review/approval gate를 생략하지 않는다.

## Update Protocol

기존 적용 저장소 업데이트는 다음 입력을 비교해 판단한다.

- 대상 저장소의 `.hyper-waterfall/version.json`
- 목표 upstream GitHub Release/tag의 immutable artifact
- 기준 commit 또는 release asset의 고정 URL
- 대상 저장소의 사용자 수정 diff
- 목표 upstream artifact가 `localization`을 제공하면 `.hyper-waterfall/version.json`의 현재 locale 기록, 요청 locale 또는 전환 요청, 목표 release locale 지원, locale 관련 artifact diff, locale 보존/전환 판단

판단 결과는 목표 upstream artifact의 update 판단 형식으로 먼저 보고한다. 승인 전에는 upstream artifact와 설치본 diff에 포함된 파일을 실제 대상 저장소에 적용하지 않는다.

## Hyper-Waterfall 버전 업데이트 PR

Hyper-Waterfall 버전 업데이트 PR은 일반 task PR과 같은 브랜치 흐름을 사용한다. 차이는 PR의 입력과 본문이다.

- 입력: 기존 업데이트 판단 결과, upstream artifact와 설치본 diff, locale 관련 artifact diff, locale 보존/전환 판단
- 본문: 목표 upstream artifact의 update PR 기준을 적용 저장소 `.github/pull_request_template.md` 설치본에 반영
- 추적: GitHub Issue, 수행계획서, 구현계획서, 단계 보고서, 최종 보고서

커밋 메시지 규칙:

- 단일 커밋: `Task #{N}: Hyper-Waterfall {fromVersion} -> {toVersion} 버전 업데이트`
- 단계 커밋: `Task #{N} Stage {S}: Hyper-Waterfall 버전 업데이트 {내용}`
- 최종 보고 커밋: `Task #{N}: 최종 보고서 작성과 오늘할일 완료 처리`

Hyper-Waterfall 버전 업데이트 PR 브랜치를 별도 prefix로 만들지 않는 이유는 작업 추적 기준을 GitHub Issue와 하이퍼-워터폴 산출물로 유지하기 위해서다. CLI나 자동화가 PR 후보를 만들더라도 먼저 판단 결과를 출력하고, 승인된 이슈 번호를 받은 뒤 `local/task{N}` -> `publish/task{N}` -> `devel` 규칙을 따른다.

## 관련 문서

- `git_workflow_guide.md`: 브랜치 흐름과 maintainer/contributor Git 명령.
- `framework_lifecycle_guide.md`: lifecycle 판단을 일반 task로 전환하는 기준.
- upstream v0.3.0 release: `https://github.com/postmelee/hyper-waterfall/releases/tag/v0.3.0`
- upstream commit `83836828a4da24385d0410515d35ee43946b981f`: `https://github.com/postmelee/hyper-waterfall/tree/83836828a4da24385d0410515d35ee43946b981f`
