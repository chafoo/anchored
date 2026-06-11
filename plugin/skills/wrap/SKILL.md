---
name: wrap
description: Finalize an anchored node whose build is complete — review + summarize (leaf) or roll-up (epic). Triggers ONLY on the explicit `/a:wrap <slug>` command. Runs the wrap stage via the `anchored` CLI. Use for `/a:wrap`, not for general "wrap up" requests.
---

# /a:wrap — fractal wrap stage

Explicit-only: the user typed `/a:wrap <slug>`.

## Pre-flight

- Load `anchored.yml`. Resolve the `<slug>`; the **tier is derived from the node**
  (the only argument is the slug).
- State gate: wrap expects a node whose build phases are terminal.

## Run (CLI-only, via Bash)

```bash
anchored wrap <slug>
```

- **Leaf / task**: `review → summarize`.
- **Epic**: `roll-up` — Definition-of-Done against `epic.acceptance` + a retro.

The CLI emits a JSON envelope; relay the summary. After wrap, the node is `done`.
No MCP, no raw node-file edit.
