# anchored v3 — add-ons 2: keeping the user oriented (the build-escalation policy)

> A second add-on batch, on the UX axis: **help the user work faster without losing
> oversight.** Decided 2026-06-15. Captures the design for a user-defined escalation policy
> that governs the autonomous build. Build on a branch off `v3-add-ons` (or its successor).

## The driving principle

anchored exists to let the user delegate the *how* and keep control of the *what* — without
the feeling of losing the thread. Control is **not** "approve everything"; it is:

1. **be in the loop on the few things that matter** — high-stakes, irreversible, off-intent — and
2. **be able to reconstruct the rest in seconds** (a readable trail, not reading the code).

We already serve this with: a recommendation + implications on every question, the
priority-threshold / `conditions` walk, the build `stop`-conditions, and the audit trail. This
add-on sharpens the **input side** — *when* the AI pulls the user in during the long autonomous
build — into one clean, user-defined policy.

## The decision — a build-escalation policy

**The user freely defines, in their own words, when anchored should pull them in during the
build.** This is the `conditions` mechanism (the topic filter) elevated to a standing policy
for the whole build run.

### When it is asked — once, during plan
- The escalation-policy question is a **plan-stage** question (the build is where oversight
  loss is feared; the policy is set before it starts).
- It fires **once per plan**, at the **tier being planned**:
  - planning an **epic** → asked at the **epic plan**; it governs the **entire epic build**,
    including every child task — it is **not** re-asked when the build just-in-time plans each
    child.
  - planning a **standalone task** → asked at **that task's plan**.
- **Once per plan invocation.** Not re-asked per child during the build, not re-asked at
  refine. The plan-time answer is the standing policy for that run (held in working memory;
  the user can still revise it mid-flight — "actually, also loop me in on X").

### What the user can say — free-form
Their own words, e.g. *"pull me in for anything touching persistence, auth, or the public API
— decide the rest yourself."* The simple priority presets (`high` / `medium` / `low` / `ai`)
remain available for users who don't want to think in topics; `conditions` is the richer
answer to the same question: **"when do you want me to pull you in?"**

## The safety floor (agreed in principle — definition to sharpen)

A pure free-form policy has one gap: the **unknown-unknowns** — the risks the user didn't
think to name. If the build reaches a destructive migration / a force-push / a deleted record
and the user never listed it, a naïve topic filter lets it through — exactly where the fear of
losing control is highest.

So **on top of** the user's conditions sits a floor the user cannot switch off: anchored
**always** escalates the **irreversible / high-blast-radius / off-intent**, even when the
user's conditions don't mention it. The user fills the topic-specific layer; anchored
guarantees the dangerous layer.

- **Open:** what exactly counts as "irreversible / high-blast-radius" — a concrete, testable
  heuristic (e.g. data deletion, history rewrite, a contract/schema break, a cross-boundary
  change, anything the `stop`-conditions already name). To sharpen before building.

## How it relates to what exists
- **`conditions`** (the topic filter, already built into the refine walk) is the vehicle —
  now elevated from "how to handle the child-task questions" to "the build run's standing
  escalation policy," set at plan.
- **Threshold presets** (`high/medium/low/ai`) stay as the simple default.
- **`stop`-conditions** are the half-built floor — the reversibility/blast-radius floor is
  their natural completion.
- **Reconciliation (to work out at build):** this plan-time escalation policy overlaps the
  refine walk's task-question timing (the `epic-wide` / `jit` / `conditions` we added). With
  the escalation policy set at plan, the refine walk can focus on resolving the node's own
  *known* questions; the *build-time* escalation is the plan-time policy + the floor.

## Build impact (skill-side, lean)
- **plan SKILL:** trigger the escalation-policy question **once**, at the planned tier (epic
  plan / standalone task plan); phrase it as "when do you want me to pull you in?"; hold the
  answer in working memory for the run. Do not re-ask per child or at refine.
- **build SKILL:** at every escalation moment (a build-time decision, an action about to run),
  judge it against (a) the user's conditions and (b) the safety floor — escalate (ask the
  user) on a match, else proceed-and-document with reasoning (`source: ai`).
- **the floor:** a reversibility / blast-radius heuristic, folded into the build `stop` logic.

## Status — DESIGN (not yet built)
Decided: free-form, user-defined escalation policy, asked once at plan (per planned tier),
governing the build; plus a non-disableable safety floor for the irreversible/dangerous.
Open: the precise floor heuristic; the reconciliation with the refine-walk task policy.
