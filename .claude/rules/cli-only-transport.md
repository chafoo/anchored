# Rule: CLI-only Transport — kein MCP

> Geltung: CLI, Plugin-Skills, alle Agents, jede Ops-Mutation. Nicht-verhandelbar.

## Die Regel

**Alle Ops laufen über die `anchored`-CLI, aufgerufen via Bash.** Kein MCP.
Ein Transport, ein Mental-Modell — funktioniert in der Main-Session UND in
Subagents/headless gleichermaßen. Ein CLI-über-Bash verhält sich faktisch wie
ein CC-Built-in.

## Immer

- **Mutationen + Reads gehen durch `anchored <verb>`** — Stage-Verben
  (`plan`/`refine`/`build`/`wrap`) fahren die Engine; generische node-Verben
  (read/set-status/add-evidence/log …) fahren die Ops.
- **CLI gibt JSON aus** — strukturiert, maschinen-parsebar, für Skills + Agents.
- **Agents lesen + schreiben direkt via CLI** — kein pure-thinker-Workaround mehr
  (der war ein v1-MCP-Bug-Workaround). Agent ruft `anchored …` über Bash.
- **lazy-init** ergänzt `Bash(anchored *)` in `.claude/settings.local.json`, damit
  die Calls ohne Prompt durchlaufen.

## Nie

- **Kein MCP-Server, keine MCP-Tools.** MCP-in-Subagents ist kaputt (#13605, kein
  Fix); CC-Built-ins sind für Plugins nicht erweiterbar. Bash ist das einzige
  ubiquitäre Tool.
- **Keine rohen `Write`/`Edit` auf Task-Files / `_epic.yml`** im Engine-Betrieb —
  alle Mutationen gehen durch die validierende CLI (sonst umgeht man Invariante +
  atomic-write). (Manuelles Editieren in der Design-/Planungsphase ist davon
  unberührt.)

## Warum

CI-/headless-fähig, ein einziges Transport-Modell, keine Subagent-MCP-Bugs. Die
Core-Factory (Schema, State-Machine, atomic-writes, Invariante) bleibt der Wert —
nur transport-agnostisch hinter der CLI. Siehe
`docs/design/fractal-redesign-notes.md` → „Transport: CLI-über-Bash".

## Referenz

`docs/design/file-structure.md` (cli/), `docs/design/fractal-redesign-notes.md`.
[[factory-functions]], [[fractal-substrate-integrity]].
