# Offene Fragen — plugin /impl-refine (plan-check + rules-check)

| Frage | Vorschlag | Entscheidung | Status |
|---|---|---|---|
| **Laufen plan-check und rules-check parallel oder strikt sequenziell?** — *`rules-check.md` nannte sich „second mandatory gate" und empfange „post-reshape task-file content" (impliziert sequenziell); die `/impl-refine`-Skill-Beschreibung nannte beide „mandatory parallel gates".* | Klären, welche Reihenfolge gilt; Doku (Skill + Agent) konsistent machen. | **Parallel** auf demselben **pre-read** Snapshot: rules-check sieht plan-checks Reshapes nicht; die SKILL reconciled beide Befunde beim Apply (inkl. Slug-Drift). `rules-check.md` an 3 Stellen korrigiert; Doku angeglichen ([rules-check.md](../plugin/agents/rules-check.md), [plan-check.md](../plugin/agents/plan-check.md)). | entschieden |
| **Format/Schlüssel des rules-check-Rollups in `context.build`** — *Die Agent-Datei sagt „context.build → rules-check", aber das Schema dieses Eintrags ist nicht spezifiziert.* | Falls für Leser relevant, das Zielfeld + Format in der task-file-Struktur dokumentieren. | — | offen |
