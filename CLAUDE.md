# CLAUDE.md — anchored v2

anchored v2 ist ein **fraktaler Rewrite** von anchored. Das vollständige Design
ist die verbindliche Spec — **lies zuerst `docs/design/`**, bevor du Code oder
Doku anfasst:

- `docs/design/fractal-lifecycle.md` — das Etagen-Modell (project▸epic▸task▸phase,
  alle `plan→refine→build→wrap`; `build.each` = Rekursion; `phase` = Leaf).
- `docs/design/engine-architecture.md` — die Factory-Function-Engine.
- `docs/design/anchored.default.yml` — die vollständige Default-Config.
- `docs/design/file-structure.md` — die autoritative File-Struktur (Doku + Build
  folgen ihr).
- `docs/design/fractal-redesign-notes.md` — Entscheidungs-Record (alle Items).

## Nicht-verhandelbare Prinzipien

1. **Fraktal**: eine Lebenszyklus-Form auf jeder Etage. `build.each: <tier>` ist
   intrinsisch (nicht konfigurierbar). `phase` ist der Leaf (build ohne `each`).
2. **Keine Built-ins** — alles ist ein Step. Das opinionierte Verhalten lebt im
   Default-Template (`anchored.default.yml`), aktiv by default, überschreibbar.
3. **Integrität im Substrat**: kein `ac` auf `done` ohne `evidence`. Erzwungen im
   Datenmodell (`state/invariants.ts`), NICHT in einem Step.
4. **CLI-only Transport**: alle Ops über die `anchored`-CLI via Bash. **Kein MCP.**
   Funktioniert in Main-Session UND Subagents/headless. CLI gibt JSON aus.
5. **Factory-Functions**: `createX(cfg, deps) → { run(input) → output }`,
   Helfer in `scope/`. Engine = deterministischer Code; AI = Effekt hinter
   `spawn` (default: `claude -p` pro Task-File, Phasen in-process).
6. **anchored.yml = Base-Dependency**: `merge(default-template, user)` einmal beim
   Bootstrap, injiziert als `deps.config`.
7. **Mechanismus vs. Policy**: Engine/Substrat/Transitions/Invariante = Code;
   Felder + Step-Sequenzen = Config/Template.

## Plugin / Commands

- Plugin-Namespace **`a`** (Fallback `anc`). Commands sind Skills:
  `/a:plan <tier?> <input>` · `/a:refine <slug>` · `/a:build <slug>` ·
  `/a:wrap <slug>`. Keine separaten Tier-Entries — der Tier ist Argument von `plan`.
- Agents: flach in `plugin/agents/`, Stage-Präfix-Buckets. **Nie** einen Agent
  `plan` oder `explore` nennen (CC-reservierte Agent-Typen).

## Build-Reihenfolge

1. **pure-engine** — Factory-Engine + Substrat (state/parser/io/ops) + Config-
   Bootstrap + CLI-Grundgerüst.
2. **default-template** — `anchored.default.yml` als gemergte Basis; alle
   Default-Steps als Template-Worker.
3. **epic-tier** — epic als Etage (scaffold/walk/loop/roll-up), nested slugs,
   classify.

## Konventionen

- Code liest sich wie der umgebende Code (Kommentar-Dichte, Naming, Idiom).
- Quality-Gates pro Paket (lint/format/typecheck/test/build) — Tooling-Wahl wird
  in `pure-engine` festgelegt.
