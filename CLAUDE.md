# CLAUDE.md — repo guidance for Claude Code

anchored ships in two places that stay in lockstep (same version):

- **`mcp/`** — the `@chaafoo/anchored-mcp` npm package (MCP server + `anchored` CLI).
- **`plugin/`** — the Claude Code marketplace plugin, pulled **directly from `main`** on every install.

Release process: see [`RELEASING.md`](./RELEASING.md). Architecture docs: [`docs/`](./docs/).

## ⚠️ Never commit local changes to `plugin/.mcp.json`

`plugin/.mcp.json` is tracked, and its **committed** form must stay portable:

```json
{ "task": { "command": "npx", "args": ["-y", "@chaafoo/anchored-mcp"] } }
```

That `npx` form is what published-plugin / marketplace users run — it needs no
local install. **During local dogfooding** you typically point it at your local
build instead:

```json
{ "task": { "command": "node", "args": ["/Users/<you>/Dev/anchored/mcp/dist/mcp/server.js"] } }
```

**Do not commit that local modification.** Why:

- It's an **absolute, machine-specific path** — it works only on your machine and
  breaks the MCP server for every other user.
- The marketplace plugin is served straight from `main`, so committing it would
  ship a broken `.mcp.json` to all installs.
- It leaks a local filesystem path into the public repo.

So when staging, **exclude it** — stage specific files (`git add <paths>`), never
a blind `git add -A`/`git commit -a`. The working tree will routinely show
`M plugin/.mcp.json`; that is expected and stays uncommitted.

Optional hard guard (per-clone, not shared): tell git to ignore your local
change so it can't be staged by accident —

```bash
git update-index --skip-worktree plugin/.mcp.json
# undo with: git update-index --no-skip-worktree plugin/.mcp.json
```

(Caveat: while skip-worktree is set, git also hides any *legitimate* future change
to the committed file — re-enable with `--no-skip-worktree` before pulling such a
change.)

## Quality gates (run from `mcp/`)

`npm run lint` · `npm run format:check` · `npm run typecheck` · `npm test` ·
`npm run build`. CI (`.github/workflows/ci.yml`) runs all of these plus
`size-limit`, `license`, and a production `npm audit`; the publish workflow runs
them again before publishing on a `v*` tag.
