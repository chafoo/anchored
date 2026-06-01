# Offene Fragen — plugin/EXTENDING.md (Pipeline-Steps)

| Frage | Vorschlag | Entscheidung | Status |
|---|---|---|---|
| **Schleifen-Semantik von `build.steps`** — *Laufen sie nach jeder Phase oder nach Abschluss aller Phasen? Und wo relativ zu task_validate/code_validate derselben Phase?* | Im Build-Pipeline-Code (`impl-build`) verifizieren und in EXTENDING.md präzisieren. | EXTENDING.md präzisiert: `build.steps` laufen in einer **Per-Phase-Schleife**, *nach* der Default-Arbeit der Stage (also nach implement + Gates). [extending.md](../plugin/extending.md). | entschieden |
| **Stage-Kontext der Env-Vars `${PHASE_SLUG}`/`${PHASE_NAME}`** — *Sind sie auch in `plan.steps`/`wrap.steps` gesetzt oder nur in `build.steps` (wo es einen Phasen-Kontext gibt)?* | Step-Ausführung pro Stage prüfen und in EXTENDING.md je Stage ausweisen. | `EXTENDING.md:53` nun mit Env-Var-Tabelle pro Stage: `${PHASE_*}` **nur** in `build.steps` (einzige Per-Phase-Stage); plan/refine/wrap haben nur `${TASK_SLUG}`/`${TASK_TITLE}`. [extending.md](../plugin/extending.md). | entschieden |
