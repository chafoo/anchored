← [core](../_core.md)

# cli

The `anchored` command — the **only transport** (no MCP). Callable via Bash from
the main session *and* from subagents/headless; output as **JSON**.

```mermaid
flowchart TB
    bash["Bash · anchored <verb>"] --> disp["cli/index · dispatch"]
    disp --> stage["plan · refine · build · wrap → engine"]
    disp --> node["node verbs → ops (for agents)"]
    disp --> json["JSON to stdout"]
```

| Unit | Responsibility |
|---|---|
| [commands](commands.md) | The verb surface: stage verbs (`plan/refine/build/wrap`) + generic node verbs. |

> Lazy-init adds a `Bash(anchored *)` allowlist entry in
> `.claude/settings.local.json` → no permission prompts per call.
