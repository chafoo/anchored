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
| `criteria` | The testable derivations of the plan. `{id: cN, text, setup?, gate?, judgment?, status, evidence?, …custom fields}`. `setup` is a CRITERION property (no run level) — no setup → the config defaults. `gate` is the AI's slicing, sized to the rigor; absent → one final gate. `judgment: true` declares a criterion unexecutable, the ONE way a prose verdict may prove it. |
| `trail` | Free-form work log: claims (`{at, claim, refs?}`) and validation records (`{at, gate?, validated, snapshot}`). Annotation, never proof. Re-asking a gate the same question (same selection, nothing proven since) reuses the prior snapshot and adds no second record. |
| `closed` | Present only when every active criterion is done-with-evidence — the CLI refuses otherwise. |

## Criterion statuses

`open` → work in progress · `done` → validator attached evidence · `failed` → validator
rejected with a verdict (the fix-list) · `superseded`/`rejected` → retired by an
amendment, kept visible forever (criteria are never deleted).

## The invariant (why a checkbox means proven)

`done` REQUIRES `evidence: {by: validator, snapshot, grounded, at}` — enforced in the
schema on every write. Only the spawned validator authors evidence; the working session
never calls `evidence`/`fail`.

`grounded` is executed-command output, and `done` demands it. A prose `verdict` proves a
criterion ONLY where the author declared `judgment: true` at anchor/amend time — the copy
reads calm, the solution follows the pattern. That declaration is the single opt-out, it
stands in the run file, and it is made BEFORE the proof is attempted, so an unexecutable
criterion is an up-front admission rather than a retroactive excuse. `failed` still
requires a `verdict` (the reasoned rejection), grounded or not.

### What the snapshot is not

`snapshot` is an opaque token, not a lock. Unless you hand `validate` a real ref
(`--snapshot <sha>`), nothing freezes the working tree: the session keeps coding while the
gate's validator reads, and concurrent gates share one tree. The validator is instructed
never to write into it — that is an instruction, not a sandbox. If you need a hard pin,
pass a ref you control (`--snapshot "$(git rev-parse HEAD)"` after committing the work, or
any ref your `before` instructions mint) and the validator will verify exactly that state.
