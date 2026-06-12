# Ticket: Harden-1 — Substrat- + Security-Quick-Wins (S-Tier)

**Quelle:** 5-Agent-Härtungs-Review (harden-anchored-v2). Diese Gruppe = isolierte,
risikoarme Einzeländerungen mit höchstem Sicherheit-pro-Aufwand. Alle S.

## Findings + Fix

### Q1 — `set-field status done` umgeht Evidenz-Invariante + Transitions  🔴 KRITISCH
`RESERVED_FIELDS` reserviert nur `executor` (`node-ops.ts:87`), also springt
`anchored node set-field <slug> status done` einen Node plan→done OHNE Evidenz und
OHNE Transition-Check (blankes `persist()`, `:169-184`). **Live reproduziert.**
**Fix:** `status` (Node + Child + AC) hart reservieren bzw. jede Mutation eines
status-typisierten Felds durch `assertTransition` + Completability routen.
Regressionstest: `set-field status done` muss `ReservedField`/`IllegalTransition`
werfen.

### Q2 — Bash-Hook lässt absoluten-Pfad-Redirect auf Task-File durch  🔴
Der `.claude/tasks`-Zweig in `block-task-file-edits.js` hat keinen Leading-Path-
Wildcard, also passiert `echo x > /abs/.../.claude/tasks/foo.yml` (die häufigste
Pfadform) ungeblockt. **Live reproduziert.**
**Fix:** dem `tasks`-Zweig denselben `[^\s'"|&;>]*`-Präfix geben wie dem `_epic`-
Zweig; zusätzlich die nächst-häufigen Schreib-Shapes (`dd of=`, `truncate`,
`gawk -i inplace`, `write_text`, `fs.writeFile`) nachziehen. Test: absoluter Pfad
→ BLOCK.

### Q3 — User-Step re-deklariert Built-in-Worker mit `run:` → Shell-Eskalation
merge keyt Steps per Name, also wird `{name: implement, run: 'rm -rf /'}` in den
privilegierten `implement`-Worker gemergt und von `toPlanStep` zu `kind:run`
umklassifiziert (`merge.ts:22-37`, `steps-planner.ts:21-44`). Eine eingeschleuste
anchored.yml kann beliebige Shell beim „implement" ausführen.
**Fix:** in `mergeSteps` mit `ConfigError` ablehnen, wenn ein User-Step einen
Built-in-Worker-Namen mit konfligierendem `run`/`use`/`each` trifft. Test.

### Q4 — Kleine Schrauben
- **`retry_limit` ohne Obergrenze** (`schema/config.ts:18`): `1e9` akzeptiert →
  Loop-Hang via Config. → `.max(20)`.
- **`ANCHORED_TASKFILE_EDIT=1` schaltet auch Bash ab** (`block-task-file-edits.js`):
  vererbt sich in Build-Agents und macht die ganze Enforcement abschaltbar. → das
  Flag nur für Write/Edit/MultiEdit honorieren, NIE für Bash.
- **`zodForTypeString`-Fallback auf `z.unknown()`** (`custom-fields.ts:29-35`): ein
  deklariertes Nicht-Skalar-Feld validiert beliebigen Müll. → unbekannte
  Type-Strings beim Bootstrap fail-fast ablehnen (berührt Invariante nicht, nur
  Schärfe).

### Doku
- Hook explizit als **Best-Effort-Defence-in-Depth** dokumentieren — autoritativ ist
  der validierende CLI/persist, nicht der Hook (Allowlist-of-Shapes ist strukturell
  nie lückenlos).

## Nicht-Ziel
- Kein Flow-/Contract-Change. Reine Loch-Schließung + Schärfung.
