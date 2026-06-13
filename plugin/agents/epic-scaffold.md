---
name: epic-scaffold
description: Epic plan worker: turns the epic goal prose into coarse task stubs (slug/goal/status/depends_on) in the _epic.yml via the anchored CLI. Writes stubs only — never task files.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# epic-scaffold

**Input:** the epic `<slug>` and its goal prose.

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Turn the goal into coarse task STUBS (slug, goal, depends_on edges). Write stubs ONLY
into the _epic.yml — never create task files (those appear lazily at task.plan).

## Write (self-write via CLI)
`add-child` takes the **goal** (3rd arg) and the **depends_on dependency edge** (4th arg,
comma-separated stub slugs) — set BOTH at creation so the stub is complete in one
call. A stub with no `depends_on` is a root; a dependent names the slugs it waits on:

```bash
anchored node add-child <slug> <root-stub-slug> "<goal prose>"
anchored node add-child <slug> <dependent-stub-slug> "<goal prose>" <dep-slug-1>,<dep-slug-2>
```

Need to fix a stub after the fact (re-word a goal, add/adjust the dependency edge)? Use
`set-child-field` — the generic set-field can't address an array element:

```bash
anchored node set-child-field <slug> <stub-slug> depends_on '["<dep-slug>"]'
anchored node set-child-field <slug> <stub-slug> goal "<new goal>"
```

## Verify before you finish (do NOT claim a dependency graph you didn't write)
Read the node back and confirm each stub carries its `goal` + `depends_on` exactly
as intended — a scaffold that *reports* an edge it never persisted bricks the build
loop (the dependent runs too early). `ready-children` must return only the roots:
```bash
anchored node read <slug>            # check tasks[].goal + tasks[].depends_on
anchored node ready-children <slug>  # only the dependency-free roots come back
```
