# anchored v2

Fraktaler Rewrite von [anchored](https://github.com/chafoo/anchored) — ein reines
Framework für AI-getriebene Arbeit über vier selbstähnliche Etagen:

```
project ▸ epic ▸ task ▸ phase     (alle: plan → refine → build → wrap)
```

Kernprinzipien (Design steht, Implementierung beginnt):

- **Fraktal**: eine Lebenszyklus-Form auf jeder Etage; `build.each` ist die
  Rekursions-Kante, `phase` der Leaf.
- **Pures Framework, keine Built-ins**: das Verhalten lebt im Default-Template
  (`anchored.default.yml`), aktiv by default, voll überschreibbar.
- **Integrität im Substrat**: kein `ac` auf `done` ohne `evidence` — die USP
  sitzt im Datenmodell, nicht in einem Step.
- **CLI-only Transport**: alle Ops über die `anchored`-CLI via Bash (kein MCP) —
  funktioniert in Main-Session *und* Subagents/headless.
- **Factory-Engine**: `createX(cfg, deps) → { run(input) → output }`, `scope/`-
  Helfer; Engine = deterministischer Code, AI = Effekt hinter `spawn`.

## Wo was liegt

- **`docs/design/`** — die verbindliche Design-Spec (aus der v1-Dogfood-Session):
  - `fractal-lifecycle.md` — das Etagen-Modell + Diagramm
  - `anchored.default.yml` — die vollständige Default-Config (Steps + Felder)
  - `engine-architecture.md` — die Factory-Function-Engine
  - `fractal-redesign-notes.md` — Entscheidungs-Record (alle Items)
  - `agenda.md` — die durchgegangene Frageliste
- **`core/`** — das CLI-/Engine-Paket (TS) — *noch leer, Build folgt*
- **`plugin/`** — das Claude-Code-Plugin (Skills, Agents, Commands) — *noch leer*

## Status

Design abgeschlossen, Implementierung steht am Anfang. Plugin-Namespace: `a`
(Commands `/a:plan|refine|build|wrap`). Build-Reihenfolge: `pure-engine` →
`default-template` → `epic-tier`.
