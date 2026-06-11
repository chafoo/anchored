# Offene Fragen — core/state ↔ docs/core/validate

| Frage | Vorschlag | Entscheidung | Status |
|---|---|---|---|
| **Doku-Ordner-Naming für die State-Mechanik** — *Code liegt in `core/src/state/` (invariants.ts, transitions.ts), die Doku spiegelt ihn aber als `docs/core/validate/`. Die Mirror-Regel verlangt Ordner = Code-Ordner → `docs/core/state/`. Aber die `deps`-Naht heißt projektweit teils `validate` (factory-functions.md), teils `state` (fractal-substrate-integrity.md, CLAUDE.md). Umbenennen auf `state/` (+ 3 Inbound-Links in `_core.md`, `tiers.md`, `_validate.md`-Breadcrumbs anpassen) oder das konzeptionelle Label `validate` behalten?* | `docs/core/validate/` → `docs/core/state/` umbenennen (Mirror-Regel gewinnt; Inbound-Links + Breadcrumbs nachziehen) | **`state/`** — Ordner via `git mv` umbenannt, alle Inbound-Links + Breadcrumbs + Mermaid-Labels (`_core.md`, `_anchored.md`, `tiers.md`, `node-ops.md`, `log.md`, `tier-runner.md`) nachgezogen (2026-06-11). | entschieden |

> **docu-clean-Follow-up (kein User-Entscheid nötig):** `transitions.md` ist veraltet —
> sie beschreibt die Rückwärts-Kante als „falls v2 sie übernimmt", `transitions.ts`
> hat sie aber implementiert (`refined/build/wrap/done → drafted`, `blocked →
> in-progress`). Beim Rename-Pass mit aktualisieren.
