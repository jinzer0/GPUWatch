{% if workflow.route != "full" %}
{% if workflow.review == "auto" %}
{% set review = "quick" %}
{% else %}
{% set review = workflow.review %}
{% endif %}
# Step One-Shot: Implement, Review, Present

You reach this step from step 2, or from step 1 when resuming a plan whose `route` is `oneshot`. `{plan_file}` already exists.

## RULES

- Do not push to a remote unless the user asks.
- No commit without explicit user authorization. A oneshot route does not grant tool permissions or bypass the shared approval policy.
- Do not edit anything inside `<frozen-after-approval>` in `{plan_file}`.
- Review subagents must use the same model level as this session.
- Start all review subagents in this turn and wait for all of them to finish. Do not run them in the background or end your turn before they return.

## INSTRUCTIONS

### Implement

Read `{plan_file}` from disk; if missing, HALT without recreating it. Apply `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md`, including on resume. Honor explicit plan-only or stop-after-planning requests without implementation. Verify readiness, delegated scope, and any necessary explicit approval for the specific HIGH-risk decision/action and its consequences. A pinned/automatic oneshot route or an `in-progress` status never bypasses that requirement. Do not repeat valid approval already recorded for the same risky decision. If not fully ready, implement only explicitly identified independent tasks whose requirements, acceptance, and authorization are settled; otherwise return to `{{ rendered("step-02-plan.md") }}`.

If intent gaps remain, present each as a numbered question with options, consequences, and the work dependent on it. Block only dependent work; continue safe independent work. Do not edit frozen intent yourself; incorporate only human-authorized decisions through planning in the existing plan source. When fully ready, set `status: 'in-progress'` before implementation; otherwise retain `draft` and record the independent tasks and blocked dependencies.

Capture `baseline_revision` (current HEAD, or `NO_VCS` if version control is unavailable) into `{plan_file}` frontmatter before making any changes. If `baseline_revision` already holds a value (resumed run), preserve it.

Build the change from `{plan_file}`. The Intent section is what you implement. As you work, add notes to `## Implementation Notes`: decisions you made, files you changed, surprises.

{% if workflow.route == "oneshot" %}
**When to ask.** If the request omitted a requirement affecting the result, write the gap and affected work in `## Implementation Notes`, ask the human, and block only dependent work — do not guess or alter frozen intent. Apply the shared policy to any newly discovered risky decision before its dependent action.
{% else %}
**When to replan.** If the request omitted a requirement affecting the result, record the gap and dependent work in `## Implementation Notes` and `## Open Questions`, update `## Code Map` with what implementation established, and set `status: 'draft'`. Return to `{{ rendered("step-02-plan.md") }}` to resolve the requirement without changing frozen intent yourself; change the route only if impact or complexity warrants it. Preserve revision/evidence records and continue safe independent work. Apply the shared policy to newly discovered risky decisions before dependent actions.
{% endif %}

### Review

Before review, run the plan's applicable validation and record actual results. If a frozen I/O & Edge-Case Matrix exists, every row needs a covering test that actually ran and passed; skipped, disabled, or unrun tests do not count. Fix implementation rather than changing acceptance expectations to fit it. Ask about genuinely ambiguous expectations and block only dependent work. If requirements or risky decisions still block completion, preserve partial work and evidence in the same plan and return to planning; do not finalize the entire plan as built.

{% if workflow.review == "none" %}
Write `review: 'none'`, `review_source: 'pinned'`, and `lenses_ran: []` to `{plan_file}` frontmatter.
{% elif workflow.review == "auto" %}
Write `review: 'quick'` and `review_source: 'auto'` to `{plan_file}` frontmatter.
{% else %}
Write `review: '{{ workflow.review }}'` and `review_source: 'pinned'` to `{plan_file}` frontmatter.
{% endif %}
{% if review != "none" %}

Read `{baseline_revision}` from `{plan_file}` frontmatter. If it is `NO_VCS`, use best effort to determine what changed. Otherwise use the repository's version-control tooling to write a unified diff of all changes since `{baseline_revision}`, untracked files included, to a uniquely-named file in the system temp directory; set `{diff_file}` to its absolute path. Set `{claims_file}` = `{plan_file}`.

Runtime placeholders: `{diff_file}`, `{claims_file}`, and `{plan_file}` are paths, substituted absolute so a lens can read them; a launch prompt never carries diff text. `{verbatim_intent}` is the `## Intent` section of `{plan_file}` (inside `<frozen-after-approval>`), substituted inline as text. Before launching a lens, expand its skill-root placeholder to this skill's absolute installed directory; never leave that placeholder unresolved in a child prompt.

