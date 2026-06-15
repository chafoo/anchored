# anchored v3 — pending backlog (dogfood findings + open add-on)

> The single file of everything designed-but-not-yet-built for v3. Two parts:
> **Part I** — the fix backlog from the 2026-06-15 dogfood runs (todo-app epic in
> `anchored-test`): API speed, ceremony, fan-out, CLI gaps. **Part II** — the one
> open behavioural add-on (the build-escalation policy). The headline problem from
> the dogfood was **ceremony**: a trivial ~80-line app took 35 min – 1h43 and
> dozens of manual CLI calls + agent spawns. Goals: fix the fan-out, cut the
> ceremony hard — **strictly on-system** (only the evidence invariant is enforced
> in code; see CLAUDE.md principle 3).

---

# Part I — Dogfood findings + fixes

## A — Fan-out redesign (fixes the worst bug)

The phase-level AC fan-out is wrong on two counts: the worktree workers never
merged back (the main tree stayed untouched, manual consolidation needed), and
the ACs collided anyway because they all touch the same file region. The fix is
to move fan-out *up* to the build loop, where the unit owns its own merge-back.

- **A1** — Drop phase-level `execute`: remove the `execute` field on `phase`,
  the `set-execute` verb, and `phaseExecuteValues`. A phase is a **sequential
  leaf** — its ACs are one coherent diff, validated together.
- **A2** — Move fan-out onto the **`each` loop step** via the generic
  `execute: workflow` (Level B collapses into Level A — no new mechanism). Build
  skill: ready children (by `depends_on`) fan out, each on its own branch; the
  dependency chain sequences the rest.
- **A3** — Each fanned-out unit owns its **integration boundary**: a task merges
  itself back via its own wrap-merge (`task/<slug>` → main). No ad-hoc worktree
  join in the orchestrator. Principle: only fan out a unit that owns a
  branch+merge (task: yes; phase: per-phase commit; AC: no — that's why it broke).

## B — Ceremony reduction (the meta-goal — fewer spawns + fewer CLI round-trips)

For ~80 lines of app code the hot path was: 5 planning agents → per phase
{implement + task-validate + code-validate} → manual status dance → manual
outcome-AC re-evidencing → manual branch/merge shell. Cut each driver — **strictly
on-system**: only the evidence invariant is enforced in code; ceremony goes away
via **API ergonomics + leaner skill orchestration**, never new built-ins. **Git
stays the user's — it is NOT baked into steps** (see CLAUDE.md principle 3).

- **B1** — **Kill the build-time outcome-AC re-evidencing.** Today a delivered
  task requires manually `add-phase-evidence`-mapping each epic-stub outcome AC
  before `child-status done`. Make **"all phases done" deliver the child**; the
  **roll-up (wrap)** is where outcome ACs get verified. Removes a whole redundant
  evidence layer per task. *(biggest single ceremony win)*
- **B2** — **Collapse the status-flip dance via the API.** Too many round-trips
  (`status build`, `child status active/done`, `status wrap`, …). **Resolved by H:**
  the **`next:` hint** (F2) on every mutation's return is the chosen path — existing
  verbs become steppers, **no new `advance` verb**. Pure transport ergonomics over
  the same dumb-store transitions; nothing new to decide.
- **B3** — **Scale refine *intensity* to task complexity** (not a binary skip).
  Refine is never fully dropped (it caught real bugs in the dogfood); instead it
  runs at one of **3 levels — `low` · `medium` · `intense`**. The **main thread
  sets the level** from cheap signals it already has (phase count, open-question
  count, greenfield vs. touches-existing-code) — **no extra agent** — and passes it
  to plan-check / rules-check, which adapt their depth. An agent **may escalate**
  its own level if it smells real drift (`low` → deeper). `low` ≈ a quick sanity
  glance (near the old "skip", but never blind); `intense` ≈ today's full drift
  check. Pure skill/agent policy — on-system.
- **B4** — **Gates always run in parallel; never merged.** Decided: keep
  evidence-author (task-validate) vs rule-veto (code-validate) **split** (the
  separation keeps the evidence-author honest) and always spawn them **in parallel**
  (one message, two agents) — they're parallel already, so merging saves ~0
  wall-clock and only costs the clean separation. **Same in refine:** plan-check +
  rules-check always spawn in parallel.

> **Removed — NOT a task:** baking git (branch/commit/merge) into default-template
> steps. Git stays the user's; the engine never runs git. (Was a candidate B-item,
> dropped 2026-06-15.)

