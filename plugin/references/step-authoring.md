# step-authoring — how to write a good step (and worker brief)

> Companion to `plugin/references/anchored-config.md`. That doc is the *format* of a
> step (`name` · `instructions` · `use`); **this** doc is the *quality* of the prose
> that goes inside it — the `instructions:` of a step and the body of a worker agent.
> It exists so `/a:setup` (and you, editing a brief) write prose that actually changes
> behaviour instead of prose the AI skims.

## What step prose is — and what it is not

A step's `instructions:` (and a worker's brief) is **soft guidance to the AI** that
runs or dispatches the step. It is never enforcement.

The **one and only** hard guarantee in anchored is the evidence invariant in the
schema (no `ac` to `done` without `evidence`) — see
`.claude/rules/fractal-substrate-integrity.md`. Prose steers the *work*; we never
enforce the work. So the question is never "how do I make this instruction binding"
(you can't — it's a prompt). The question is: **does this prose reliably shift what
the AI does?** Everything below serves that one test.

## The hardness ladder — put a rule at the right altitude

If a rule *matters*, the lever is not more emphatic prose — it is moving the rule up
the ladder:

| Altitude | How hard | What lives here |
|---|---|---|
| **Deterministic check** | **hard** — code, not judgement | a command that exits non-zero on violation (`npm test`, a `grep` guard, `tsc --noEmit`). Lives in a custom step's `instructions` (there is no `run:` key — the command IS the prose): the command + "fail the step on a non-zero exit". The exit code is checked by the runner, not weighed by an AI. |
| **Gate verdict** | semi-hard | a criterion the always-run `task-validate` gate (or a user-wired extra gate) checks; its structured per-AC verdict drives the re-do loop. AI-judged, but by a *separate* focused agent whose only job is to catch the first. |
| **Brief prose** | soft | methodology, nudges, anti-rationalizations. Higher salience in a focused brief, still violable. |

> **Rule of thumb: want it hard? Write a check, not a sentence.** A `grep` guard that
> exits non-zero is unbreakable; a bolded "you MUST never use `any`" is a wish. Reach
> for prose only for the things that genuinely cannot be reduced to a command or a
> gate criterion.

## Writing principles

1. **Process over knowledge.** Steps, not facts. "Run `npm run check`; fail on
   non-zero" — not "make sure quality is good".
2. **Specific over general.** A real command or a named symbol beats a paragraph
   describing one.
3. **Token-conscious.** If deleting a line would not change what the AI does, delete
   it. Three sharp lines the AI heeds beat a twenty-line table it skims.
4. **One concern per brief (sorted, not stacked).** anchored already splits the work
   across focused workers (`implement` · `task-validate`, plus any user-wired gates). Put a
   rule in the brief whose *single job* is that concern — never pile five concerns
   into one `instructions` field, or attention spreads thin and nothing sticks.
5. **Anti-rationalization.** For any step the AI is tempted to skip, name the excuse
   and rebut it (the table below). This is the highest-leverage soft prose there is.
6. **Evidence taxonomy.** When the prose is about *proof*, say concretely what proof
   looks like — don't leave "verify it" to interpretation.

## Reusable prose shapes

### Rationalizations — name the excuse, give the rebuttal

A two-column table is the most effective soft nudge in this repo. Keep it to the 2–3
excuses that actually show up.

```
| Rationalization | Reality |
|---|---|
| "I'll add the test after it works" | You won't, and after-the-fact tests test the implementation, not the behaviour. |
| "This is too simple to validate" | Simple code gets complicated. The evidence documents the expected behaviour. |
```

### Red flags — observable signs the step is being violated

A short bullet list a gate (or the AI self-monitoring) can match against.

```
- "all tests pass" but no test command was actually run
- a bug fix with no reproduction that failed before the fix
- evidence that says "should work" instead of a real result
```

### Evidence taxonomy — what concrete proof looks like (validate-gate briefs)

For a `task-validate` brief, spell out what counts as evidence per kind of work, so
the gate's judgement is sharp:

```
- logic / pure function → a committed test + its green run output (N/N)
- a bug fix → the reproduction test, failing before and passing after
- a CLI / API change → the actual invocation and its real output
- UI / browser work → the runtime check (clean console, the rendered result)
Anchor every claim on the SYMBOL (function / file / selector), never a raw line
number — line numbers rot as later phases insert code above.
```

## Where each shape belongs

| Slot | Put here |
|---|---|
| `build.implement` brief / `instructions` | methodology + a short rationalizations table (skip-the-test, skip-the-spec) |
| `build.task_validate` `instructions` | the evidence taxonomy + red flags — this is the focused gate, the strongest soft placement short of the schema |
| `build.code_validate` `instructions` | which rule files apply + how a violation reads |
| a custom check step's `instructions` | the command + how to treat its exit code/output (this is the hard altitude) |

## Anti-patterns

- **Labelling prose "enforcement."** A "MUST" list injected into a prompt is still
  soft. Naming it hard over-promises and erodes trust in the one thing that *is* hard
  (the invariant). If it must be hard, move it down the ladder to a check.
- **Stacking concerns** in one `instructions` field hoping volume makes it stick — it
  dilutes. Split by worker.
- **Evidence-quality criteria in the `implement` brief.** That is the gate's job; the
  implementer's brief is about producing the work, not judging its proof.
- **Long aspirational tables.** If the AI skims it, it does nothing. Trim to what
  changes behaviour.

## Reference

`plugin/references/anchored-config.md` (the step format),
`.claude/rules/fractal-substrate-integrity.md` (mechanism vs. policy — why prose is
policy and only the invariant is mechanism),
`plugin/references/communication-style.md` (house voice).
