# Rule: Fraktale Integrität — Mechanismus vs. Policy, Invariante im Substrat

> Geltung: Engine, Substrat, Schema, State, Default-Template. Nicht-verhandelbar.

## Mechanismus (Code, fix) vs. Policy (Config, austauschbar)

- **Mechanismus = deterministischer Code**: die Etagen-Form, State-Machine +
  Transitions (forward-only), die harte Invariante, atomic-writes, Audit-Trail,
  die Tier-Mechanik (Status-Enum, Kind-Beziehung). Lebt in `engine/`, `state/`,
  `ops/`, `parser/`, `io.ts`, der Mechanik-Hälfte von `schema/tiers/*`.
- **Policy = Config/Template, austauschbar**: WAS in jeder Stage passiert (die
  Step-Sequenzen) + die `fields` (Daten-Modell-Shape). Lebt im Default-Template
  (`anchored.default.yml`) + den User-Deltas in `anchored.yml`.

Wenn du überlegst, wo etwas hingehört: Verhalten, das der User umkonfigurieren
können soll → Policy (Step/Feld). Garantie, die nie brechen darf → Mechanismus.

## Keine privilegierten Built-ins

Alles opinionierte Verhalten (implement, Validatoren, scaffold, decompose …) ist
ein **Step** im Default-Template — aktiv by default, voll überschreib-/ersetzbar.
Kein Step ist im Engine-Code hardcoded. Die Engine dispatcht config-getrieben
(`resolve-steps` setzt Defaults ein), sie kennt keine konkreten Step-Namen.

## Harte Invariante (im Datenmodell, nicht in einem Step)

**Ein `ac` geht nur auf `status: done`, wenn `evidence` vorliegt.** Erzwungen in
`state/invariants.ts` am schreibenden Op — NICHT in einem Step, der weggelassen
werden könnte. „Alles konfigurierbar" gilt, OHNE die USP zu verlieren.

## Engine = deterministisch, AI = Effekt hinter `spawn`

Kontrollfluss (welche Stage/Step), Transitions, `retry`, `stop`, atomic-writes,
Invariante = reiner, getesteter Code. AI-Worker sind **Effekte**, die die Engine
über die injizierte `spawn`-Dep triggert. Niemals AI-Aufrufe direkt im
Kontrollfluss — immer hinter der Naht (fakebar im Test).

## v1 ist Referenz, nicht Port

`~/Dev/anchored/mcp/src` ist prozedural + MCP-getrieben. Nutze es als **Logik-
Vorlage** (wie Validierung/Transitions/Render gedacht waren), aber **schreibe
alles neu im Factory-Pattern** ([[factory-functions]]). Kein Copy-Paste, kein
1:1-Port.

## Referenz

`docs/design/fractal-lifecycle.md`, `docs/design/fractal-redesign-notes.md`
(„Mechanismus vs. Policy", „Harte Invariante"). [[cli-only-transport]].
