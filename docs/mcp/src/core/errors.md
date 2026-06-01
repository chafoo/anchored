← [core](_core.md)

# Fehler-Katalog (`errors.ts`)

Vollständiges Nachschlage-Verzeichnis aller getypten Fehlerklassen der Factory-Ops-Schicht — pro Klasse: Wann sie geworfen wird und welche `suggestions[]` sie trägt.

`src/core/errors.ts` ist die öffentliche Fehler-Oberfläche der Factory. Sie re-exportiert die State-Machine-/Validierungsfehler aus `../ops/validate.js` und definiert zusätzlich die factory-spezifischen Klassen lokal. Jede Klasse erbt von `AnchoredError` und besitzt einen Konstruktor `(message: string, suggestions: string[] = [])`.

## Zu `suggestions[]`

Die `suggestions: string[]` sind **keine Literale in der Klassendefinition** — der Konstruktor jeder Klasse defaultet sie auf `[]` und übernimmt sie vom Aufrufer an der Throw-Site (1-3 konkrete Recovery-Schritte). CLI gibt sie als Bulletliste unter der Fehlermeldung aus; MCP-Tools legen sie in `error.data.suggestions` ab, damit Agents sie programmatisch lesen können. Die Spalte „suggestions[]" unten listet daher das Vertragsdetail der Klasse, nicht fixe Texte.

## Basisklasse

| Klasse | Herkunft | Wann geworfen | suggestions[] |
| --- | --- | --- | --- |
| `AnchoredError` | `validate.ts` (re-exportiert) | Basisklasse für alle Service-Layer-Fehler — selbst nicht direkt geworfen; erbt von `Error`. Hält `public readonly suggestions: string[]`. | Default `[]`; trägt 1-3 konkrete Recovery-Aktionen (CLI-Befehle, MCP-Tool-Calls oder kurze Schritte). |

## Re-exportiert aus `../ops/validate.js`

| Klasse | Wann geworfen | suggestions[] |
| --- | --- | --- |
| `InvalidTransition` | Bei unzulässigem State-Machine-Übergang (Status-Transition nicht erlaubt). | Default `[]`; vom Aufrufer befüllt. |
| `InvalidFieldType` | Wenn der Wert eines **deklarierten** Felds die Typprüfung gegen seine Deklaration nicht besteht (feuert nur bei Typ-Mismatch). | Default `[]`; vom Aufrufer befüllt. |
| `OutOfRange` | Wenn ein Wert außerhalb des erlaubten Bereichs liegt. | Default `[]`; vom Aufrufer befüllt. |
| `InvalidEvidence` | Wenn ein Evidence-Wert ungültig ist. | Default `[]`; vom Aufrufer befüllt. |
| `NotFound` | Wenn ein Task/Phase-Lookup ins Leere geht (Ziel existiert nicht). | Default `[]`; vom Aufrufer befüllt. |
| `IncompleteEvidence` | Von `phase.status.set("done")`, wenn ein oder mehrere Acceptance Criteria noch leere Evidence haben. Erzwingt anchoreds USP: Phase nur „done", wenn jedes AC eine konkrete Proof-Zeichenkette hat. Fix: fehlende Evidence via `ac.evidence.set` füllen oder zu blocked/deferred wechseln. | Default `[]`; vom Aufrufer befüllt. |
| `IncompletePhases` | Von `task.status.set("wrap")`, wenn eine oder mehrere Phasen noch in `pending` oder `in-progress` sind. Jede Phase muss zuerst einen terminalen Zustand (`done` \| `blocked` \| `deferred`) erreichen. Verhindert vorzeitigen Wrap-up. | Default `[]`; vom Aufrufer befüllt. |

## Lokal definiert in `errors.ts`

