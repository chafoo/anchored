← [references](_references.md)

# default-config.yml — anchored.yml Slot-Katalog

Vollständige Nachschlage-Referenz aller `anchored.yml`-Slots, wie sie in `plugin/references/default-config.yml` annotiert sind — je Slot Default-Wert und Bedeutung des Inline-Kommentars.

Maschinen-Schema: [./schema/anchored-yml-schema-json.md](./schema/anchored-yml-schema-json.md) · Zod-Quelle: [../../mcp/src/schema/anchored-yml-schema.md](../../mcp/src/schema/anchored-yml-schema.md)

Alle gezeigten Werte sind Framework-Defaults; im File sind sie auskommentiert — jeder Slot wird zum Anpassen einkommentiert + editiert. Validiert vom Schema `plugin/references/schema/anchored-yml.schema.json` (durch `anchored validate` + bei jedem CLI/MCP-Aufruf).

## task

| Slot | Default | Bedeutung |
|------|---------|-----------|
| `task.phase.fields` | `[]` | Deklariert eigene Phase-Felder, z. B. `[{name: commit, type: string}, {name: coverage_pct, type: number}]` |

## plan — /impl-plan Pipeline

| Slot | Default | Bedeutung |
|------|---------|-----------|
| `plan.steps` | `[]` | Eigene Shell-/Tool-Steps während `/impl-plan` (Default: explore → rules → refine) |

## refine — /impl-refine Pipeline

| Slot | Default | Bedeutung |
|------|---------|-----------|
| `refine.steps` | `[]` | Eigene Steps, ausgeführt NACH plan-check + rules-check (Deklarationsreihenfolge, Halt bei Exit ≠ 0) |
| `refine.plan_check.instructions` | `""` | Prosa, an den plan-check-Default-Prompt angehängt (Architektur-/Stil-Präferenzen des Nutzers) |
| `refine.rules_check.instructions` | `""` | Prosa, an den rules-check-Default-Prompt angehängt |

## build — /impl-build Pipeline (pro pending Phase, in Schleife)

| Slot | Default | Bedeutung |
|------|---------|-----------|
| `build.retry_limit` | `3` | Max. failures-getriebene implement-Re-Spawns pro Phase, bevor Phase → blocked |
| `build.steps` | `[]` | Eigene Shell-/Tool-Steps während `/impl-build` (Default: implement) |
| `build.implement.instructions` | `""` | Prosa, an den implement-worker-Prompt angehängt — deine Methodik (z. B. „always TDD: red → green → refactor", „functional core / imperative shell") |
| `build.task_validate.instructions` | `""` | Prosa, an den task-validate-Default-Prompt angehängt (extend-only; nicht abschaltbar) |
| `build.code_validate.instructions` | `""` | Prosa, an den code-validate-Default-Prompt angehängt (extend-only; nicht abschaltbar) |
| `build.stop_check.instructions` | `""` | Prosa, an das Default-Briefing des stop-check-Evaluators angehängt — zusätzliche Halt-vs.-Proceed-Beurteilungskriterien (extend-only). Verschieden von `stop`: `stop` sind die Regeln, die der Evaluator beurteilt; dies tunt den Beurteiler. |
| `build.stop` | `['a decision deviates from the plan']` | GLOBALE Stop-Bedingungen für den autonomen Build-Lauf. Flache Liste natürlichsprachiger Regeln (eine je Element). Der Build läuft autonom und hält beim ERSTEN passenden Treffer zurück zum Nutzer. Leere Liste / weggelassen → voll autonom (Build hält nie selbst). Nicht-leer → stoppt, wenn eine Regel passt. Ziel ist, Stops zu MINIMIEREN; der gelieferte Default ist die einzige Regel `'a decision deviates from the plan'`. |

## wrap — /impl-wrap Pipeline

| Slot | Default | Bedeutung |
|------|---------|-----------|
| `wrap.steps` | `[]` | Eigene Shell-/Tool-Steps während `/impl-wrap` (Default: review → summarize) |

## VCS-Integration

Es gibt absichtlich KEINEN `build.commit`-Slot — anchored ist VCS-agnostisch. Für Auto-Commit pro Phase (oder push, tag, PR öffnen) einen eigenen Step unter `build.steps[]` mit dem VCS der Wahl ergänzen. Beispiel:

```yaml
build:
  steps:
    - { name: commit, run: 'git add -A && git commit -m "phase: ${PHASE_SLUG}"' }
```

## Warum

- `build.task_validate` und `build.code_validate` sind ausdrücklich **extend-only**: die `instructions`-Prosa erweitert den Default-Prompt, der Validierungs-Gate selbst lässt sich nicht deaktivieren.
- `build.stop_check.instructions` tunt den *Beurteiler*, `build.stop` liefert die *beurteilten Regeln* — zwei getrennte Slots, die leicht verwechselt werden.
- `build.stop` als leere Liste oder weggelassen bedeutet voll-autonomen Build ohne Selbst-Halt — der einzige gelieferte Default ist eine einzige Regel.
