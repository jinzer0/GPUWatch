# PR 생성과 링크 가이드

## 목적

내부 task PR의 게시와 생성은 [`task-final-report`](../skills/task-final-report/SKILL.md)만 사용한다. 이 문서는 PR 본문의 SHA 고정 링크 형식만 정의하며, 직접 `git push`, `gh pr create`, `/tmp` body file 예시를 제공하지 않는다.

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
