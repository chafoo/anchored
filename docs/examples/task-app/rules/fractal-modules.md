# Pattern: Fractal modules + services, factory functions, colocation

> How code is organized in this project. A **feature is a folder**, and the
> folder decomposes the same way at every level (fractal). Pairs with
> [bun-typescript](bun-typescript.md) (the stack) and the `_concern` rules
> (dom, storage).

## The structure — modules vs. services, fractal

Two kinds of unit:

- **`src/services/<name>/`** — capability code: pure logic or a thin wrapper over a
  platform port. Knows nothing about the DOM layout. Examples: `storage`
  (over `localStorage`), `markdown` (pure render), `theme` (preference + applying
  `data-theme`).
- **`src/modules/<name>/`** — a UI feature unit that owns a piece of the DOM and
  wires services to it. Examples: `task-list`, `status-selector`, `composer`,
  `detail`, `sidebar`.

A module may contain **sub-modules** (its own `modules/` or role folders) when it
grows — same pattern, one level down. Shared, injected interfaces live in
`src/lib/contracts/`; shared cross-module types (`Task`, `TaskStatus`) in
`src/lib/types/`. The **composition root** `src/app/app.ts` is the only place that
imports concrete modules/services and wires them together.

## Naming & colocation

- **Folder == entry file.** The main file is named after its folder
  (`storage/storage.ts`, `task-list/task-list.ts`). **No `index.ts`. No barrel
  files** (no re-export-only files) — import directly from the source module.
- **Content suffixes**, colocated next to the entry, only when they actually exist:
  - `<name>.types.ts` — the module's own interfaces/types.
  - `<name>.const.ts` — its constants / grouped frozen objects.
  - `<name>.compute.ts` — extracted **pure** logic (no I/O, no clock) when the
    entry's logic grows enough to warrant it.
- **Tests colocate** in the same folder as their subject, as **`<name>.test.ts`**
  (Bun's `bun:test` — this project's runner; see [bun-typescript](bun-typescript.md)).
  Write the failing test first (red → green → refactor).
- **Bundle-folder trigger:** a lone file stays flat until it gains a companion
  (a `.types.ts`, a `.test.ts`, …); then the whole bundle moves into its
  `<name>/` folder.

## Construction — factory functions, dependency injection

- **Stateful / wired units are factory functions:**
  `createX(deps: CreateXParams): X` — returns an object of verbs, with state held
  in the **closure** over `deps`. Used by every module and by services that hold
  state or a port (`createStorage`, `createTheme`, `createTaskList`).
- **Pure, stateless logic is plain exported functions** (`renderMarkdown(src)`,
  `formatRelative(ts)`) — no factory needed.
- **Dependencies are injected by typed contract**, never reached for globally. A
  module imports the *interface* from `lib/contracts/`, not another module's
  concrete file. The composition root supplies the implementations.
- **No classes, no `new`, no `this`** for app logic. State is closures, not
  instance fields. (Plain data types / type aliases are fine.)

```ts
// src/services/storage/storage.types.ts
export interface CreateStorageParams { store: KeyValuePort }   // a contract, not localStorage directly
export interface Storage {
  load(): Store
  addTask(title: string): Task
  setStatus(id: string, status: TaskStatus): void
  // ...
}

// src/services/storage/storage.ts
export const createStorage = (deps: CreateStorageParams): Storage => {
  const { store } = deps
  // closure state + verbs ...
  return { load, addTask, setStatus, /* ... */ }
}
```

## NOT allowed

- No `index.ts` as a folder entry; no barrel / re-export-only files.
- No classes / `new` / `this` for modules or services.
- No module importing another module's concrete file — go through a
  `lib/contracts/` interface and let `app.ts` wire it.
- No global singletons or import-time side effects (no FS/DOM/`localStorage`
  touched on import).

## Example layout (this app)

```
src/
  app/app.ts                  # composition root — wires services + modules, mounts
  lib/
    contracts/                # injected dep interfaces (KeyValuePort, ...)
    types/                    # shared types: Task, TaskStatus
  services/
    storage/  storage.ts  storage.types.ts  storage.test.ts
    markdown/ markdown.ts  markdown.test.ts          # pure renderMarkdown()
    theme/    theme.ts     theme.test.ts
  modules/
    sidebar/         sidebar.ts
    composer/        composer.ts
    task-list/       task-list.ts  task-list.types.ts
    status-selector/ status-selector.ts
    detail/          detail.ts
```
