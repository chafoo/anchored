← [mcp](../_mcp.md)

# src

Der TypeScript-Quellcode des MCP-Pakets, geschnitten in eine klare
**Abhängigkeitskette**: `schema` definiert die Form, `core` implementiert die Logik
darüber, `cli` und `mcp` sind die beiden dünnen Transport-Frontends, `parser`
serialisiert zwischen YAML und Typ.

```mermaid
block-beta
  columns 3
  schema["schema/ — Zod-Form"] core["core/ — Logik-Factory"] transport["cli/ + mcp/ — Transport"]
  parser["parser/ — YAML ↔ TaskFile"] ops["ops/ — State-Machines"] space["&nbsp;"]
  schema --> core
  core --> transport
  parser --> core
  ops --> core
```

| Bereich | Verantwortung (Scope-Grenze) |
|---|---|
| [schema](schema/_schema.md) | Die Zod-Definitionen + kanonische Schema-URLs — die exakte Form von Task-File und `anchored.yml`. Die Spec, an die sich alles andere hält. |
| [core](core/_core.md) | Die `createOps`-Factory + Fundamente (Config, atomares I/O, YAML-Parsing, Stop-Check-Routing). Jede Task-File-Mutation läuft hier durch. |
| [ops](ops/_ops.md) | State-Machine-Definitionen + Typ-Coercion + Fehlerklassen, die jede Mutation vor dem Persistieren gegenprüft. |
| [parser](parser/_parser.md) | YAML→TaskFile parsen (mit Sicherheits-Caps) und TaskFile→YAML rendern (mit LSP-Schema-Direktive). |
| [cli](cli/_cli.md) | Das `anchored`-CLI-Binary: commander-Verdrahtung, die die Ops 1:1 als Subcommands spiegelt. |
| [mcp](mcp/_mcp.md) | Das `anchored-mcp`-Server-Binary: registriert 37 MCP-Tools, jedes ein dünner Wrapper um die Factory. |
