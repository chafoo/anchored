← [state](_state.md)

# transitions

Die **forward-only** State-Machines — eine pro Tier. `assertTransition` lässt nur
erlaubte Status-Übergänge zu; rückwärts/überspringen wirft.

## Was

- Pro Tier eine Übergangstabelle (aus dem [tier-Deskriptor](../schema/tiers.md)):
  - task: `plan → drafted → refined → build → wrap → done`
  - epic: `planning → building → done`
  - phase: `pending → in-progress → {done|blocked|deferred}`
- `assertTransition(tier, from, to)` — illegaler Übergang → throw.
- Einzige erlaubte Rückwärts-Kante: die Update-Mode-Ausnahme (`→ drafted`),
  falls v2 sie übernimmt — sonst strikt vorwärts.

## Wie

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> drafted --> refined --> build --> wrap --> done
    done --> [*]
```

*(task gezeigt; epic/phase analog, eigene Tabelle.)*
