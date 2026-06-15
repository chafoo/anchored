# anchored v3 — requirements v3: the enforcement canon + the flat step model

> A THIRD iteration on top of `requirements-2.md`. The four-layer tree
> (`lib → modules → services → cli`), the contracts-as-seams rule, the universal
> evidence invariant, and 100% coverage **all still hold**. This document **decides the
> enforcement boundary** — what the core guarantees vs. what is the user's policy — and
> **supersedes**:
> - the `--run` command-gate executor and **evidence provenance** sketched in
>   `enforcement.md` (layer 3 + kind-on-evidence) — **dropped, both**;
> - the Claude-Code **hook** enforcement layer (`enforcement.md` layer 5) — **dropped**;
> - the step shape `{ name, worker, type }` from `anchored.default.yml` /
>   `requirements-2.md` — **replaced** by `{ name, instructions?, use?, execute? }`;
> - the `run:` step kind — **removed**.

## The one principle (unchanged, now sharpened)

> **We enforce the SUBSTRATE, not the WORK.**

- **Substrate** = the data integrity that must hold in *every* execution context
  (main session, subagent, headless, CI). It lives in the **core** (schema + verb guards),
  the only layer present everywhere. Hard, portable, unskippable.
- **Work** = what the steps actually *do* — which command runs, which agent/skill executes,
  how it fans out. This is **policy**: the user expresses it; we run it; we make **no
  guarantee** about it. A step is never an enforced thing.

Everything below is a direct consequence of that one line.

---

## What the core GUARANTEES (the enforcement canon)

Five guarantees, all in the core (schema or verb guard), all portable and hard.

### 1. Stage order — `plan → refine? → build → wrap?`

The lifecycle status walks `plan → drafted → refined → build → wrap → done`. **`refine` and
`wrap` are optional**, so the transition map carries the **skip edges**:

- `drafted → build` (skip refine), in addition to `drafted → refined → build`.
- `build → done` (skip wrap), in addition to `build → wrap → done`.

The map is the mechanism (verb guard, `assertTransition`). No stage can be jumped *out of
order* (no `plan → build`, no `refined → wrap`); only the two optional stages may be skipped.

### 2. Tier hierarchy + completion floors — `project ▸ epic ▸ task ▸ phase`

A parent cannot reach `done` until its children are terminal. Enforced by the verb guards
(the `assertXCompletable` floors + roll-up): a `phase` is terminal when every AC is terminal
(§3); a `task` `done` needs every phase terminal; an `epic` `done` needs every task-stub done
+ every DoD item evidenced + no open concern; a `project` `done` mirrors it one tier up.

### 3. Acceptance criteria — every AC is `done` ∨ `deferred`, nothing left `pending`

This is the heart. **Everywhere there are acceptance criteria — phase ACs, task-stub outcome
ACs, epic/project stub outcome ACs, epic/project DoD items — the same rule binds.** An AC has
three states:

| status | requires | meaning |
|---|---|---|
| `pending` | — | not yet satisfied — **blocks the completion floor** |
| `done` | non-empty `evidence` | satisfied, with proof attached |
| `deferred` | non-empty `reason` | explicitly postponed, **documented why** |

- **`done` ⇒ evidence present** — the existing universal invariant, a `.refine` on the shared
  `AcceptanceCriterion`, run on every `store.write`. Unchanged, reused by every tier.
- **`deferred` ⇒ reason present** — a NEW arm of the same refine: a `deferred` AC must carry a
  non-empty `reason`. „Documented accordingly" *is* the reason field.
- **The completion floor accepts `done` + `deferred` as terminal, blocks only `pending`.**
  So a tier can finish with some ACs deferred — as long as each deferral is documented.

Evidence stays `string[]` (non-empty). **No `kind`/provenance, no typed-evidence union** — we
deliberately do not model "what kind" or "who authored". (See "NOT enforced" below.)

> **Process default (plugin, NOT core): the PRÜFER authors the evidence.** In v1 the
> implementer drafted evidence and the validators only approved/rejected. v3 inverts the
> default: the **checker** agent for a tier writes that tier's evidence — the implementer
> authors none. The entity that *confirms* is the entity that *records*, so evidence reads
> "I, the checker, verified X." Fractal: every tier has ACs → every tier has a checker that
> evidences them (phase → task-validate/code-validate · task → task review · epic/project →
> roll-up review). This is a **plugin-role convention**, not a core guarantee — the core only
> enforces *evidence-present*, never *who wrote it* (that would be provenance, which we cut).

### 4. Questions/decisions are documented

A question carries `{ id, text, priority, origin, status, answer?, source?, reasoning? }`. A
resolved question must carry its `answer` + `source` (`user` | `ai`) and, when `source: ai`,
a `reasoning`. The same shape backs `concerns`. This is schema-enforced — a decision without
its trail does not validate.

### 5. Open questions block the advance to `build` (with a message)

The core verb guard on the **`→ build`** transition (both `drafted → build` and
`refined → build`) throws when any question is still `open`, and the error envelope **lists
the open questions**. The AI reads the message and knows: walk the questions first, then
build. This is the portable shadow of "the user gets asked which questions to answer" — the
core guarantees *the door stays shut while questions are open, and says why*; the **asking
itself is the skill's job** (the `walk` step), which the core cannot and does not enforce.

---

## What the core does NOT enforce (explicit non-goals)

Stating these so we never fool ourselves into thinking a guarantee exists where it doesn't:

- **What `instructions` / `use` / `execute` actually do** — step execution is policy. No
  guarantee a command ran, an agent succeeded, or a fan-out completed.
- **Evidence *truth*** — the core checks evidence is *present*, never that it is *honest* or
  that a cited command really passed. (This is exactly why `--run` is dropped — see below.)
