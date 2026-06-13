← [core](../_core.md)

# cli

**BLUF:** `cli/` is the **sole transport** — the `anchored` command, callable via Bash
from the main session *and* from subagents/headless, no MCP. `cli.ts` is a **pure
factory** (`createCli(deps) → { run(argv) }`) that does **only two things**: dispatch
the verb and wrap every outcome in the JSON envelope `{ ok, command, result|error }`.
All domain logic lives **outside** the transport under `commands/` — even the
stage-classify tripwire (`slugFromInput` + `classifyTier`) was pulled out into
`commands/stage/classify.ts` so `cli.ts` and the per-verb command files stay
arg-parsing + dispatch only.

```mermaid
block-beta
  columns 1
  bash["Bash · anchored &lt;verb&gt;"]
  cli["cli.ts · createCli(deps) · verb switch + JSON envelope"]
  block:groups
    stage["commands/stage · plan refine build wrap steps + classify"]
    node["commands/node · generic node verbs"]
    lifecycle["commands/lifecycle · archive reset + require-node"]
  end
  json["one JSON envelope { ok, command, result|error } → deps.out"]
  bash --> cli
  cli --> stage
  cli --> node
  cli --> lifecycle
  cli --> json
```

| Area (link) | Responsibility (scope boundary) |
|---|---|
| `cli.ts` | The factory: verb switch, central error-catch, the `{ ok, command, result\|error }` envelope. No process access (that is the bin entry), no domain logic. |
| [commands](commands/_commands.md) | Everything the verbs *do* — the three command groups (`stage` / `node` / `lifecycle`) plus the pulled-out pure helpers. |

> Lazy-init adds a `Bash(anchored *)` allowlist entry in
> `.claude/settings.local.json` → no permission prompt per call.
