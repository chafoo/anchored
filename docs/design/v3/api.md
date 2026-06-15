# anchored v3 — CLI API

**Decided:** one grammar. The tier is always the first token; everything you do is a
verb on it.

```
anchored <tier> <verb> [slug] [args]
```

Two axes, one shape:
- **tier** — the resource, nested: `epic ▸ task ▸ phase` (project removed — YAGNI, see add-ons.md)
- **verb** — what you do, in three levels (below)

Nesting lives in the **slug** (`my-epic/login/setup`), never in the grammar.

## Three verb levels

```
anchored <tier> <stage>                        # lifecycle    — plan refine build wrap
anchored <tier> <verb> <slug> [args]           # node         — get set status
anchored <tier> <collection> <op> <slug> …     # sub-resource — ac question child …
```

### Level 1 — lifecycle (identical on every tier)

```
anchored epic  plan   "auth system"
anchored task  build  my-epic/login
anchored phase build  my-epic/login/setup       # phase = leaf (build without each)
```

`plan · refine · build · wrap` — the fractal lifecycle, the same four verbs on every
tier. A stage is just a verb.

### Level 2 — the node itself

```
anchored task get     my-epic/login
anchored task status  my-epic/login build
anchored task set     my-epic/login title "…"
```

`get` · `set <field> <value>` · `status <to>`  (plus `create` · `archive` · `reset`)

### Level 3 — collections (sub-resource + op)

Regular, not bespoke: `<tier> <collection> <op>`. An agent that learns the pattern
derives every command — no list of 30 hyphenated verbs to memorize.

```
anchored phase ac  add      my-epic/login/setup "…"
anchored phase ac  done     my-epic/login/setup a1
anchored phase ac  evidence my-epic/login/setup a1 "…"
anchored phase ac  fail     my-epic/login/setup a1 "…"
anchored task  question add my-epic/login "…"
anchored epic  child add    my-epic new-task [goal] [deps]
anchored epic  child next   my-epic
```

## Which tier has which collections

| tier    | lifecycle              | node           | collections                             |
|---------|------------------------|----------------|-----------------------------------------|
| epic    | plan refine build wrap | get set status | child · acceptance · question · concern |
| task    | plan refine build wrap | get set status | phase · question · concern              |
| phase   | (leaf — no stages)     | get set status | ac · rule                               |

Same form in every cell — only the collections differ, and which collections a tier
has comes from the schema/config.

## Parent / child split

- The **parent** owns a child's *existence + order* → `epic child add/next/ready`,
  `task phase add/list`.
- The **child tier** owns its *own content + lifecycle* → `phase ac add`,
  `phase status`, `task build`.

Resolves "is a phase child-data or a tier?" — it's both, addressed at different
levels.

---

**Principle:** one grammar · tier-first · stages-are-verbs · collections-are-
sub-resources. Optimized for **predictability** (agents derive commands) over
brevity. The code mirrors it 1:1 — `modules/<tier>/` with a CLI part per verb level.

> Full migration plan (layout move, services split, rules/docs lockstep):
> `docs/design/tier-cli-redesign.md`.
