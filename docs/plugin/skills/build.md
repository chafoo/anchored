← [skills](_skills.md)

# /a:build

Runs the `build` stage of a node. `/a:build <slug>` — tier from the node.

## What

- **Non-Leaf** (task/epic): the `loop` iterates the children (`each`), runs the
  child lifecycle per child; `stop`/`retry_limit` apply.
- **Leaf** (phase): `implement` → `task-validate` → `code-validate`.
- Calls `anchored build <slug>`; runs as autonomously as possible, only stops on a `stop` match.

## How

```mermaid
flowchart TB
    b["/a:build <slug>"] --> k{"Leaf?"}
    k -->|no| loop["loop · each child → child lifecycle"]
    k -->|yes| impl["implement → task-validate → code-validate"]
    loop -. "stop" .-> halt["halt"]
```
