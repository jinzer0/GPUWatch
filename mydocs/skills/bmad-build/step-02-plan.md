# Step 2: Plan

## RULES

- Apply the shared approval policy in `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md`. No intermediate or unconditional plan approvals.
- Reuse the selected BMAD/Hyper-Waterfall plan as the sole source of scope, acceptance, implementation, and evidence. Adapt workflow metadata in place; do not replace existing content with a duplicate template artifact.
- **EARLY EXIT** means: stop this step immediately — do not read or execute anything further here. Read and fully follow the target file instead. Return here ONLY if a later step explicitly says to loop back.

## INSTRUCTIONS

1. If `{plan_file}` exists, read it and preserve its scope, acceptance intent, revision/evidence records, and verbatim `<frozen-after-approval>...</frozen-after-approval>` block as `preserved_intent`. Do not silently rewrite locked intent. Otherwise `preserved_intent` is empty.
2. Investigate the codebase. When you can, send deep searches to subagents and wait for them in this turn. Tell them to return short summaries only. Keep only the specific files, symbols or lines, what to reuse, and what not to change. Record that in the Code Map; implementation reads the plan rather than a repeated investigation dispatch.

   Resolve uncertainty from the repository, existing planning artifacts, or history first. Record any genuine requirement choice those sources cannot settle as an Open Question; do not turn it into an assumption. Independent investigation and planning can continue while an answer is pending.

   Score `risk` for `{plan_file}` frontmatter: `low`, `medium`, or `high`, based on business impact if the change is wrong and the shared policy. For a ticket from the tree, start from `risk` in `tickets.py find`'s output and raise it when investigation shows more; go below it only when the user says so. Record the reason and the specific risky decision/action, if any. Write `risk` wherever this step writes `{plan_file}`.
3. Select a lean route according to impact, complexity, dependencies, and validation needs, not token count or file count. Route choice never supplies approval or bypasses the shared policy.
{% if workflow.route == "oneshot" %}
   Set `route: 'oneshot'` and `route_source: 'pinned'`. A pinned oneshot still requires adequate planning and the same HIGH-risk decision approval as full.
{% elif workflow.route == "full" %}
   Set `route: 'full'` and `route_source: 'pinned'`.
{% else %}
   Use these configured routing guidelines only when consistent with the shared policy and the impact/complexity rule above:

   {{ workflow.route_selection }}

   Set `route` to the selected route and `route_source: 'auto'`. Size thresholds in configured guidance are heuristics, never approval gates or permission to drop scope.
{% endif %}
4. Read `{{ rendered("plan-template.md") }}` fully as structure guidance. For a new plan, fill it from intent and investigation, resolving `date` to the current system date. For an existing plan, retain its structure and evidence and add only missing actionable planning detail and workflow metadata. Set `status: 'draft'`. Include tasks, dependencies, observable acceptance criteria, validation, and a Code Map proportionate to the change. If `preserved_intent` is non-empty, preserve it verbatim. Never write an unsupported intent gap into the frozen block as an assumption. Write to `{plan_file}`.
5. Self-review against READY FOR DEVELOPMENT standard. Resolve repository-answerable gaps yourself. For a genuine human decision, record an `## Open Questions` entry with options, consequences, and which work depends on the answer. Ask those questions without an unrelated plan-approval request. Incorporate the human's answers as decisions, respecting existing frozen intent; only the human may authorize changes to that intent. Remove resolved entries and delete an empty section. Block only dependent work; do not mark the entire plan ready while requirement gaps remain.
6. Keep the plan as lean as its impact and complexity allow. Token count, multiple requested goals, and route size never force an approval, split, or scope reduction. If splitting is genuinely necessary, resolve only that scope decision and retain explicit continuity with deferred work in the existing plan source.

### CHECKPOINT 1

Re-read `{plan_file}` from disk before changing readiness or proceeding. If it is missing, HALT without recreating it or changing status. If externally edited, acknowledge the edits, preserve evidence, and re-check scope, acceptance, risk, and readiness against the updated version. Changed risky decisions invalidate only approvals that depended on them.

Present a concise summary with the plan path, `risk`, its reason, and any unresolved requirement or risky decision. Questions, plan review, and elicitation remain available but are not mandatory waits.

- **Clear LOW/MEDIUM within delegated scope:** when Open Questions is empty and the readiness standard is met, automatically set `status: 'ready-for-dev'`, record the delegated scope/readiness decision, and continue. Do not ask for another plan approval.
- **HIGH:** obtain or verify explicit approval for the specific risky decision/action and its consequences under the shared policy. Reuse valid approval already recorded for that same decision; never request approval merely for the route or routine planning stage. Until it is resolved, hold that dependent action, while safe independent work may continue. Set `ready-for-dev` only when the plan's outstanding requirements and necessary risky decisions are resolved.
- **Explicit plan-only or stop-after-planning request:** stop at this boundary without implementation. A complete, sufficiently authorized plan can be left `ready-for-dev`; otherwise preserve `draft` and name the unresolved decisions. Do not ask the user to approve implementation they did not request.

On readiness, everything inside `<frozen-after-approval>` is locked; only the human can change scope or acceptance intent. The marker name does not imply an extra approval gate.

## NEXT

If requirements or necessary risky decisions still block readiness, do not dispatch dependent implementation. Record any explicitly identified independent tasks whose requirements, acceptance, and authorization are settled; only those tasks may proceed while the plan remains `draft`. If none are safe to proceed, wait for the specific missing decision. Otherwise, unless a requested stop boundary applies, read fully and follow the selected route:
{% if workflow.route == "oneshot" %}
`{{ rendered("step-oneshot.md") }}`.
{% elif workflow.route == "full" %}
`{{ rendered("step-03-implement.md") }}`.
{% else %}
For `route: 'oneshot'`, `{{ rendered("step-oneshot.md") }}`; otherwise `{{ rendered("step-03-implement.md") }}`.
{% endif %}
