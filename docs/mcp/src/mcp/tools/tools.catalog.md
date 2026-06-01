← [tools](_tools.md)

# Tool-Katalog

Vollständige Aufzählung aller 37 MCP-Tools aus `ALL_TOOLS` (`index.ts`) — gruppiert nach Domäne, mit MCP-Toolname, aufgerufener Factory-Methode (`ops.task.…`) und Einzeiler-Zweck. Nachschlage-Referenz, nicht zum Durchlesen. Wrapper-Muster siehe [tools.md](./tools.md).

## task-lifecycle (4)

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__create` | `ops.task.create(slug, initial)` | Neue Task-Datei unter `.claude/tasks/<slug>.yml` anlegen; weigert sich, eine bestehende zu überschreiben. Nur `title` ist Pflicht. |
| `task__read` | `ops.task.read(slug)` | Vollständige geparste Task-Datei als JSON lesen (Source-of-Truth-Sicht auf Phases, ACs, Context-Subsections). |
| `task__set_task_status` | `ops.task.status.set(slug, status)` | Task-Status forward-only transitionieren (`plan → drafted → refined → build → wrap → done`); verweigert `wrap` bei nicht-terminalen Phases. |
| `task__set_title` | `ops.task.title.set(slug, title)` | Task umbenennen — überschreibt `task.title`. |

## question (4)

V0.3 strukturiertes Q&A.

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__question_add` | `ops.task.question.add(slug, {text, priority, origin, phase?})` | Strukturiertes Q&A-Item hinzufügen; jeder Aufruf vergibt sequenzielle id (`q1, q2, …`), Status startet `open`. |
| `task__question_list` | `ops.task.question.list(slug, filter?)` | Fragen auflisten, optional gefiltert nach `priority` / `status` / `phase`; Rückgabe in Einfügereihenfolge. |
| `task__question_resolve` | `ops.task.question.resolve(slug, id, {answer, source, reasoning?})` | Frage per id auflösen; idempotent; validiert `source`/`reasoning`-Invarianten. Nicht zu verwechseln mit `task__resolve_question`. |
| `task__question_retag` | `ops.task.question.retag(slug, id, priority)` | Priority einer bestehenden Frage ändern; Text + answer + status bleiben unverändert. |

## context (8)

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__set_intro` | `ops.task.context.intro.set(slug, content)` | `context.intro` ersetzen — Eröffnungsprosa der Task. |
| `task__append_plan` | `ops.task.context.plan.append(slug, content)` | Markdown an `context.plan` anhängen; leerer/Whitespace-Content ist No-op. |
| `task__resolve_question` | `ops.task.context.plan.refinement.resolve(slug, q_index, resolution)` | Den `q_index`-ten `→ ?`-Refinement-Marker in `context.plan` durch `→ <resolution>` ersetzen (V0.2 Freitext-Marker); wirft `RefinementMarkerNotFound` bei Out-of-Range. |
| `task__append_build_section` | `ops.task.context.build.subsection(section).append(slug, content)` | Markdown an benannte Subsection unter `context.build` anhängen; legt sie an, wenn fehlend; Whitespace-only = No-op. |
| `task__set_build_section` | `ops.task.context.build.subsection(section).set(slug, content)` | Benannte Subsection unter `context.build` ersetzen (oder anlegen). |
| `task__set_wrap_intro` | `ops.task.context.wrap.intro.set(slug, content)` | `context.wrap.intro` setzen — Eröffnungsprosa der Wrap-Stage. |
| `task__append_wrap_section` | `ops.task.context.wrap.subsection(section).append(slug, content)` | Markdown an benannte Subsection unter `context.wrap.subsections` anhängen; legt sie an, wenn fehlend; Whitespace-only = No-op. |
| `task__set_wrap_section` | `ops.task.context.wrap.subsection(section).set(slug, content)` | Benannte Subsection unter `context.wrap.subsections` ersetzen (oder anlegen). |

## phase (10)

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__list_phases` | `ops.task.phase.list(slug)` | `[{name, slug, status}]` für jede Phase zurückgeben — flache Übersicht ohne AC-/Context-Detail. |
| `task__next_phase` | `ops.task.phase.next(slug)` | Nächste zu bearbeitende Phase liefern; in-progress schlägt pending; `null` wenn alle terminal (Signal für Übergang zu wrap). |
| `task__add_phase` | `ops.task.phase.add(slug, {slug: phase_slug, …rest}, position)` | Neue Phase hinzufügen; `position` default `{to: "end"}`, sonst `{after\|before\|to}`; verweigert doppelte Slugs. |
| `task__remove_phase` | `ops.task.phase.remove(slug, phase_slug, {force})` | Phase entfernen; verweigert `done`-Phases außer bei `force: true`. |
| `task__move_phase` | `ops.task.phase.move(slug, phase_slug, target)` | Phase umsortieren; `target` = `{after: slug}` \| `{before: slug}` \| `{to: "start"\|"end"}`; Insert-Index nach der Entfernung aufgelöst. |
| `task__set_phase_status` | `ops.task.phase.status.set(slug, phase_slug, status)` | Phase-Status transitionieren (State Machine); `done` erfordert, dass jede AC bereits `done` ist. |
| `task__set_phase_name` | `ops.task.phase.name.set(slug, phase_slug, name)` | Phase umbenennen — überschreibt `phase.name`; der Slug ist stabiler Identifier und unveränderlich. |
| `task__set_phase_context` | `ops.task.phase.context.set(slug, phase_slug, content)` | `phase.context` ersetzen — die phasenbezogenen Implementierungsnotizen. |
| `task__set_phase_rules` | `ops.task.phase.rules.set(slug, phase_slug, rules)` | `phase.rules` komplett ersetzen; jede Rule ist `{path, why}` (Glob, den der Implement-Agent respektieren muss). |
| `task__increment_retry` | `ops.task.phase.retry_count.increment(slug, phase_slug)` | `phase.retry_count` atomar inkrementieren und neuen Zählerstand `{retry_count}` zurückgeben. |

