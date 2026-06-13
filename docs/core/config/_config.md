← [core](../_core.md)

# config

Loads the **base dependency** `config`: the effective configuration injected into
all factory functions. Once at bootstrap, then immutable.

```mermaid
flowchart LR
    def["anchored.default.yml · framework base"] --> m["merge"]
    usr["<project>/anchored.yml · user deltas"] --> m
    m --> eff["effectiveConfig → deps.config"]
```

| Unit | Responsibility |
|---|---|
| [bootstrap](bootstrap.md) | `effectiveConfig = merge(default, user)`, validated; builds `deps`. |
| merge | Deep-merge (user wins) — described together in `bootstrap.md`. |
| [init](init.md) | Lazy first-run scaffolding: writes a minimal `anchored.yml` + the `Bash(anchored *)` allowlist entry. Idempotent, over the io seam. |