## C — CLI gaps / bugs

Small, concrete verb/behaviour gaps in the CLI surface that forced manual
workarounds in the dogfood (none are open *decisions* — they are clear fixes).

- **C1** — **`ac-set-text` verb** — edit an acceptance criterion's *text* via the
  CLI. In the dogfood a refine step **added** an AC whose wording contradicted the
  chosen architecture (it demanded "the same `<li>` node is preserved", which
  fought the full-re-render design). There was no way to fix the wording, so the
  orchestrator had to **worsen the code** to satisfy the bad AC. v1 **had**
  `task__set_ac_text` — v3 dropped it → this is a **regression to restore**.
- **C2** — **`epic archive` cascades to delivered child tasks.** Today
  `epic archive <epic>` moves the epic but leaves its finished child task-files
  (created as separate task-files) sitting in the open workspace; the orchestrator
  had to archive each by hand. Archiving the epic should move its delivered
  children too.
- **C3** — **Archiving a task-file must be possible.** The block-task-file-edits
  hook blocks *any* Bash mutation of a task-file path — including `mv` into
  `_archive/` — and its override only covers Write/Edit, not Bash. So the
  reset/archive flow can't be automated. Fix: either a hook exception for `mv` into
  `_archive/`, or (cleaner) an `anchored <tier> archive <slug>` verb that does the
  move through the validated path.
- **C4** — **`phase build` is `UnknownVerb`.** The phase build pipeline
  (implement → validate → commit) is implicit, not a callable verb, so the
  orchestrator kept probing for the right call. Give it a real verb (e.g.
  `phase advance`, see F6) or clear help/discoverability (ties to E1).
- **C5** — **Epic `context.*` parity.** Epics have no `context` field (tasks/phases
  do), so the plan/refine trail prose must go into the epic's *log* — but the
  skills assume `context.refine` / `context.plan` and drift. Fix: give epics the
  same `context.*` fields, or update the skills to stop assuming it on epics.

## D — Setup / infra

- **D1 — the `anchored` CLI must be available the instant the plugin is
  installed** (marketplace OR GitHub), with **zero manual setup** — this is the
  real distribution/install requirement, not just a dev PATH shim. On first use the
  CLI must resolve for the main session AND subagents; if it doesn't, the plugin
  **auto-provisions** it. Mechanism (pick after the CC-plugin research):
  - **(a) bundle** the compiled CLI under the plugin and call it via
    `${CLAUDE_PLUGIN_ROOT}/bin/anchored` — zero-network, version-locked to the
    plugin (skills/agents reference that path, or a hook puts it on PATH);
  - **(b)** `npm i -g` the published package (needs network + npm + global perms);
  - **(c)** a **SessionStart hook** that ensures it's on PATH / symlinked.
  Auto-trigger via the **setup skill** (the onboarding entry already runs on first
  `/a:*` use — extend it to verify+provision the CLI) and/or a dedicated **install
  command/hook**. The setup skill must *verify and repair* the CLI as part of
  onboarding, not assume a bare `anchored` is already on PATH. *(Elevated from
  "reliably on PATH" to the full install story — 2026-06-15.)*
  **✅ BUILT (2026-06-15):** chose mechanism (a). Claude Code auto-adds a plugin's
  `bin/` to PATH (main + subagents) on install, so the plugin ships a self-contained
  bundled CLI at `plugin/bin/anchored` (`bun build`, all deps inlined, 0 refs to
  `core/dist`) + `plugin/default-template/` + `plugin/package.json` sidecars (read
  relative to the binary). Zero-install, offline, version-locked. Regenerate via
  `npm --prefix core run bundle:plugin`. Setup skill verifies (not installs) the CLI.

## E — Docs

- **E1** — **API reference as a simple table.** Author `plugin/references/api.md`:
  one table of the whole CLI surface — `anchored <tier> <verb> [args]` (tier-first
  grammar), grouped by tier (phase · task · epic) + the meta-verbs
  (`validate`/`help`/`version`), with each verb's args + one-line purpose. Goal:
  the orchestrator (and any skill/agent) can look up the exact verb instead of
  probing (the dogfood hit `phase build` = `UnknownVerb`, no `ac-set-text`, etc.).
  **Link it** from `agent-contract.md` (agents read+write via the CLI) and
  `anchored-config.md`. Keep it generated/derived from the real verb list so it
  cannot drift. *(Ties into C1/C4 — the table makes missing/renamed verbs obvious.)*

