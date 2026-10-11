{% if workflow.route not in ("oneshot", "full", "auto") %}{{ halt("workflow.route must be oneshot, full, or auto, not " ~ workflow.route) }}{% endif %}
{% if workflow.review not in ("none", "quick", "thorough", "auto") %}{{ halt("workflow.review must be none, quick, thorough, or auto, not " ~ workflow.review) }}{% endif %}
# Build New Preview Workflow

**Goal:** Turn user intent into a hardened, reviewable artifact.

**CRITICAL:** If a step directs you to another snapshot file, read it fully and follow it. No exceptions.

Subagents, when the capability is available, are an important part of this workflow. Use them as directed by the workflow steps.
If you need an explicit user instruction to run them, ask once now for the whole workflow run.

## SHARED APPROVAL POLICY

Read `{project-root}/mydocs/manual/agent_code_hyperfall_rule_conflict.md` and apply its shared risk policy at every checkpoint, including resumed and oneshot runs. A clear LOW/MEDIUM request delegates planning, implementation, validation, and review within its stated scope; checkpoints record readiness, not unconditional human waits. For HIGH risk, request approval only for the specific risky decision or action and its consequences, not routine stages. Genuine missing requirements block only dependent work. An explicit plan-only request stops after planning. This delegation never grants tool permissions or authorization to commit, publish, merge, close issues, or perform destructive operations.

## READY FOR DEVELOPMENT STANDARD

A plan is "Ready for Development" when:

- **Actionable**: Every task has a file path and specific action.
- **Logical**: Tasks ordered by dependency.
- **Testable**: All ACs use Given/When/Then, and each is a check the implementer can prove it met without pointing at code.
- **Complete**: No placeholders or TBDs.
- **Sufficient**: No known requirement, acceptance, dependency, or implementation gaps remain unresolved.
- **Coherent**: No unresolved ambiguities or internal contradictions.

## SCOPE STANDARD

A plan should stay focused on the requested goal, with detail proportional to impact and complexity:

- **Single goal**: One cohesive feature, even if it spans multiple layers/files. Multi-goal means >=2 **top-level independent shippable deliverables** — each could be reviewed, tested, and merged as a separate PR without breaking the others. Never count surface verbs, "and" conjunctions, or noun phrases. Never split cross-layer implementation details inside one user goal.
  - Split: "add dark mode toggle AND refactor auth to JWT AND build admin dashboard"
  - Don't split: "add validation and display errors" / "support drag-and-drop AND paste AND retry"
- **Lean by impact and complexity**: A small change needs a small actionable plan; cross-layer or high-impact changes need enough dependency, acceptance, and validation detail to remain safe. No token minimum, maximum, goal count, or route size forces approval or scope reduction. Preserve all requested goals; split only when necessary to resolve a genuine scope decision.

## Conventions

- Every operational cross-file reference in this workflow is an absolute snapshot path. Open it directly; do not resolve it relative to a skill directory.
- `{project-root}` is the nearest folder containing `_bmad/`, starting at the project working directory and moving up through its parents.
- `{active_initiative}` is the value printed by `uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key core.active_initiative`, read once before step 1. When it is unset, drop `/{active_initiative}` from every path.
- Whenever this workflow captures or records a version-control revision, obtain the full canonical identifier directly from version control and preserve it verbatim.

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

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for disciplined execution:

- **Micro-file Design**: Each step is self-contained and followed exactly
- **Just-In-Time Loading**: Only load the current step file
- **Sequential Enforcement**: Complete steps in order, no skipping
- **State Tracking**: Persist progress via plan frontmatter and in-memory variables
- **Append-Only Building**: Build artifacts incrementally

### Step Processing Rules

1. **READ COMPLETELY**: Read the entire step file before acting
2. **FOLLOW SEQUENCE**: Execute sections in order
3. **APPLY SHARED POLICY**: Continue at checkpoints within delegated scope; ask only for genuine missing requirements or specific risky decisions requiring approval
4. **LOAD NEXT**: When directed, read fully and follow the next step file

### Critical Rules (NO EXCEPTIONS)

- **NEVER** load multiple step files simultaneously
- **ALWAYS** read entire step file before execution
- **NEVER** skip steps or optimize the sequence
- **ALWAYS** follow the exact instructions in the step file
- **ALWAYS** apply the shared approval policy at checkpoints and honor explicit stop boundaries

## FIRST STEP

Read fully and follow: `{{ rendered("step-01-clarify-and-route.md") }}` to begin the workflow.
