# Open questions — core/state ↔ docs/core/validate

| Question | Suggestion | Decision | Status |
|---|---|---|---|
| **Docs-folder naming for the state mechanism** — *Code lives in `core/src/state/` (invariants.ts, transitions.ts), but the docs mirror it as `docs/core/validate/`. The mirror rule demands folder = code folder → `docs/core/state/`. But the `deps` seam is named project-wide partly `validate` (factory-functions.md), partly `state` (fractal-substrate-integrity.md, CLAUDE.md). Rename to `state/` (+ adjust 3 inbound links in `_core.md`, `tiers.md`, `_validate.md` breadcrumbs) or keep the conceptual label `validate`?* | Rename `docs/core/validate/` → `docs/core/state/` (mirror rule wins; pull through inbound links + breadcrumbs) | **`state/`** — folder renamed via `git mv`, all inbound links + breadcrumbs + mermaid labels (`_core.md`, `_anchored.md`, `tiers.md`, `node-ops.md`, `log.md`, `tier-runner.md`) pulled through (2026-06-11). | decided |

> **docu-clean follow-up (no user decision needed):** `transitions.md` is outdated —
> it describes the backward edge as "if v2 adopts it", but `transitions.ts`
> has actually implemented it (`refined/build/wrap/done → drafted`, `blocked →
> in-progress`). Update it along with the rename pass.