## F — Agent-friendly CLI output (the v1-speed lesson, externally confirmed)

**Why v1 felt faster:** v1 ran over MCP → every op returned a structured object
the skill read directly. v3 (CLI-over-Bash) made the orchestrator pipe *every*
call through `python3 -c "import json,sys; …"` to fish one field out of a big JSON
blob — a per-call tax (python snippet authored each time + a node + a python
process spawn), dozens of times per run. That parsing tax — **not** verb
granularity or loop shape (those are identical to v1) — is the gap.

**The reframe (don't regress to MCP):** a 75-test benchmark found CLI-driven
agents **10–32× cheaper on tokens** and **~100% reliable vs MCP's ~72%**. CLI-only
is the *better* transport, not a compromise. We just missed the agent-output
conventions that HF/Speakeasy have standardised. No package to adopt — it's a
convention set.

**How it works (the mechanism):** *(AI-only — there is **no** human mode. anchored
is always driven by an agent, so the default output simply **is** the agent format
— no env-detection, no second renderer, no mode switch to build.)*
1. **Default output = one dense readable line** — no ANSI, nothing truncated, full
   values (`markup-state: done · next: render-add (a1,a2,a3) · status: build`).
   Nothing to parse, no `python3`.
2. **The line already carries the next step** (pre-parameterised) — no second
   "what's next?" call.
3. **Errors prescribe the fix + meaningful exit code.** Non-zero exit so the
   orchestrator sees failure without parsing; a readable line with the fix command
   (we already compute `suggestions` in the JSON — just render it as text).
4. **Idempotent / safe-to-repeat verbs** (`status build` when already build = ok)
   — kills the dogfood's "status already X" friction; the orchestrator declares
   intent, never handles "already".
5. **`--json` stays** for when the full object / jq is wanted; the readable line is
   the default.

**Concrete before/after (one phase transition):**
```
# before — 3 calls, 3 python snippets:
anchored phase status core-todo/markup-state done | python3 -c "...status..."
anchored task next-phase core-todo                | python3 -c "...slug..."
anchored phase get core-todo/render-add           | python3 -c "...acs..."
# after — 1 call, 0 python:
anchored phase advance core-todo
→ markup-state done · next: render-add (a1,a2,a3) · status: build
```

**Where it lives:** pure output-formatting + transition ergonomics in `cli/` — a
single agent-format renderer (no mode branch), a `next` computation (just the legal
transition, already known mechanism), exit-code mapping, idempotent transitions.
The dumb store + engine + invariant do **not** change. Strictly on-system: no new
enforcement, just easier-to-drive output. (Combo verbs from F + B2 quantified by
HF: composing the call-chain into high-level commands = **2–6× token savings** on
multi-step workflows.)

- **F1** — Default output = one dense readable line per command (no ANSI, no
  truncation, full values) instead of a JSON blob the orchestrator must parse.
  **AI-only — no human mode, no env-detection** (anchored is always agent-driven,
  so the agent format is simply the default).
- **F2** — `next:` hint in every mutation's output (pre-parameterised next phase /
  ready children / next stage) — the returns drive the loop (folds in old
  "Vorschlag 1").
- **F3** — Errors as a readable fix line + meaningful exit codes (render the
  existing `suggestions`; success/failure without parsing).
- **F4** — Idempotent / safe-to-repeat transitions (no error on a same-state set).
- **F5** — Keep `--json` for full structured output / jq piping (the readable line
  stays the default).
- **F6** — A few high-level combo verbs that compose the hot call-chains
  (`phase advance`, `<tier> deliver`, `epic begin-child`) — **mechanism only**,
  never policy (the CLI never spawns workers). *(was "Vorschlag 2"; overlaps B2.)*

