# Testing anchored v3 by hand

The `anchored` CLI is the whole product surface (CLI-only transport — no MCP). This is a
hands-on guide to poke every function and *watch the enforcement bite*. No AI needed.

## 1. Get `anchored` on your PATH

```bash
cd core && npm install && npm run build && npm link    # exposes `anchored` globally
anchored version          # → anchored 0.1.0
```

`npm link` is already done in this checkout. After any code change: `npm --prefix core run
build` (the build re-sets the executable bit via the postbuild hook). To remove later:
`npm --prefix core unlink`.

## 2. Smoke everything at once

```bash
bash scripts/smoke.sh     # drives all ~50 verbs across every tier through the real binary
```

Expect `82 passed, 0 failed · ALL GREEN ✓`. It runs in a throwaway temp dir and cleans up.

## 3. Drive it by hand (a scratch project)

```bash
mkdir -p /tmp/anc && cd /tmp/anc      # anchored writes to ./.claude/tasks/<slug>.yml
```

Every call prints one JSON envelope `{ ok, command, result | error }`. Pipe through `jq` for
readability if you like.

### A · A phase to done — and the evidence floor refusing a fake
```bash
anchored task create demo "Demo task"
anchored task add-phase demo build "Build it"
anchored phase status demo/build in-progress
anchored phase ac-add demo/build "the handler is validated"          # → a1, pending
anchored phase status demo/build done                                 # ✗ refuses: AC not terminal
anchored phase ac-evidence demo/build a1 "src/h.ts saveTasks() — bun test green"   # flips a1 done
anchored phase status demo/build done                                 # ✓ now it goes through
```

### B · Deferral — done OR deferred(reason), never silently dropped
```bash
anchored phase ac-add demo/build "nice-to-have polish"               # a2
anchored phase ac-defer demo/build a2                                 # ✗ AcNoReason — a deferral must be documented
anchored phase ac-defer demo/build a2 "punted to the next milestone"  # ✓ deferred, terminal
```

### C · Open questions block the advance to build (with a listing)
```bash
anchored task create q "Q"
anchored task add-phase q p1 P1
anchored task status q build          # ✗ plan→build refused — drafted isn't optional (order can't jump)
anchored task question-add q "which storage backend?" high
anchored task status q drafted
anchored task status q build          # ✗ QuestionsOpen: "1 open question(s) — q1 (high)"
anchored task question-resolve q q1 "localStorage" user
anchored task status q build          # ✓ drafted→build (refine is optional — the skip edge)
```

### D · Epic: stub outcome-ACs, a deferred DoD item, roll-up
```bash
anchored epic create ep "Epic"
anchored epic child-add ep login "login flow"
anchored epic child-ac-add ep login "auth path proven"               # a1 on the login stub
anchored epic child-status ep login done                              # ✗ stub AC not terminal
anchored epic child-ac-evidence ep login a1 "login/auth a1 — delivered"
anchored epic child-status ep login done                              # ✓
anchored epic add-acceptance ep "ships end to end"                    # e1 (definition-of-done)
anchored epic add-acceptance ep "analytics dashboard"                 # e2 → will defer
anchored epic status ep drafted && anchored epic status ep build && anchored epic status ep wrap
anchored epic status ep done                                          # ✗ DoD items not terminal
anchored epic set-acceptance-status ep e1 done "login — delivered"
anchored epic set-acceptance-status ep e2 deferred "next quarter"
anchored epic status ep done                                          # ✓ one delivered, one deferred
anchored epic roll-up ep                                              # reads the child task files
```

### E · Inspect what landed on disk
```bash
cat .claude/tasks/demo.yml
cat .claude/tasks/ep.yml
```

## 4. The invariants you're proving

| What you can't fake | Where it's enforced |
|---|---|
| a `done` AC without evidence | schema `.refine` (every write) |
| a `deferred` AC without a reason | schema `.refine` + a clean `AcNoReason` message |
| advancing to `build` with an open question | verb guard (`QuestionsOpen`, lists them) |
| `done` while a child / phase / DoD item isn't terminal | completion floors |
| `done` with an open concern | completion floor |
| jumping the stage order (`plan → build`) | the transition map (refine/wrap are the only skips) |

## 5. Testing the plugin skills (optional, needs AI)

The skills (`/a:plan <tier> <input>` · `/a:refine <slug>` · `/a:build <slug>` ·
`/a:wrap <slug>`) orchestrate the same CLI + spawn worker agents. They run inside Claude
Code against a real project — that's the AI-in-the-loop path, separate from this CLI smoke.