| Klasse | Wann geworfen | suggestions[] |
| --- | --- | --- |
| `DuplicateSlug` | Beim Erstellen eines Tasks, dessen Slug bereits ein Task-File auf der Platte hat — oder beim Hinzufügen einer Phase, deren Slug mit einer existierenden Phase im selben Task kollidiert. | Default `[]`; vom Aufrufer befüllt. |
| `IncompletePhase` | Von `phase.status.set('done')`, wenn ein oder mehrere Acceptance Criteria der Phase noch `status='pending'` haben. V0.2 verschiebt das USP-Gate auf die AC-Status-Ebene (war in v1 auf Evidence-Ebene): Phase ist „done" gdw. jedes AC „done" ist. Fix: jedes pending AC vor dem Retry auf `done` treiben (via `ac.evidence.set` oder `ac.status.set` nach Befüllen der Evidence). | Default `[]`; vom Aufrufer befüllt. |
| `RefinementMarkerNotFound` | Von `context.plan.refinement.resolve`, wenn der `q_index`-te `Q: ... → ?`-Marker im Plan-Content nicht gefunden wird — entweder Index außerhalb des Bereichs (kein N-ter Marker) oder Plan hat gar keine ungelösten Refinement-Marker. | Default `[]`; vom Aufrufer befüllt. |
| `InvalidFieldValue` | Von `phase.field.set` / `phase.field.get`, wenn der Feldname nicht in `anchored.yml.task.phase.fields` deklariert ist, ODER der Wert die Typprüfung gegen die Deklaration nicht besteht, ODER der Name mit einem reservierten Built-in-Phase-Key kollidiert (`status`, `name`, `context`, `rules`, `acceptance_criteria`, `retry_count`, `slug`). Breiterer „Feldname ist falsch"-Fehler — abgegrenzt von `InvalidFieldType` (nur Typ-Mismatch eines deklarierten Felds). | Default `[]`; vom Aufrufer befüllt. |
| `DonePhaseImmutable` | Von `phase.remove`, wenn die Ziel-Phase `status='done'` hat und der Aufrufer kein `{ force: true }` übergeben hat. Done-Phasen repräsentieren bewiesene Arbeit; stilles Entfernen würde die rechtfertigende Evidence verwerfen. Das force-Flag ist die explizite Bestätigung. | Default `[]`; vom Aufrufer befüllt. |
| `DocumentTooLarge` | Vom zentralen YAML-Parser (`core/parser.ts`), wenn das Roh-Dokument den 1-MB-Hard-Cap überschreitet. So große Task-Files sind entweder ein Runaway-Accumulation-Bug (unbegrenzt wachsende context/audit-Historie) oder eine Parse-Bomb (YAML-Alias-Expansion). Cap liegt weit über jeder legitimen Größe — größte Dogfood-Task-Files in V0.1 ~60 KB. | Default `[]`; vom Aufrufer befüllt. |
| `WriteContention` | Von `core/io.ts:atomicWrite`, wenn der Cross-Process-Lock auf das Ziel-Task-File nicht innerhalb des Retry-Budgets (3 Retries × 100 ms Backoff = ~400 ms) erworben werden kann. Zeigt an, dass ein anderer anchored-Prozess dieselbe Datei aktiv schreibt. Fix: warten + Operation erneut versuchen, oder Race untersuchen (one-task-per-worktree empfohlen, siehe `plugin/references/state-mutations.md`). Stale Locks (>10 s alt, vorheriger Prozess gecrasht) reklamieren sich automatisch — dieser Fehler feuert nur bei echter Live-Contention. | Default `[]`; vom Aufrufer befüllt. |
| `QuestionNotFound` | Von `task.question.resolve` und `task.question.retag`, wenn die übergebene Question-ID nicht im `questions[]`-Array des Tasks existiert. Fix: offene Fragen zuerst auflisten, um valide IDs zu finden (`task.question.list({ status: 'open' })`). | Default `[]`; vom Aufrufer befüllt. |
| `InvalidQuestionResolution` | Von `task.question.resolve`, wenn der Input die Resolution-Invarianten verletzt: `source='ai'` ohne nicht-leeres `reasoning`; `source='user'` mit `reasoning`-Argument (User-Antworten tragen kein Reasoning — Fragetext + Antwort sind der Record); leerer/nur-Whitespace Answer-String. Abgegrenzt von `QuestionNotFound` („ID falsch") — hier ist „ID richtig, aber Resolution-Payload fehlerhaft". | Default `[]`; vom Aufrufer befüllt. |

## Warum

`InvalidFieldType` und `InvalidFieldValue` existieren beide bewusst: `InvalidFieldType` feuert ausschließlich bei Typ-Mismatch eines **bereits deklarierten** Felds, während `InvalidFieldValue` der breitere Fehler für „Feldname unbekannt / reserviert / typwidrig" ist. Analog trennen `QuestionNotFound` (ID existiert nicht) und `InvalidQuestionResolution` (ID korrekt, Payload malformed) den Lookup-Fehler vom Payload-Fehler.
