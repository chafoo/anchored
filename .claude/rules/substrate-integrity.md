# Rule: Substrate Integrity — Mechanism vs. Policy, Invariant in the Schema

> Scope: schema, store, run module, CLI, config. Non-negotiable. This is the
> v3 successor of v2's fractal-substrate-integrity — the fractal is gone, the
> split and the invariant remain.

## Mechanism (code, fixed) vs. Policy (config/plan, the user's)

- **Mechanism** = deterministic code, and it is deliberately tiny:
  - **The evidence invariant** — a criterion reaches `status: done` only with
    validator-authored `evidence`; `failed` requires a reasoned `verdict`;
    `superseded` requires `superseded_by`. Lives in the SCHEMA
    (`modules/run/run.schemas.ts`), parsed fail-closed on **every** store
    write — unskippable.
  - **Role separation** — evidence carries `by: validator`; only the
    `evidence`/`fail` verbs construct evidence blocks.
  - **The dumb store** (`services/store/`) — atomic temp+rename, lock + CAS,
    validated against a schema it is handed. It knows no run semantics.
  - **The close gate** — `close` refuses while any active criterion is not
    done-with-evidence (verb pre-check + run-level schema backstop).
  - **Plan immutability + never-delete** — every transform asserts the plan
    block is unchanged and criteria only grow; `amend` is the only verb that
    supersedes/rejects.
  - **Snapshot transport** — `validate` mints an opaque token or carries the
    caller's `--snapshot` string. The core NEVER interprets it.
- **Policy** = everything the user shapes: the plan and criteria (run file),
  the `rigor`, the gate slicing (the AI sizes it), the setups
  (`validator`/`before`/`after` instructions), custom `fields`, and every
  integration around the loop — git, CI, commits, PRs. anchored ships **no
  git and no CI built-ins**; users wire them via instructions + `fields`
  (e.g. commit sha via `anchored set`).

When deciding where something belongs: behavior a user should be able to
reconfigure → policy (instructions/fields/run file). A guarantee that must
never break → mechanism (schema/store/verbs).

## No privileged built-ins

There is exactly ONE agent concept (the validator) and it is spawned by the
skill, never by the CLI. Hooks are instruction blocks the agent executes —
never harness-run command pipelines, never step sequences. A setup is
parametrisation of the one loop; the moment config grows a step list, we have
rebuilt v2.

## Engine = deterministic, AI = effect behind the skill

Transforms, invariant checks, atomic writes = pure, tested code. The
validator is an effect the SKILL triggers; the CLI's `validate` only returns
the validation packet. Never AI calls inside core code.

## v2 is reference, not port

`~/Dev/anchored-v2/core/src` is the idiom source (store seams, error
primitive, CLI envelope) — port the *patterns* ([[factory-functions]]), never
the tier/stage/template logic. What v3 deleted stays deleted: tiers, stages,
step engine, agent fleet, questions/receipts.

## Reference

`docs/design/north-star.md` (the mechanism-vs-policy table + hard
constraints). [[factory-functions]], [[cli-only-transport]].
