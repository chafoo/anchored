# Ticket: Harden-2 — Deterministische Completion + echte Concurrency (M-Tier)

**Quelle:** Härtungs-Review. Diese Gruppe berührt den Substrat-Kern (Completion-
Garantien + Schreib-Serialisierung) — braucht mehr Tests, ändert aber NICHT den
Agent-Contract. M-Aufwand.

## Findings + Fix

### M1 — Task/Epic erreicht `done` mit pending/blocked Kindern (Completability vakuum)
`assertNodeCompletable` (`invariants.ts:51`) prüft `node.acceptance_criteria` —
aber task/epic haben keine *eigenen* ACs → `[]` → trivial pass. Der einzige
Wächter ist die forward-only-Transition, die die Kinder NIE ansieht
(`node-ops.ts:150`). Heißt: ein Epic kann `done` werden, während ein Task-Stub
noch `pending` ist.
**Fix:** `setStatus` kind-aware machen — bei `→wrap`/`→done` mit `childField` jedes
Kind als terminal-erfolgreich asserten (Epic: jeder Stub `done`; Task: jede Phase
`done`), sonst typisierter `ChildrenIncomplete`-Fehler. Implikation siehe Chat.

### M2 — Child-Stub/Phase erreicht `done` mit evidenzlosen eigenen ACs
`setChildStatus`/`setChildField` (`node-ops.ts:430-466`) validieren nur den
Loop-Queue-Enum, prüfen aber nie, dass die eigenen ACs des Stubs/der Phase
evidence-backed sind — dieselbe Lücke eine Etage tiefer.
**Fix:** beim Flip auf done-Marker ein `assertNodeCompletable`-Äquivalent über die
Kind-ACs laufen lassen; child-`status` aus `setChildField` denylisten.

### M3 — Epic-`acceptance[]` (der Vertrag) ohne harte Invariante
`setAcceptanceStatus` (`node-ops.ts:236`) flippt ein Epic-DoD-Item ohne Anlage auf
done; ein halluzinierender roll-up stempelt das ganze Epic geliefert.
**Fix:** die harte Invariante auf epic-`acceptance[]` ausdehnen (Generalisierung
von `assertAcDoneHasEvidence`, minimaler Contract-Pointer), kombiniert mit M1.

### M4 — Production-Write-Lock ist No-op → Lost-Update
`bin.ts:41` verdrahtet `lock: { acquire: async () => async () => {} }` — der
cross-process-Lock, um den `io.ts:30-49` gebaut ist, ist wirkungslos. Zwei parallele
`anchored`-Prozesse auf derselben `_epic.yml` (genau das parallele Epic-Fan-out-
Modell) read-modify-write last-writer-wins, Evidenz still verloren.
**Fix:** echten File-Lock (O_EXCL/`wx`-Lockfile mit PID + Stale-Takeover, oder
`proper-lockfile`) hinter der bestehenden `IoLock`-Naht in `bin.ts` verdrahten;
plus Compare-and-Swap (mtime/hash im Lock), da whole-node read-modify-write auch
mit Lock inhärent verlieren kann. Test: stateful Fake-Lock + Concurrency-Szenario.

### M5 — `mergeRec` ohne Tiefenschranke + kein SIZE_CAP auf anchored.yml
`mergeRec` (`merge.ts:66-83`) hat keine Tiefenschranke; der anchored.yml-Parse-Pfad
(`bin.ts:60`) hat kein SIZE_CAP/`maxAliasCount` (anders als Task-Files). Hostile/
riesige Config → Stack-Overflow/Blow-up.
**Fix:** Tiefenguard (~64) in `mergeRec`; SIZE_CAP + konservatives `maxAliasCount`
auf den anchored.yml-Parse.

## Test-Schulden (parallel)
- `assertNodeCompletable` end-to-end für task/epic.
- Concurrency-Test mit statefulem Fake-Lock (beweist Serialisierung).