## ac (8)

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__add_ac` | `ops.task.phase.ac.add(slug, phase_slug, rest)` | Neues Acceptance-Criterion an `phase.acceptance_criteria` anhängen; Status default `pending`; `done` erfordert nicht-leere evidence. |
| `task__remove_ac` | `ops.task.phase.ac.remove(slug, phase_slug, ac_index)` | Die `ac_index`-te AC einer Phase entfernen; Schema verlangt ≥1 AC/Phase (Entfernen der letzten schlägt bei Re-Validate fehl). |
| `task__set_ac_text` | `ops.task.phase.ac.text.set(slug, phase_slug, ac_index, text)` | Prosa der `ac_index`-ten AC neu schreiben. |
| `task__set_evidence` | `ops.task.phase.ac.evidence.set(slug, phase_slug, ac_index, evidence)` | Evidence (`string[]`) setzen; atomar: flippt Status → `done` und löscht ein evtl. `failures`-Feld. |
| `task__add_evidence` | `ops.task.phase.ac.evidence.add(slug, phase_slug, ac_index, line)` | Einzelne Evidence-Zeile anhängen; atomar: flippt Status → `done` falls `pending` und löscht `failures`. |
| `task__set_failures` | `ops.task.phase.ac.failures.set(slug, phase_slug, ac_index, failures)` | Failure-Gründe einer AC erfassen; atomar: flippt Status → `pending` und BEHÄLT evidence. |
| `task__clear_failures` | `ops.task.phase.ac.failures.clear(slug, phase_slug, ac_index)` | `failures`-Feld einer AC entfernen; Status UNVERÄNDERT (Prolog zu `set_evidence` nach erfolgreichem Retry). |
| `task__set_ac_status` | `ops.task.phase.ac.status.set(slug, phase_slug, ac_index, status)` | AC auf `pending` zurücksetzen — löscht BEIDE evidence + failures; einziger akzeptierter `status`-Wert ist `pending`. |

## field (3)

| MCP-Toolname | Factory-Methode | Zweck |
|---|---|---|
| `task__list_fields` | `ops.task.phase.field.list()` | Deklarierte Phase-Fields aus `anchored.yml.task.phase.fields` auflisten (`[{name, type}, …]`); reine Introspektion, kein IO auf Task-Dateien. |
| `task__set_field` | `ops.task.phase.field.set(slug, phase_slug, name, value)` | Deklariertes Phase-Field setzen; `name` muss in `anchored.yml` deklariert sein, `value` wird zum deklarierten Typ gecoerced; wirft `InvalidFieldValue` bei undeklarierten/reservierten Namen. |
| `task__get_field` | `ops.task.phase.field.get(slug, phase_slug, name)` | Wert eines deklarierten Phase-Fields lesen; `undefined` wenn deklariert aber ungesetzt; wirft `InvalidFieldValue` bei undeklariertem Namen. |

## Warum

- **Zwei Resolve-Tools, getrennte Mechanismen.** `task__question_resolve` löst strukturierte V0.3-Q&A-Items (id `q<N>`); `task__resolve_question` ersetzt V0.2-Freitext-`→ ?`-Marker in `context.plan` (per `q_index`) und wird laut Code in einer künftigen Phase entfernt. Trotz ähnlicher Namen kein Ersatz füreinander.
- **Status-Flips sind in die AC-Ops eingebettet, nicht frei.** `set_evidence`/`add_evidence` (→ `done`) und `set_failures` (→ `pending`) flippen den Status atomar mit dem Schreiben. `set_ac_status` akzeptiert per Schema (`z.literal('pending')`) ausschließlich `pending`; der Übergang nach `done` ist nur über `set_evidence` möglich, damit evidence + status gemeinsam landen.
- **Reservierte Field-Namen.** `set_field` lehnt die Namen `status, name, context, rules, acceptance_criteria, retry_count, slug` ab — sie sind feste Phase-Felder, keine deklarierbaren Custom-Fields.
