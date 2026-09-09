# PR publication과 링크 가이드

## 목적

내부 task PR의 게시와 생성은 [`task-final-report`](../skills/task-final-report/SKILL.md)만 사용한다. 이 문서는 PR 본문의 SHA 고정 링크 형식과 publication 검증 기준만 정의하며, 직접 `git push`, `gh pr create`, `/tmp` body file 예시를 제공하지 않는다. release-specific 예외는 release 문서에서 승인된 경우에만 별도로 따른다.

## 내부 task publication 경계

`task-final-report`는 두 번 멈춘다.

- final report/evidence 승인: 최종 보고서와 오늘할일 commit, report/orders blob OID, acceptance evidence SHA-256을 묶는다. 이 승인 전에는 publication input을 만들지 않는다.
- publication 승인: canonical repository, `devel` OID, final commit OID, `publish/task{번호}`, PR title/body hash, publication state를 묶는다. 이 승인 전에는 원격 mutation을 하지 않는다.

publication state는 `branch-absent-pr-absent`, `branch-exact-pr-absent`, `branch-exact-pr-exact`만 허용한다. 기존 publish branch가 다른 OID를 가리키거나, Open PR의 base/head/repository/title/body가 exact 값과 다르면 재승인이 필요하다.

PR title은 target issue REST 응답에서 읽은 live title로 만든 정확한 `Task #N: <live issue title>` 한 줄이다. PR body에는 target issue를 닫는 독립 줄 `Closes #N`이 있어야 한다. 이 줄은 publication 뒤 mandatory read-only GraphQL `closingIssuesReferences` query로 다시 확인한다. GitHub GraphQL 호출은 HTTP POST transport를 쓰지만 mutation이 아니라 read-only query다.

## PR 본문 문서 링크 규칙

계획서, Stage 보고서, 최종 보고서는 승인된 final commit OID를 사용한다.

```text
https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/...
```

`publish/task{번호}` branch가 삭제된 뒤에도 링크가 유지된다.

## 작업 문서 링크 형식

변경 내역의 작업 문서는 raw URL이 아니라 `[파일명](URL)` 형식을 사용한다.

```md
- 수행 계획서: [task_m010_61.md](https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/plans/task_m010_61.md)
- 구현 계획서: [task_m010_61_impl.md](https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/plans/task_m010_61_impl.md)
- 최종 보고서: [task_m010_61_report.md](https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/report/task_m010_61_report.md)
```

Stage별 요약은 Stage 제목을 단계 보고서로, 짧은 commit SHA를 commit URL로 링크한다.

```md
- **[Stage 1](https://github.com/jinzer0/GPUWatch/blob/{final_commit_oid}/mydocs/working/task_m010_61_stage1.md)** ([abc1234](https://github.com/jinzer0/GPUWatch/commit/{stage1_sha})): {Stage 1 한 줄 요약}
```

## 금지

- task-final-report 밖의 직접 `git push` 또는 `gh pr create`
- ambient repository/host, `/tmp` 또는 `--body-file` handoff
- 상대 링크, `blob/publish/task{번호}/...`, raw URL
- `--fill`을 기본 PR 본문 방식으로 사용
- first final report/evidence 승인만으로 publication을 시작하는 행위
- 세 publication state 밖의 branch/PR 상태를 추정해 재개하는 행위
