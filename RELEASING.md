# Releasing anchored

This doc is for me (the maintainer), not end users.

anchored ships in two places that must stay in lockstep:

1. **`@chaafoo/anchored-mcp`** on the npm registry — the MCP server +
   CLI binary.
2. **`anchored` plugin** on the Claude Code marketplace — pulled
   directly from this GitHub repo's `main` branch on every install.

A release means: bump version, tag, push. The rest is automated.

## One-time setup

Before the first release, do these once:

1. **Create npm account** (if not already): https://www.npmjs.com/signup
   — username must be `chaafoo` for the `@chaafoo` scope to be yours.
2. **Get an npm access token** with publish permission:
   - https://www.npmjs.com/settings/chaafoo/tokens
   - Type: **Automation** (CI-safe, bypasses 2FA)
   - Scope: read + publish on `@chaafoo/*`
3. **Add the token as a GitHub secret**:
   - Repo → Settings → Secrets and variables → Actions → New
     repository secret
   - Name: `NPM_TOKEN`
   - Value: the token from step 2
4. **Submit the plugin to the Claude marketplace** (one-time form):
   https://clau.de/plugin-directory-submission
   - After approval, updates auto-flow from `main` — no further
     submission needed for new versions.

## Each release

From a clean `main` branch with everything committed:

```bash
# 1. Update CHANGELOG.md — add the [<new version>] section at the top
#    with Added / Changed / Fixed / Removed buckets. Commit it.

# 2. Bump version (use minor/patch/major as appropriate)
cd mcp
npm version minor   # or patch, or major

# This automatically:
#   - bumps mcp/package.json to the new version
#   - runs the `version` script which syncs plugin.json + git adds it
#   - creates a single git commit with both files
#   - creates a git tag like v0.4.0

# 3. Push commit + tag
git push origin main --follow-tags
```

That's it. The `publish` GitHub Action triggers on the tag, runs the
full test suite, builds the dist bundle, publishes to npm, and
creates a GitHub Release with the matching CHANGELOG section
extracted as the release notes.

## Version policy

We follow [semver](https://semver.org/):

- **MAJOR** (1.x → 2.x): breaking changes to the plugin user surface
  (slash commands, anchored.yml shape, task-file schema). Rare —
  users have configs that depend on these.
- **MINOR** (0.3 → 0.4): new functionality that's backward-compatible
  (new MCP tools, new anchored.yml slots, new agents/skills).
- **PATCH** (0.3.0 → 0.3.1): bug fixes, prompt polish, voice tweaks,
  doc improvements.

Pre-1.0 we may break things in MINORs — but try not to. Once 1.0
hits, semver discipline is strict.

## If publishing fails

The `publish` workflow has three checkpoints — if any fail, the
publish doesn't happen (no half-state):

1. **Version consistency check** — tag must match package.json + plugin.json
2. **Quality gates** — lint, typecheck, full test suite, build
3. **npm publish** — only fires after the above pass

If the action fails:

```bash
# Delete the tag locally + remotely
git tag -d v0.4.0
git push origin :refs/tags/v0.4.0

# Fix the issue, commit, then re-tag
cd mcp
npm version patch  # re-bumps to v0.4.1 (or whatever)
git push origin main --follow-tags
```

Don't try to delete and re-push the *same* tag — npm and GitHub
Release both reject re-publishes of the same version.

## What gets published, what doesn't

| Artifact | Where | When |
|---|---|---|
| `@chaafoo/anchored-mcp` | npm registry | `git push --follow-tags` triggers publish workflow |
| `anchored` plugin | Claude marketplace | Pulls from `main` branch HEAD on each install — no separate publish step |
| GitHub Release | github.com/chafoo/anchored/releases | Auto-created by publish workflow with CHANGELOG section |
| `dist/` bundle | inside the npm package | Built by `npm run build` during the publish flow; tracked via `files:` in package.json |

The `dist/` folder is in `.gitignore` — only the npm tarball
contains it. Source lives in `mcp/src/`; consumers always run the
built version via `npx -y @chaafoo/anchored-mcp`.
