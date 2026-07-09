← [docs](_docs.md)

# Release

A release of anchored is **three artifacts published together**:

| Artifact | Where | What carries the version |
| --- | --- | --- |
| the npm package | `@chaafoo/anchored` on npmjs.com | `core/package.json` |
| the Claude Code plugin | this repo, consumed via the marketplace | `plugin/.claude-plugin/plugin.json` |
| the bundled CLI | `plugin/bin/anchored` (committed, not built by the user) | `core/src/bin.ts` → `VERSION` |

The bundle is a **committed build artifact**. If you forget to rebuild it, the
plugin ships the previous release's CLI while `package.json` claims the new
version — and nothing fails.

## The version lives in four places

```
core/package.json          "version"
plugin/.claude-plugin/plugin.json   "version"
core/src/bin.ts            const VERSION      ← what `anchored version` prints
README.md                  the version badge
```

Only one pair is guarded: `core/src/bin.e2e.ts` reads `VERSION` out of `bin.ts`
and compares it to `package.json`, and fails on any mismatch. The constant stays
inlined on purpose — a bundled single-file binary should not go looking for a
`package.json` at runtime. The other two are still yours to remember.

## The version line

The tags `v0.1.0` … `v0.5.1` in this repo belong to **anchored v2** — a separate
history with a different root commit, not an ancestor of `main`. v3 continues the
line from where v2's `core/package.json` stood (`0.7.0`), it does not restart at
`0.1.0`. Before tagging, check what is actually taken:

```bash
git ls-remote --tags origin | sed 's|.*refs/tags/||' | grep -v '\^{}' | sort -V | tail
```

We are pre-1.0 deliberately. 1.0 waits for real user tests.

## The steps

Everything below runs from the repo root unless stated. `<X.Y.Z>` is the new version.

**1 — Land the work.** Merge to `main`, working tree clean.

**2 — Set the version in all four places.** Then prove the guard is honest:

```bash
cd core && bun test ./src/bin.e2e.ts     # green only when bin.ts == package.json
```

(The `./` prefix is required — bun does not discover `*.e2e.ts` by name.)

**3 — Rebuild the bundle.** Skipping this ships the old CLI:

```bash
npm --prefix core run bundle:plugin
./plugin/bin/anchored version            # must print the new version
```

**4 — Run every gate.**

```bash
npm --prefix core run lint
npm --prefix core run format             # prettier --check, not --write
npm --prefix core run typecheck
npm --prefix core test                   # spec-coverage → unit → e2e → int
npm --prefix core run build
claude plugin validate ./plugin
```

**5 — Inspect the npm artifact before it leaves.**

```bash
cd core && npm publish --dry-run
```

Check three things in the output: `README.md` and `LICENSE` are in the tarball,
no test files (`*.spec.*`, `*.e2e.*`, `*.fake.*`) leaked in, and npm prints **no**
`auto-corrected` warnings — a warning means the published manifest would differ
from the one in the repo.

**6 — Commit, push, tag.**

```bash
git commit -am "release: v<X.Y.Z> — <what changed>"
git push origin main
git tag -a v<X.Y.Z> -m "<the guarantee this release makes>"
git push origin v<X.Y.Z>
```

**7 — Publish to npm. This needs a real terminal.**

`npm login` and `npm publish` prompt interactively and ask for a 2FA one-time
password. Run them **in your own terminal**, not through an agent's background
shell — a backgrounded `npm login` has no TTY, prints the login URL, blocks on
`Username:` and dies with exit 1.

```bash
cd core
npm whoami                # confirm the account first
npm publish               # will ask for the OTP
```

The OTP is valid for ~30 seconds. `npm publish --otp=<code>` works too, if you
type it fast.

**8 — Verify like an end user.** Do not trust `npm view` here (see below):

```bash
cd $(mktemp -d) && npm init -y >/dev/null
npm install @chaafoo/anchored
./node_modules/.bin/anchored version      # must print the new version
```

Then drive one real lifecycle through the installed binary — `anchor`, `validate`,
a `--verdict` that must be refused with `UngroundedEvidence`, a `--grounded` that
must pass, `close`. An installed package that starts is not an installed package
that works.

## Traps we actually hit

**A fresh publish 404s for a while.** npm serves two documents: the aggregate
`GET /@chaafoo/anchored` (what `npm view` and `npm install` read) replicates
through a CDN and can 404 for a minute, while `GET /@chaafoo/anchored/<version>`
already answers `200`. A `PUT 200` in `~/.npm/_logs/*-debug-0.log` means the
publish succeeded. Confirm with the version URL, `npm access get status
@chaafoo/anchored`, and by matching the registry's `dist.shasum` against the
shasum npm printed when publishing. Do not re-publish in a panic.

**A scoped package defaults to `restricted`.** Without
`publishConfig: {"access": "public"}` in `core/package.json`, the first publish
lands private or fails, depending on the account. It is pinned in the manifest so
nobody has to remember `--access public`.

**`README.md` and `LICENSE` must live in `core/`.** npm collects them from the
package root, not the repo root — `files: ["dist"]` does not reach upward. Without
them the npm page renders blank and the `"license": "MIT"` claim ships without its
text. `core/README.md` is deliberately scoped to the CLI and core; the repo README
describes the plugin.

**`bin` must be `dist/bin.js`, not `./dist/bin.js`.** npm silently rewrites the
`./` form on publish, so the published manifest would no longer match the repo.
`npm pkg fix` normalises it.

**A tag name may already be taken by v2.** `git push origin v0.1.0` is rejected
because that tag belongs to the other history. Check the remote tags first (above).

## What cannot be undone

`npm unpublish` only works within **72 hours** of publishing, and only while no
other package depends on yours. After that a bad release can be hidden but not
removed:

```bash
npm deprecate @chaafoo/anchored@<X.Y.Z> "<why, and what to use instead>"
```

Publishing claims the package name permanently. Treat step 7 as the point of no
return — everything before it is reversible, nothing after it is.
