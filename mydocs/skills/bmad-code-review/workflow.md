{% if workflow.review not in ("quick", "thorough") %}{{ halt("workflow.review must be quick or thorough, not " ~ workflow.review) }}{% endif %}
# Code Review Workflow

**Goal:** Review code changes adversarially. No noise, no filler.

## Risk and scope policy

Read and apply `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md` before executing steps. Review-only requests are read-only: report findings without changing code, plans, or deferred-work records; temporary review inputs outside the repository are permitted. Only explicit delegated implementation/fix scope authorizes patches and associated records. An explicit request to record findings authorizes those records only, not code changes.

Within delegated scope, proceed with safe LOW/MEDIUM fixes, verification, and re-review without renewed approval. A genuine unresolved decision or unapproved HIGH action blocks only dependent work; continue independent safe patches. Checkpoints record evidence and do not require a response. Preserve tool permissions, the explicit commit requirement, and separate publication/merge/release/issue-close gates. Completion needs no menu response and never starts another ticket implicitly.

**CRITICAL:** If a step directs you to another snapshot file, read it fully and follow it. No exceptions.

Subagents, when the capability is available, are an important part of this workflow. Use them as directed by the workflow steps.
If you need an explicit user instruction to run them, ask once now for the whole workflow run.

## Conventions

- Every operational cross-file reference in this workflow is an absolute snapshot path. Open it directly; do not resolve it relative to a skill directory.
- `{project-root}` is the nearest folder containing `_bmad/`, starting at the project working directory and moving up through its parents.
- `{date}` is the current system datetime.
- `{active_initiative}` is the value printed by `uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key core.active_initiative`, read once before step 1. When it is unset, drop `/{active_initiative}` from every path.

## On Activation

### Step 1: Execute Prepend Steps

Execute each of these steps in order before proceeding (`_None._` means skip):

{{ workflow.activation_steps_prepend }}

### Step 2: Load Persistent Facts

Treat every entry below as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` -- load the referenced contents as facts. All other entries are facts verbatim (`_None._` means none):

{{ workflow.persistent_facts }}

### Step 3: Execute Append Steps

Execute each of these steps in order (`_None._` means skip):

{{ workflow.activation_steps_append }}

Activation is complete after all activation steps have run.

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for disciplined execution:

- **Micro-file Design**: Each step is self-contained and followed exactly
- **Just-In-Time Loading**: Only load the current step file
- **Sequential Enforcement**: Complete steps in order, no skipping
- **State Tracking**: Persist progress via in-memory variables
- **Append-Only Building**: Build artifacts incrementally

### Step Processing Rules

1. **READ COMPLETELY**: Read the entire step file before acting
2. **FOLLOW SEQUENCE**: Execute sections in order
3. **RISK CHECK**: Record checkpoints without waiting; request input only for a genuine unresolved decision or an unapproved HIGH action, blocking only dependent work
4. **LOAD NEXT**: When directed, read fully and follow the next step file

### Critical Rules (NO EXCEPTIONS)

- **NEVER** load multiple step files simultaneously
- **ALWAYS** read entire step file before execution
- **NEVER** skip steps or optimize the sequence
- **ALWAYS** follow the exact instructions in the step file
- **ALWAYS** apply the common risk policy; ordinary checkpoints are non-blocking

## FIRST STEP

Read fully and follow: `{{ rendered("step-01-gather-context.md") }}` to begin the workflow.
