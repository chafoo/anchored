# The run file — `.claude/anchored/<slug>.yml`

One run = one file. Annotated example: [run-file.example.yml](run-file.example.yml).
Project config example: [anchored.example.yml](anchored.example.yml).

## Shape

| Key | What it is |
| --- | --- |
| `goal` | One sentence — what this run delivers. |
| `rigor` | The quality bar of THIS task: `light` · `standard` · `high` · `max`. Set at anchor time from the user's own words; drives how finely the gates are sliced, how hard the evidence bar is, and how strictly the plan binds. |
| `plan` | The user's plan VERBATIM — frozen at anchor time. Never edited; course changes append `amendments`. |
| `amendments` | The course-change log: `{id: aN, at, reason}`. The WHY lives here once; the WHAT sits on the criteria (`amended_by`/`added_by`/`superseded_by`). |
| `criteria` | The testable derivations of the plan. `{id: cN, text, setup?, gate?, status, evidence?, …custom fields}`. `setup` is a CRITERION property (no run level) — no setup → the config defaults. `gate` is the AI's slicing, sized to the rigor; absent → one final gate. |
| `trail` | Free-form work log: claims (`{at, claim, refs?}`) and validation records (`{at, gate?, validated}`). Annotation, never proof. |
| `closed` | Present only when every active criterion is done-with-evidence — the CLI refuses otherwise. |

## Criterion statuses

`open` → work in progress · `done` → validator attached evidence · `failed` → validator
rejected with a verdict (the fix-list) · `superseded`/`rejected` → retired by an
amendment, kept visible forever (criteria are never deleted).

## The invariant (why a checkbox means proven)

`done` REQUIRES `evidence: {by: validator, snapshot, grounded|verdict, at}` — enforced in
the schema on every write. Only the spawned validator authors evidence; the working
session never calls `evidence`/`fail`. Grounded (executed command output) beats verdict
(prose) — prose is the fallback for what cannot be executed.
