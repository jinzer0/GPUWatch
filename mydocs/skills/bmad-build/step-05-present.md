{% if workflow.route != "oneshot" %}
---
---

# Step 5: Present

## RULES

- NEVER auto-push.
- Follow the shared risk policy at [{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md]({project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md). Evidence-backed presentation within approved scope needs no routine human wait. HIGH actions require an exact explicit human decision; assess impact, reversibility, security, data, and external consequences, not file count or token length.
- Do not change publication, merge, or release permissions. A completion hook is not authorization for a commit or a HIGH action. Preserve user changes; a dirty tree is not grounds to reset/discard files.

## INSTRUCTIONS

### Mark Plan Built

Change `{plan_file}` status to `built` in the frontmatter only when required implementation, verification, and review are complete. Otherwise record `blocked`, the unresolved required action, and its evidence; present that status without claiming completion. Safe independent work may proceed.

### Commit and Complete

Only if explicitly authorized to commit, version control is available, and reviewed changes remain uncommitted, create a local commit limited to the authorized reviewed files, using the repository's commit convention. Otherwise leave the reviewed changes uncommitted; this does not prevent completion. Never include unrelated user changes or reset/discard files to obtain a clean tree.

{{ workflow.open_plan }}

### Display Summary

Display a very short completion summary — one or two sentences — including:

- What changed.
- The verification and review result, including whether anything was deferred.
- The commit hash, if one was created.

Do not list changed files, repeat details from the plan, or narrate the process unless the user asks.

Offer applicable next actions in one short line: when version control and a remote are available, create a pull request (and push first if needed); use `bmad-walkthrough`; or make another change.

Workflow complete.

## On Complete

If anything appears below, follow it as the final terminal instruction before exiting; otherwise exit normally.

{{ workflow.on_complete }}
{% endif %}
