← [state](_state.md)

# transitions

The **forward-only** state machines — one per tier. `assertTransition` only allows
permitted status transitions; backward/skip throws.

## What

- One transition table per tier (from the [tier descriptor](../schema/tiers.md)):
  - task: `plan → drafted → refined → build → wrap → done`
  - epic: `planning → building → done`
  - phase: `pending → in-progress → {done|blocked|deferred}`
- `assertTransition(tier, from, to)` — illegal transition → throw.
- The only permitted backward edge: the update-mode exception (`→ drafted`),
  if v2 adopts it — otherwise strictly forward.

## How

```mermaid
stateDiagram-v2
    [*] --> plan
    plan --> drafted --> refined --> build --> wrap --> done
    done --> [*]
```

*(task shown; epic/phase analogous, own table.)*
