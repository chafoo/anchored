# Rule: Factory-Function-Pattern überall

> Geltung: gesamtes `core/` (Engine, Substrat, Ops, Config) und jeder neue Code.
> Nicht-verhandelbar. Dies ist das oberste Architektur-Prinzip von anchored v2.

## Die Regel

**Jedes Modul exportiert eine Factory-Function** der Form:

```ts
export function createX(cfg, deps) {
  // closure-State hier (falls überhaupt nötig)
  return {
    run(input) { … },        // oder benannte Verben für Ops:
    // create(), read(), setStatus(), addChild(), …
  }
}
```

`createX(cfg, deps) → { run(input) → output }` (Engine-Ebenen) bzw.
`createX(cfg, deps) → { verb(args) → result }` (Ops). Jede Ebene hat einen
klaren input/output-Vertrag.

## Immer

- **Deps werden injiziert** — `spawn`, `ops`, `parser`/`render`, `validate`/`state`,
  `config` kommen als `deps`-Argument rein. Nie direkt importiert + aufgerufen,
  wo sie als Effekt-Naht dienen.
- **Im Test durch Fakes ersetzbar** — `createStepRunner({ spawn: fakeSpawn, ops: fakeOps })`
  muss reichen, um die Ebene ohne echtes CC/FS zu testen.
- **Tiefere Helfer in `scope/`** — jede Factory darf Helfer in ihrem `scope/`-Ordner
  haben, auch mit klarem input/output (z.B. `engine/scope/loop-step.ts`).
- **`cfg` = die gemergte effectiveConfig** (oder ein Teil davon), einmal beim
  Bootstrap geladen und durchgereicht.

## Nie

- **Keine Klassen** für Engine/Ops/Substrat-Logik. (Reine Daten-Typen/Zod-Schemas
  sind ok.)
- **Keine Modul-Level-Singletons oder Top-Level-Seiteneffekte** — kein Modul, das
  beim Import State aufbaut, FS anfasst oder eine Verbindung öffnet.
- **Keine freistehenden Funktionen mit verstecktem/globalem State.** Reine,
  zustandslose Pure-Helper sind ok; alles mit State/Effekt gehört hinter eine Factory.
- **Kein direkter Import einer Effekt-Dep** (spawn, fs-write) in tief liegender
  Logik — geht durch die injizierte Naht.

## Warum

Testbarkeit (Fake-Deps), Austauschbarkeit (spawn agent↔`claude -p`, transport
MCP↔CLI ohne Runner-Anfassen), Erweiterbarkeit (neuer Step-Typ = eine Datei in
`scope/`). Das ist das trader-Pattern, konsequent auf den fraktalen Lifecycle
angewandt. Siehe `docs/design/engine-architecture.md`.

## Referenz

`docs/design/engine-architecture.md` (beide Fraktale, Pseudo-TS).
[[fractal-substrate-integrity]] grenzt ab, was Mechanismus (Code) vs. Policy
(Config) ist.