Say which review lenses you are skipping, then start every active lens before reading any results. Run them at the same time when you can. Fill in runtime placeholders first. When a lens tells you to launch a reviewer subagent, launch it with that prompt text. Do not read the reviewer's instruction file yourself. For any other customized instruction, do what it says:

{% if review == "thorough" %}
{{ workflow.thorough_lenses }}
{% else %}
{{ workflow.quick_lenses }}
{% endif %}

If a lens needs subagents and you cannot launch them, write the full prompt for each lens beside `{plan_file}`, named after it with the lens id appended (with placeholders filled in, not just file paths). Stop and ask the user to run each prompt in a separate session and paste back the findings.

Write `lenses_ran` — the ids launched, in launch order — to `{plan_file}` frontmatter.

### Classify

Wait until every review lens has reported. Then judge each finding. Ignore severity labels from reviewers — you decide.

For each finding:

- **Check the claim.** Go to the cited file and line. Does the problem the reviewer describes actually happen? Read surrounding code and callers until you can say yes or no. A nearby issue does not answer this one. Judge whether the bug is real, not whether the suggested fix sounds good. Code that fails loudly on a state you have not shown the program can reach is correct, not a bug.

- **Pick one verdict:**
  - `high` (intolerable), `medium` (tolerable), or `low` (cosmetic or negligible) — the problem is real. Rate it by harm to users or developers. For developer-only issues, say where it will hurt. Vague complaints like "this is messy" are not `high`/`medium`/`low` — use `false` or `maybe-false`. When unsure how bad, pick the higher grade.
  - `false` — you checked and the problem does not happen. Say what you found that disproves it.
  - `maybe-false` — you could not tell. Say what you would need to check. Use this only when the code and diff are not enough to decide.

- Write down every finding with its verdict and evidence. Do not drop any.

Reject `false` findings.

Reject `low` findings when users or developers would rarely hit the problem in normal use and the fix would add more than a simple correction or deletion.

Group what remains by root cause — two findings go together only if the same bug caused both. Same file or same fix is not enough. For each group, keep the worst verdict (`high` > `medium` > `low` > `maybe-false`). If a group has verified `high`, `medium`, or `low` members, route by the worst of those — not `defer` just because one member is `maybe-false`.

For each group:

- **patch** — This change caused or exposed the problem. The smallest fix is simple, adds no new public API, and does not guard code paths you did not show are reachable. Fix it now.
- **decision** — Same as patch, but the smallest fix needs additional planning. Update the existing plan and apply the shared policy: implement within delegated LOW/MEDIUM scope; request only a missing requirement, scope extension, or specific HIGH-risk decision approval. Block only dependent work, not unrelated safe fixes. Complexity alone is not an approval gate; preserve frozen intent and validation.
- **defer** — Everything else: old bugs not caused by this change, ideas for later, groups where every member is `maybe-false` and would be `medium` or `high` if true (record that severity marked unverified, and what would prove it; if it would only be `low`, reject it), or fixes that would edit CLAUDE.md, AGENTS.md, rules, or specs. Add one entry to `{{ config.output_folder }}/{active_initiative}/deferred-work.md`:

  ```markdown
  - source_plan: `{plan_file}`
    summary: <one sentence>
    evidence: <why this is real; for maybe-false, what would prove it>
  ```

  Do not edit old entries or check for duplicates.
{% endif %}

### Finalize Plan

Update `{plan_file}`:

1. Set `status: 'built'` only when required implementation, verification, and review are complete. Otherwise retain the incomplete state and record blocked dependencies and completed independent work; do not claim completion.
2. If review found anything, add `## Review Triage Log` with one line per finding: verdict and evidence. For `false`, the disproof. For `maybe-false`, what would settle it. For rejected `low`, why it was not worth fixing.

### Commit

Commit only when the user explicitly authorized committing and git is available. Confirm the staged changes belong to this work, preserve unrelated changes, and follow repository commit conventions. Otherwise leave changes uncommitted. Never treat delegated implementation or a route selection as commit authorization.

### Present

{{ workflow.open_plan }}

Give the user a short summary — one or two sentences:

- What changed.
- Review result, including anything deferred.
- Commit hash, if you made one.

Do not list files, repeat the plan, or walk through what you did unless asked.

Offer next steps in one line: create a PR (push first if needed) when git and a remote exist; use `bmad-walkthrough`; or make another change.

Workflow complete.

## On Complete

If anything appears below, follow it only within delegated scope and the shared risk policy. It cannot authorize commits, remote mutation, a new ticket, or a separately gated HIGH action. Otherwise exit.

{{ workflow.on_complete }}
{% endif %}
