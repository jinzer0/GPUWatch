---
diff_file: '' # set at runtime: path to the diff file
claims_file: '' # set at runtime (path or empty)
plan_file: '' # set at runtime (path or empty)
review_mode: '' # set at runtime: full or no-plan
---

# Step 1: Gather Context

## RULES

- The triggering prompt and the conversation before it name the review target — act on them; do not start from a blank slate.
- Writing `{diff_file}` and the claims file is the only change this step may make. Otherwise it is read-only.
- Read `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md`. Capture whether the user delegated implementation/fixes and the exact scope; a review request alone does not authorize mutation in later steps.

## INSTRUCTIONS

1. **Find the review target.** Check in this order and stop at the first that identifies it:
   - **Request or recent conversation.** A PR (resolve via `gh pr view`; if that fails, ask for a SHA or branch), commit, branch, commit range, staged or uncommitted changes, a provided diff or file list, or a plan file. A plan sets `plan_file`; a non-empty frontmatter `baseline_revision` other than `NO_VCS` makes the diff source the **plan baseline** — otherwise say so and continue, since a plan without one does not identify the diff.
   - **The ticket tree.** Run `uv run {project-root}/_bmad/method/scripts/tickets.py --project-root {project-root} status`. On a non-zero exit, continue. Otherwise offer the `tickets` rows whose `state` is `review`, `<ref>` and `<title>` each, plus a choice of another target, and HALT for the user's pick. With none, or another target chosen, continue. For a picked ticket, run `tickets.py find <ref>` (same command form) and treat its `plan` as a plan file from the request.
   - **Current git state.** If HEAD is not on the default branch, confirm: "I see HEAD is `<short-sha>` on `<branch>` — do you want to review this branch's changes?" If confirmed, it is a branch diff against the default branch.
   - **Ask.** Go to instruction 2.

2. Only if the review target remains unresolved, ask the user what to review: uncommitted changes, staged changes, a branch diff (which base), a commit range, or a provided diff or file list. Wait for that missing target; otherwise proceed directly.

3. Write the diff to `{diff_file}`, a uniquely-named temp file outside the repository, so concurrent reviews cannot collide. A plan baseline diffs every change since `baseline_revision`, untracked files included. A branch diff runs from the merge-base (`<base>...HEAD`), so later commits on the base do not show up as reverted. For a file list, include untracked files. If the source does not resolve, HALT and ask for a valid one; if the diff is empty, HALT — there is nothing to review. The review lenses read that file; the diff text is never pasted into their prompts. Read `{diff_file}` yourself when you need the diff later in this workflow.

4. **Stage the claims file.** Collect the change's own narrative: for a plan baseline, branch diff, or commit range, the commit messages it covers (`git log <base>..<head>`, where a plan baseline's head is `HEAD`); for other sources, whatever description of the change the user or conversation supplied. Write it verbatim to another uniquely-named temp file outside the repository and set `claims_file` to its path, or `''` if there is none. Do not analyze or summarize it — it is input for one review lens, staged as a file so the other lenses never see it.

5. **Set the plan context.**
   - The request or conversation explicitly says there is no plan → `review_mode` = `no-plan`, `plan_file` = `''`. Do not ask.
   - `plan_file` is set → verify it is readable; `review_mode` = `full`.
   - Otherwise, use `review_mode` = `no-plan`, `plan_file` = `''` and note that no plan was supplied. Ask only when missing plan context creates a genuine requirement or scope ambiguity that prevents a correct review.

6. If `review_mode` = `full` and `{plan_file}`'s frontmatter has a `context` list, load each referenced doc and warn about any that cannot be found.

7. If `{diff_file}` exceeds about 3000 lines, note its size and split processing into file groups when needed, preserving coverage of the requested target. Record groups and remaining coverage; do not require confirmation merely for review organization.

### CHECKPOINT

Present a summary before proceeding: diff stats (files changed, lines added/removed), `{review_mode}`, loaded plan/context docs (if any), and delegated fix scope (or read-only). This is a non-blocking checkpoint; proceed without confirmation when the target and scope are clear.

## NEXT

Read fully and follow `{{ rendered("step-02-review.md") }}`
