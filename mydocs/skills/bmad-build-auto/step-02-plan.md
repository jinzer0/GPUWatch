# Step 2: Plan

## RULES

- No routine human interaction: plan and repair autonomously within approved scope under the shared risk policy at [{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md]({project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md). HIGH actions require an exact explicit human decision; unattended execution must never supply that decision itself. Record the risky action, consequences, and missing authorization as blocked in `{plan_file}`. Safe independent work may continue; HALT with status `blocked` when required progress depends on the decision.
- Escalate only unresolved core requirements, repeated failures that prevent necessary progress, true blockers, or out-of-scope decisions. Record the evidence and affected work; do not expand scope to resolve them. Continue safely separable in-scope analysis, tests, and evidence gathering before halting on the dependent work.

## INSTRUCTIONS

1. Draft resume check. If `{plan_file}` exists with `status: draft`, read it and capture the verbatim `<intent-contract>...</intent-contract>` block as `preserved_intent_contract`. Otherwise `preserved_intent_contract` is empty.
2. Investigate codebase. _Read the code yourself for narrow, localized tasks. Isolate deep exploration in synchronous subagents: instruct them to give you distilled summaries only, and plan from those summaries._ Decide which findings actually matter for execution — the specific files, symbols/lines, reuse points, and read-only constraints — and carry those forward for the Code Map. This is where the investigation lands: the plan preserves it so it is never re-narrated to the implementer at dispatch time.

   Then score the change's `risk` for `{plan_file}` frontmatter: `low`, `medium`, or `high`, based on impact, reversibility, security, data, and external consequences if the change is wrong — never file count or token length. For a ticket from the tree, start from `risk` in `tickets.py find`'s output and raise it when the investigation shows more; never go below it. Identify specific HIGH actions and their exact required human decisions; the plan, ticket, risk score, or unattended invocation is not authorization to perform them.
{% if workflow.route == "oneshot" or workflow.route == "full" %}
3. The route is `{{ workflow.route }}`; `route_source` is `pinned`.
{% else %}
3. {{ workflow.route_selection }}

   `route_source` is `auto`.
{% endif %}
4. Read `{{ rendered("plan-template.md") }}` fully, preserving all frontmatter fields and resolving `date` to the current system date.
   - **Oneshot:** set `route: 'oneshot'`.
   - **Full:** set `route: 'full'`. Put what you learned into `## Code Map`: paths, symbols or lines, what to reuse, and what not to change. The subagent should be able to work from the plan without being told any of it again.

   Set `route_source` from step 3 and `risk` from step 2.

   If `{preserved_intent_contract}` is non-empty, substitute it for the `<intent-contract>` block before writing `{plan_file}`. Self-check against the route's READY FOR DEVELOPMENT standard.
5. Multiple defensible readings of a core requirement that lead to observably different outcomes, with nothing in the intent to select between them, are an intent gap — do not resolve one by picking a reading. Record the unresolved questions, evidence, and dependent work in `{plan_file}` without modifying a preserved `<intent-contract>`. Block only work that depends on the answer; continue safely separable in-scope analysis, tests, and evidence gathering. When necessary progress depends on the answer, HALT with status `blocked`, blocking condition `intent gap`, and include the unanswered questions and evidence gathered. Do not mark the complete plan ready while a core requirement remains unresolved.
6. Warning check. If step-01 carried `multiple-goals`, add it to `{plan_file}` frontmatter `warnings`. If `{plan_file}` exceeds 1600 tokens, add `oversized` to frontmatter `warnings`. Continue either way.

### READY-FOR-DEVELOPMENT GATE

Re-read `{{ rendered("workflow.md") }}`, then re-read `{plan_file}` from disk and verify the plan meets the READY FOR DEVELOPMENT standard.

- **For every route, including pinned or auto-selected oneshot:** before any HIGH action is executed or delegated, verify the exact explicit human decision covering that action and consequences. Route selection and readiness never authorize it. Record missing authorization and block the dependent action; continue only safely independent in-scope work, then HALT with status `blocked` when necessary progress depends on the decision.
- **If the file is missing:** HALT with status `blocked` and blocking condition `plan file disappeared before implementation`.
- **If the plan meets the standard:** set `{plan_file}` frontmatter status to `ready-for-dev`. If the invocation prompt directs a halt after planning (standard phrasing: `Halt after planning.` — accept any clear equivalent), HALT with status `ready-for-dev`; otherwise continue to step 3.
- **If the plan does not meet the standard:** repair it once, then re-read it from disk and verify again. If it now meets the standard, apply the **If the plan meets the standard** handling above, including the halt-after-planning check. If it still does not meet the standard, HALT with status `blocked`, blocking condition `plan failed ready-for-development standard`, and include the failing criteria and evidence gathered.

## NEXT

Read fully and follow `{{ rendered("step-03-implement.md") }}`
