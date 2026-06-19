# localStorage key naming: app-scoped prefix

When using `localStorage` (or `sessionStorage`), always prefix keys with an
app-specific namespace to avoid collisions with other pages on the same origin.

For this task-app kata the prefix is `notes:`:

- `notes:tasks` — the list of task objects (each task's note is raw Markdown)
- `notes:theme` — the active light/dark theme preference

**Quota awareness:** `localStorage` holds ~5 MB. Every write that can grow must
catch `QuotaExceededError` and surface a user-visible warning rather than
throwing or silently losing data.

**Why:** a project page may share an origin with other demos — prefixing prevents
key collisions and makes storage easy to inspect in DevTools.

**Applies to:** any `.ts` file that calls `localStorage.setItem` /
`localStorage.getItem`.