> **Sources:** [hf CLI for agents](https://huggingface.co/blog/hf-cli-for-agents) ·
> [Speakeasy — agent-friendly CLI](https://www.speakeasy.com/blog/engineering-agent-friendly-cli) ·
> [Designing Efficient CLI Tools for AI Agents](https://www.linkedin.com/pulse/designing-efficient-cli-tools-ai-agents-ajay-prakash-vsb6e)

## G — Input ergonomics (the input side of F)

**The symmetry:** F kills the *output* parsing tax (CLI prints a ready line, the
agent doesn't re-parse JSON). G kills the *input* quoting tax (the dogfood passed
huge prose — `context.plan`, evidence — as giant quoted argv strings: escaping
hell, newlines, argument-length risk). The rule is **not** "everything as a stdin
object" — that just mirrors the tax onto the input side and makes the cheap common
call heavier. The rule is: **identifiers as positional words (the 90% case), big or
structured values over stdin.**

**Why a process boundary forces this:** between processes only bytes cross (argv or
stdin). A live object can never be handed over — it is always serialise → parse
(JSON) → Zod-validate, no shared memory. So the only question is *which channel*
and *how cheap to write*. Short identifiers → words (lightest tokens, greppable
grammar). Heavy/nested payloads → stdin (no shell-quoting fight, no length limit).

- **G1** — **Positional args for identifiers / flat values** (tier, verb, slug,
  status value, ac-id, `--json`). Keep them words — lightest tokens, clear
  grammar; do **not** force a JSON object for a simple verb (`phase advance
  core-todo`, not a `{tier,verb,slug}` blob).
- **G2** — **`-` convention for a single big value:** a positional `-` means "read
  this value from stdin". Big prose (`context.plan`, evidence text, refine trail)
  comes via stdin, not a giant quoted argv string:
  ```
  anchored task ac-evidence core-todo a2 - <<'TXT'
  addTask() (app.js:27) — verified via …
  TXT
  ```
- **G3** — **Bulk/batch verbs take one structured object over stdin** → many calls
  collapse to one (e.g. `task decompose <slug> -` seeds the whole phase tree in a
  single call instead of N `add-phase` calls). Cuts round-trips; pairs with the
  combo verbs (F6 / B2).
  ```
  anchored task decompose core-todo - <<'JSON'
  { "phases": [ {…a1,a2…}, {…a3,a4…}, {…a5…} ] }
  JSON
  ```
- **G4** — **Zod-validate the parsed stdin object** at the boundary (same schema
  law as every other write; the evidence invariant still holds). On a parse/schema
  miss → readable fix line + non-zero exit (F3).

> **Symmetry recap:** output = dense readable line (F) · input = words for
> identifiers + stdin-JSON for payloads/bulk (G). Both directions: cheap for the
> common case, structured channel for the heavy case. This is the whole API-speed
> story; everything else (A–E) is correctness + ceremony.

## H — API extension: naming + stdin (fits the system, doesn't break it)

**Principle:** extend with the **fewest new names possible**. New ergonomics come
from (a) the `next:` hint enriching *existing* verbs' returns (F2), and (b) reusing
a **small, stable verb vocabulary** across every resource — not inventing one-off
verbs. Grounded in clig.dev / gh / kubectl / docker: noun→verb order (our
`<tier> <verb>` already is this), a consistent reused vocabulary, kebab-case only
where genuinely multi-word, and stdin only for the *body* (`-`), never for
identifiers.

**Decided — the collection grammar is two-token** (`ac set`, `phase add`), as
api.md already specifies. The current code's hyphenated verbs (`ac-add`,
`set-execute`, `child-status`) fold into it, so `set` / `add` / `status` are *one*
reused verb each, not 30 hyphenated specials. This is the "names fit the system" fix.

**The reused vocabulary (same verbs everywhere):**
- **Node:** `get` · `set <field> <value>` · `status <to>` · `create` · `archive` · `reset`
- **Collection:** `add` · `list` · `get` · `set <field> <value>` · `remove` + domain ops
- **Domain ops:** ac → `done` `evidence` `fail` `defer` · question → `resolve` · child → `next` `ready`
- **Lifecycle:** `plan refine build wrap` (the fixed fractal set)

**Ad-hoc → system (drop the invented names):**

| earlier (ad-hoc) | fits the system |
|---|---|
| `ac set-text` / `ac text` | `phase ac set <id> text -` (reuse `set`) |
| `advance` | none — `phase status <slug> done` + `next:` hint (F2) |
| `deliver` | none — `epic child status <slug> done` (B1 floor) + `next:` |
| `begin-child` | none — `epic child status <slug> active` + `next:` (plan steps) |
| `add-many` (bulk) | `task phase add <slug> -` (stdin array) |
| `archive` | `<tier> archive <slug>` — keep (standard CRUD, already in api.md) |

→ Effectively **one** genuinely new name (`archive`, already planned). Everything
else = existing vocabulary + richer returns. **F6's "combo verbs" collapse into
this** — the `next:` hint does the bundling, so no new verb names are added.

**stdin rule (answers "is everything stdin now?" — no):**
- Default input = **positional words** (identifiers: tier, verb, slug, id) + flags.
- **`-` reads exactly one value** (the body/payload) from stdin — like
  `kubectl apply -f -`, `tar xvf -`, `gh pr create --body-file -`.
- Never "everything as a stdin object" — identifiers stay words; stdin is the
  *body* channel.
  ```
  phase ac set core-todo/markup a2 text -   <<'TXT'    # one body value
  task phase add core-todo -                 <<'JSON'   # bulk array
  ```

> **Sources:** [clig.dev](https://clig.dev/) ·
> [Azure CLI command guidelines (standard CRUD verbs)](https://github.com/Azure/azure-cli/blob/dev/doc/command_guidelines.md) ·
> [The Poetics of CLI Command Names](https://smallstep.com/blog/the-poetics-of-cli-command-names/) · gh / kubectl / docker conventions.

## I — Config: a parallel-step marker (`with:`)

Today a stage's `steps` run **sequentially** in declaration order; `before:` /
`after:` position a step relative to a named anchor. There is **no** way to say
"these two sibling steps run in parallel" — the built-in phase gates (task-validate
+ code-validate) run parallel only because the skill **hardcodes** it.

`execute: workflow` is a *different* axis — it makes **one** step fan out its **own**
work; it does **not** run two sibling steps together.

**Add a third positioner — `with: <step-name>`** — alongside `before:` / `after:`,
same "relative to a named anchor" idiom. It means "run in this step's parallel
batch"; the batch joins before the next sequential step.

```yaml
- { name: task-validate }
- { name: code-validate, with: task-validate }   # both gates, one parallel batch
# user example — 3 checks at once:
- { name: lint }
- { name: typecheck, with: lint }
- { name: test,      with: lint }                 # lint + typecheck + test together
```

**Bonus:** this lets the **default template express the built-in gate parallelism
declaratively** (`code-validate: { with: task-validate }`) instead of skill-
hardcoded — and lets users parallelize their own custom steps the same way.
*(Alternative considered: `parallel: <group>` for explicit N-way groups — `with:`
chains to the same effect and matches the before/after idiom.)*

---

## Build order (for the apply workflow)

The findings above, sequenced for implementation. **All decisions are settled —
nothing left to decide; the whole backlog is build-ready.**

1. **A — fan-out redesign** (A1–A3): drop phase `execute`; fan-out on the `each`
   loop; unit owns its merge-back. *Fixes the worst bug.*
2. **F — agent output** (F1–F6) + **G — input** (G1–G4) + **H — naming/grammar**
   (two-token collections, reused vocabulary, `-`/stdin): the API-speed core (kills
   the python3 + quoting taxes). Highest ergonomics leverage, low risk. **B2 is
   folded in here** (the `next:` hint, no `advance` verb).
3. **B1** — "all phases done" delivers the child; roll-up verifies outcome ACs.
   *Biggest single ceremony cut.*
4. **C1–C5** — CLI gaps, all in the H vocabulary (`ac set <id> text -` restores the
   v1 regression; `archive` cascades to children; hook `mv`; `phase build` becomes
   `status done` + `next:`; epic `context.*`).
5. **E1** — `plugin/references/api.md` table (after the verb surface is final, so
   it can't drift).
6. **D1** — `anchored` reliably on PATH.
7. **I** — the `with:` parallel-step marker (config + skill); have the default
   template express the gate parallelism with it.
8. **B3** (refine intensity dial: low/medium/intense, main-thread-set) + **B4**
   (gates always parallel, never merged) — skill-side. *(B2 resolved by H.)*

> **Off-limits (do NOT build):** baking git into steps (git stays the user's);
> any new programmatic enforcement beyond the evidence invariant. See CLAUDE.md
> principle 3 — we secure the proof, never the work.

---

# Part II — Open add-on: the build-escalation policy (UX design)

> A behavioural add-on on the UX axis: **help the user work faster without losing
> oversight.** Decided 2026-06-15. Status: **DESIGN, not yet built.**

## The driving principle
anchored exists to let the user delegate the *how* and keep control of the *what* —
without losing the thread. Control is **not** "approve everything"; it is:
1. **be in the loop on the few things that matter** — high-stakes, irreversible,
   off-intent — and
2. **be able to reconstruct the rest in seconds** (a readable trail, not the code).

We already serve this with: a recommendation + implications on every question, the
priority-threshold / `conditions` walk, the build `stop`-conditions, and the audit
trail. This add-on sharpens the **input side** — *when* the AI pulls the user in
during the long autonomous build — into one clean, user-defined policy.

## The decision — a build-escalation policy
**The user freely defines, in their own words, when anchored should pull them in
during the build.** This is the `conditions` mechanism (the topic filter) elevated
to a standing policy for the whole build run.

- **When it is asked — once, in the refine walk.** Fires **once**, in the refine
  walk (the user is already in dialogue with the node's questions → one interaction
  point). Fallback: if refine is skipped (`drafted → build`), ask it in the
  pre-build walk at the start of `/a:build`. At the **tier being refined**: an
  **epic** asks once and it governs the **entire epic build**, including every
  child — **not** re-asked when the build just-in-time refines each child. A
  **standalone task** asks it there. The answer is the standing policy for the run
  (held in working memory; revisable mid-flight).
- **How it is asked — typed prose, NOT a menu.** Captured as **free-form prose the
  user types**, not a pick-list. One question — *"When do you want me to pull you
  in during the build?"* — with a **suggested default in the prompt** (lazy path =
  accept the suggestion), e.g. *"Default: just the important calls. Or: all of them
  · none, you decide · or topics like 'anything touching persistence or auth'."*
  The old priority presets (`high`/`medium`/`low`/`ai`) survive only as **example
  phrasings**, not selectable options. The AI then judges each build-time
  escalation moment against the user's words (the `conditions` mechanism,
  generalised).

> **SELECTION vs PROSE split:** the node's actual **plan questions** (concrete
> ambiguities) stay **selection-based** (`AskUserQuestion` + recommendation — real
> forks deserve clickable choices). The **escalation policy** ("when else should I
> reach you") is inherently open → **typed prose**. Two kinds of input, two UIs.

## The safety reflex — skill-prose, NOT a coded heuristic
A free-form policy has one gap: the **unknown-unknowns** — risks the user didn't
think to name. Cover it with the simplest thing: a **one-line instruction in the
refine + build skills** — *"surface anything irreversible / high-blast-radius
(destroying data, rewriting history, breaking a contract/schema, …) regardless of
the user's stated conditions."* It rides the AI's normal review; **no coded
reversibility engine, no heuristic to maintain.** Do **not** over-engineer this.

Honest framing: this is **best-effort help, not a hard guarantee.** anchored's
*hard* guarantees live in the substrate (evidence, acceptance criteria); "when to
interrupt" is, by design, soft helpful behaviour.

## How it relates — and what it REVISES
- **`conditions`** (the topic filter already in the refine walk) is the vehicle,
  generalised into the build run's standing escalation policy.
- **REVISES the selectable threshold walk** (commits `900de48` / `98fbe83`): the
  multi-option `high/medium/low/ai` + timing picker for the *escalation policy*
  becomes the single **typed-prose** question above (presets survive only as
  example phrasings). The node's own plan questions stay selection-based.
- **`stop`-conditions** already carry the build's halt rules — the safety-reflex
  instruction lives alongside them.
- **Resolves the earlier "reconciliation":** the refine walk now does two distinct
  things — resolve the node's *known* questions (selection), and capture the
  *escalation policy* for unknowns that arise during build (prose). No overlap left.

## Build impact (skill-side, lean)
- **refine SKILL:** the walk gains the **typed-prose** escalation question, asked
  **once** at the refined tier (epic governs children; standalone task asks there);
  hold the answer in working memory for the run. Replaces the selectable threshold
  picker (the node's *known* questions stay selection-based). Fallback: ask it in
  the pre-build walk if refine was skipped.
- **build SKILL:** at every escalation moment (a build-time decision, an action
  about to run), judge it against (a) the user's prose policy and (b) the
  **safety-reflex** instruction — escalate on a match, else proceed-and-document
  with reasoning (`source: ai`).
- **the safety reflex:** a one-line instruction in the refine + build skills, **no
  code** — it sits alongside the existing `stop`-conditions.
