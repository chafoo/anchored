# anchored CLI — the 9 verbs

All reads and writes on a run go through `anchored <verb>` over Bash — no MCP, no raw
file edits while a run is live. Every call emits exactly ONE JSON envelope line:

```
{ "ok": true,  "command": "<verb>", "result": … }
{ "ok": false, "command": "<verb>", "error": { "kind", "message", "suggestions"? } }
```

Exit codes: `0` ok · `2` refused (typed error / schema violation — read `error.kind`) ·
`3` write contention (re-read and retry) · `1` unexpected.

## Verbs

| Verb | Grammar | Notes |
| --- | --- | --- |
| `anchor` | `anchored anchor <slug>` — body via **stdin** (YAML or JSON) | Body: `goal` (required), `plan?` (VERBATIM, immutable), `rigor?` (`light·standard·high·max`), `criteria` (list of `{text, setup?, gate?}`). Ids are minted (`c1…`). Refuses an existing slug. |
| `claim` | `anchored claim <slug> "<one-liner>" [--refs c1,c2]` | Trail entry — annotation, never a gate. Allowed on closed runs. |
| `amend` | `anchored amend <slug>` — body via **stdin** | Body: `reason` (required) + at least one of `add` (drafts), `supersede` (`[{id, by}]`, `by` = existing id or 1-based index into `add`), `reject` (ids). Appends the amendment (`a1…`), never edits the plan, never deletes criteria. |
| `validate` | `anchored validate <slug> [--gate <g>] [--snapshot <ref>]` | Returns the **validation packet** for ONE validator spawn: the gate's open/failed criteria (with `judgment` where declared), the resolved setup (`validator` incl. `require`, plus the `before`/`after` instruction blocks the SKILL runs around the spawn), the snapshot (minted `snap-…` token, or your `--snapshot` verbatim), rigor, fields. Idempotent: re-asking an unchanged gate returns the same snapshot and writes no second trail entry; any `evidence`/`fail` since mints a fresh one. The CLI never spawns and never executes a hook — the skill does. Gates are setup-homogeneous. |
| `evidence` | `anchored evidence <slug> <criterion> --snapshot <s> (--grounded <proof> \| --verdict <v>)` | VALIDATOR-ONLY. Flips to `done`. `--grounded` = proof by execution, `--verdict` = proof by inspection; at least one, both allowed. A setup with `validator.require: grounded` refuses a bare verdict (`UngroundedEvidence`) unless the criterion is `judgment: true`. |
| `fail` | `anchored fail <slug> <criterion> --snapshot <s> --verdict <v>` | VALIDATOR-ONLY. Flips to `failed` with a reasoned rejection → the fix-list. |
| `set` | `anchored set <slug> <criterion> <field> <value>` (or `<field>=<value>`) | Writes a DECLARED custom field (anchored.yml `fields`), type-coerced. Allowed on closed runs (enrichment). |
| `status` | `anchored status [slug]` | With slug: the full run. Without: summaries of every run (`open/failed/done` counts, plus `judged` — how many `done` rest on a verdict rather than an execution). |
| `close` | `anchored close <slug>` | Refused (`CloseBlocked` + blocker list) while any active criterion is not done-with-evidence. Superseded/rejected never block. Idempotence: `AlreadyClosed`. |
| `version` / `help` | `anchored version` · `anchored help` | Meta. |

## Error kinds worth handling

`UnknownRun` (anchor it first) · `RunExists` (resume instead) · `UnknownSetup` (lists the
declared names) · `MixedGate` (validate per gate) · `NothingToValidate` (suggests close or
the provable gates) · `CloseBlocked` (suggestions = the fix-list) · `RunClosed` (proof
state is frozen) · `WriteContention` (exit 3 — retry after re-read) · `SchemaViolation`
(the evidence invariant speaking).

## The run file

`.claude/anchored/<slug>.yml` — see [run-file.md](run-file.md). Mutations ONLY through
the CLI; manual edits bypass the invariant and the atomic writes.
