# /setup skill-eval runner (ad-hoc, skill-creator style)

Behavioral evals for the **`/setup`** skill. Separate from the lifecycle
`/loop` suite (`evals.json` / `runner.md`): there is no chained task-file
state here — each eval is independent and the gradeable artifact is the
**resulting `anchored.yml`** (plus the skill's chat behavior). Run it when
the `/setup` SKILL.md or its references change.

## Run

For each eval in `setup-evals.json`:

1. **Seed a throwaway config.** Create `/tmp/eval-setup/<id>/anchored.yml`.
   If `start_config` is `"empty"`, write just the schema directive + the
   `# anchored.yml — your project's anchored config.` comment. Otherwise
   write the literal `start_config` string.
2. **Spawn one with-skill subagent** (general-purpose) — all evals in the
   same turn, in parallel. Tell it to run the `/setup` skill faithfully:
   read `plugin/skills/setup/SKILL.md`, consult the docs it references **as
   the skill instructs** (critically: only read
   `plugin/references/power-user-setups.md` if the skill says to — i.e.
   only when the user asks for advice), edit the eval's `anchored.yml` per
   the verbatim `prompt`, ask nothing, and return: the final config, its
   decisions, and a self-audit.
3. **(Optional) baselines.** For a with-vs-without read, spawn a second
   subagent per eval with the same prompt but NO skill. The skill's value
   shows up as: knowing `name`+`instructions` is the base, `type` is
   use-only, the right surface (gate vs step), and funnel-resistance.

## Grade (objectively — don't trust the agents' self-audits)

Read each resulting `anchored.yml` yourself and check the eval's
`assertions`. Two layers:

- **Schema + structure (scriptable).** Parse each file and validate against
  the schema via the local build, then assert structure. Example harness:

  ```
  cd mcp && npx tsx -e "
    import { readFileSync } from 'node:fs'; import YAML from 'yaml';
    import { safeParseAnchoredYml } from './src/schema/anchored-yml.ts';
    const c = safeParseAnchoredYml(YAML.parse(readFileSync(PATH,'utf8')) ?? {});
    // c.ok === true, then assert c.value.build.steps / task_validate / wrap.steps …
  "
  ```

  Key structural checks per eval: every custom step has `name` +
  `instructions`; `type` is absent on `run` steps and present (`skill`/
  `agent`) on `use` steps; s2 lands in `build.task_validate.instructions`
  (no invented step); s4 leaves the file with **zero** config keys (advice,
  not install); s5 preserves the pre-existing `commit` step.

- **Behavior (from the transcript).** Did it open
  `power-user-setups.md` only in s4 (advice requested) and nowhere else
  (funnel resistance)? Did it implement only what was asked plus at most one
  one-line suggestion? Did it surface genuine forks (commit-gating, the
  `gh`/GitHub assumption, the `docu:docu-scan` identifier) rather than
  guessing silently?

## Record

Per eval: `pass` (all assertions) / `partial` (core worked, ≥1 non-fatal
miss) / `fail` (wrong surface, invalid config, or a funnel). The headline
risks to watch across runs: **s4** (funnel resistance) and **s2** (correct
surface mapping) — a regression there means the skill drifted from its
"capture requirements, don't sell setups" contract.

## Baseline run (2026-06-02): 5/5 pass

First run after the skill landed: every eval passed all structural
assertions (schema-valid, right surface, name+instructions everywhere,
`type` correct, existing config preserved) and both headline behavioral
risks held — s4 proposed a tiered Rust setup and wrote nothing; no eval
touched `power-user-setups.md` except s4.
