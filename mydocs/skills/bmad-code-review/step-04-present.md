---
deferred_work_file: '{{ config.output_folder }}/{active_initiative}/deferred-work.md'
---

# Step 4: Present and Act

## RULES

- Apply `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md`. A review-only request is read-only: present findings, but do not modify code, plans, or deferred-work records without delegated implementation/fix or recording scope.
- Within delegated implementation/fix scope, automatically apply safe LOW/MEDIUM patches, verify, and re-review without asking again.
- A genuine `decision-needed` finding or unapproved HIGH action blocks only dependent patches. Independent safe patches may continue; do not guess the user's decision or expand scope.
- Never change a plan's `status`. The build leaves it at `built`; only the user marks a ticket done.
- Preserve tool permissions, the explicit commit requirement, and separate publication/merge/release/issue-close gates.

## INSTRUCTIONS

### 1. Clean review shortcut

If zero findings remain after triage (all rejected or none raised), state that. When recording is authorized and `{plan_file}` is set, still write section 2's block with the summary line and `Rejected` appendix. Then proceed to section 6 (Completion).

### 2. Record or list findings

For a read-only review, list the findings in the response only. Skip all repository writes in this section. A supplied plan provides context, not permission to mutate it.

When recording is authorized and `{plan_file}` is set, append a block to its `## Code Review` section, creating that section at the end of the file when absent. The block opens with `### {date}` and the summary line from section 3, then findings, then the `Rejected` appendix. Write all findings in this order:

1. **`decision-needed`** findings (unchecked):
   `- [ ] [Review][Decision] <Title> — <Detail>`
2. **`patch`** findings (unchecked):
   `- [ ] [Review][Patch] <Title> [<file>:<line>]`
3. **`defer`** findings (checked off, marked deferred):
   `- [x] [Review][Defer] <Title> [<file>:<line>] — deferred: <pre-existing, or for maybe-false the evidence that would settle it>`

When recording is authorized, also append each `defer` finding to `{deferred_work_file}` under `## Deferred from: code review ({date})`. If `plan_file` is set, include its basename in the heading (e.g., `code review of story-digest-delivery-plan (2026-03-18)`). One bullet per finding with description.

### 3. Present summary

> **Code review complete.** <D> `decision-needed`, <P> `patch`, <W> `defer`, <R> rejected.

The `Rejected` appendix is one line per rejected finding: `false` with its refutation, `low` with why it was not worth fixing.

State where findings were actually recorded, or that they are listed in the response only. Do not claim persistence when the review was read-only.

### 4. Identify decision dependencies

For each genuine `decision-needed` finding, present its detail, available options, and the patches that depend on the decision. For an unapproved HIGH action, name the decision, target, impact, alternatives, and scope requiring explicit approval. Reuse a recorded approval only when it covers the same decision and current target/scope.

In a read-only review, report these decisions as findings; resolving them is not a prerequisite for completing the review. With delegated fixes, request the missing decision/approval and leave dependent actions blocked, but continue section 5 for independent safe patches. Do not require a numbered-only response or wait before doing independent work.

If the user explicitly defers an item, record their supplied reason when recording is authorized; a missing one-line rationale does not create a new approval gate. Never apply deferred or unresolved decision-needed items.

### 5. Handle `patch` findings

If implementation/fixes were not delegated, present patch recommendations only and proceed to completion. Do not mutate the repository or demand a menu selection to complete a review-only request.

Within delegated scope, apply all safe LOW/MEDIUM patches not dependent on unresolved decisions. Do not ask for per-finding or batch reapproval. Leave scope-exceeding patches and unapproved HIGH actions blocked with their required decision/authority; continue independent safe fixes.

After applying patches, run relevant verification and re-review the changed surfaces. Fix failures attributable to the patches within scope and verify again. Escalate repeated failures or unresolvable blockers; never mark failed verification as complete. Respect explicit user constraints on verification and report skipped checks rather than claiming success.

Summarize changes and actual verification results. When recording is authorized and `{plan_file}` is set, check off only patches that were applied and verified, leaving unresolved items unchecked and defer items as-is.

### 6. Completion

Report applied/recommended patches, verification performed or skipped, deferred/rejected findings, and remaining decision/approval blockers. A review-only run is complete once findings are presented; delegated fixes are not complete while required patches or verification remain blocked.

No menu response is required. Stop after the report and terminal instructions below; do not silently launch a new ticket, build, or follow-up workflow. A requested re-review of delegated fixes stays within this run, not a new ticket.

## On Complete

If anything appears below, follow it as the final terminal instruction only within delegated scope and the common risk policy; it cannot implicitly authorize another ticket, mutation in a read-only review, or a separately gated action. Otherwise exit normally.

{{ workflow.on_complete }}