- **Who authored the evidence** — no provenance field. "Prüfer writes it" is a plugin default,
  not a checked fact.
- **Rule adherence** — qualitative; a soft inspector (code-validate) raises it as a *concern*,
  and only then does the hard floor (no open concern → done) bite. The judgement stays soft.
- **Whether the user was actually asked** — the CLI cannot notify a human. The core enforces
  the *artifact* (open questions block build), the skill performs the *interaction*.
- **Raw-write prevention** — the Claude-Code hook is dropped. A raw `Write` on a node file is
  not *prevented*; it is *detected on the next `store.read`* (`schema.parse` rejects an
  invalid file). A well-formed-but-dishonest raw write is no worse than a dishonest CLI write
  — both pass the schema — so the hook bought nothing once evidence-truth is out of scope.

### Why `--run` is gone

A gate command is a **step**, and a step is **policy**. `--run` tried to make a step
*enforced* — the core would execute the command and write verified evidence. That is a
layer violation: it drags an effect (spawn a shell command), OS-specifics, multi-command
ordering, and stdout-vs-JSON-envelope handling into the core, and it pretends to guarantee
evidence-truth, which we have decided not to guarantee. **The user who wants a verified gate
writes it in `instructions`, or builds their own skill/agent/hook.** The framework stays
small.

---

## The step model (flat, one-dimensional)

A **step** is a unit of work in a stage. It is policy — the skill dispatches it; the core
only serves it verbatim via `template.steps(tier, stage)`.

```yaml
# a step is exactly this shape:
- name: <label>
  instructions: <prose>            # OPTIONAL — what the main thread should do (incl. "run npm test" in prose)
  use: { type: agent|skill, name: <worker> }   # OPTIONAL — spawn an isolated agent (Task) or invoke a skill (in-session)
  execute: sequential | workflow   # OPTIONAL — default sequential; workflow = fan this step out as a dynamic workflow
```

- **`instructions:`** — prose for the main thread. **Replaces `run:`.** Need a command? Say so
  in prose. Multiple commands, a special OS, an ordering — all expressible in prose, none
  expressible (cleanly) in a one-dimensional `run:` field. That is the whole reason `run:`
  dies.
- **`use: { type, name }`** — the worker. `type: agent` = an isolated subagent via the Task
  tool; `type: skill` = a skill invoked in-session. **Replaces `{ worker, type }`** (the
  worker name moves under `use.name`).
- **`execute: sequential | workflow`** — lives **on the step**, default `sequential`. A step
  whose work is inherently large is planned bigger and declared `execute: workflow`; the
  plugin then runs it as a **dynamic fan-out** (the `anchored:workflow` unit-worker pattern),
  decomposing the work into concurrent units. `execute: workflow` pairs with a `use: agent`
  (the per-unit worker). A normal step is `sequential` — one worker, or inline `instructions`.

### Build-loop parallelism is NOT a step field — it is plugin orchestration

The fractal recursion `build.each: <child-tier>` is intrinsic (unchanged). **Whether the
children run sequentially or several at once is the plugin's orchestration decision, derived
from each child's `depends_on` — not a config field.** `depends_on` is the **multi-phase
fan-out lever**: it lives **on the phase** (an array of sibling phase slugs that must finish
first), is **decided by plan/refine**, and is recorded via `phase set-depends`. The core
provides the primitives:

- `child-ready <slug>` → every child runnable right now (pending, all `depends_on` done) — the
  fan-out batch.
- `child-next <slug>` → the single next child (an active one for resume-safety, else the first
  ready) — the sequential pick.

The plugin fans out the `ready` batch and sequences the dependency chain. The `depends_on`
graph *is* the multi-phase parallelism control. A separate, intra-phase lever — `execute:
sequential | workflow` **on the phase** (also a plan/refine decision, recorded via `phase
set-execute`) — governs whether *one* phase's acceptance criteria fan out in parallel. Both of
those are plan/refine decisions recorded on the phase; the step-level `execute` field (above)
is the orthogonal config lever on an individual step. So `execute` never appears on
`build.each`; it qualifies a **step** or a **phase**, never the loop.

---

## Migration impact

### Core (the build)

1. **AC status enum** `pending | done` → `pending | done | deferred`; extend the shared
   `AcceptanceCriterion` refine: `deferred ⇒ non-empty reason` (add the `reason` field). One
   change in `modules/shared/fragments.schemas.ts`, inherited by every tier schema.
2. **Completion floors** accept `deferred` as terminal alongside `done` (block only
   `pending`) — the `assertXCompletable` guards + the phase/stub done-checks.
3. **`→ build` transition guard**: throw `QuestionsOpen` (listing the open questions) on
   `drafted → build` and `refined → build` while any question is `open`.
4. **Transition map** already needs the optional-stage skip edges (`drafted → build`,
   `build → done`) — confirm they exist.

### Plugin (the adaptation)

5. **Evidence authoring inverts** — the implementer agent stops authoring evidence; the
   checker agents (task-validate / code-validate / wrap-review / roll-up) author it via
   `ac-evidence` / `child-ac-evidence` / `set-acceptance-status`.
6. **Step shape** in `anchored.default.yml` + every skill/agent that reads steps:
   `{ name, worker, type }` → `{ name, use: { type, name } }`; `run:` occurrences → `instructions:`.
7. **No `--run`** anywhere in the plugin (build-gate, build-implement, wrap) — gate commands
   become `instructions` prose run by the skill/main-thread, unguaranteed.
8. **No Claude-Code hook** — drop the raw-write-prevention hook; rely on schema detect-on-read.

### Removed

- The `--run` CLI flag / command-gate executor (never built — stays unbuilt).
- Evidence `kind`/provenance / typed-evidence union (not modeled).
- The enforcement **hook** layer.
- The `run:` step kind.
