← [core](../_core.md)

# cli

Der `anchored`-Befehl — der **einzige Transport** (kein MCP). Über Bash aus der
Main-Session *und* aus Subagents/headless aufrufbar; Output als **JSON**.

```mermaid
flowchart TB
    bash["Bash · anchored <verb>"] --> disp["cli/index · dispatch"]
    disp --> stage["plan · refine · build · wrap → engine"]
    disp --> node["node-Verben → ops (für Agents)"]
    disp --> json["JSON nach stdout"]
```

| Unit | Verantwortung |
|---|---|
| [commands](commands.md) | Die Verb-Fläche: Stage-Verben (`plan/refine/build/wrap`) + generische Node-Verben. |

> Lazy-init legt einen `Bash(anchored *)`-Allowlist-Eintrag in
> `.claude/settings.local.json` → keine Permission-Prompts pro Aufruf.
