/**
 * rules-check agent — integration tests.
 *
 * These tests exercise the MCP factory ops the rules-check agent
 * calls — they DO NOT spawn the agent's LLM reasoning. The agent
 * itself reads `.claude/rules/*.md`, judges applicability, and
 * either calls `phase.rules.add` (additive auto-fix) or
 * `context.plan.append` (`→ ?` marker for human resolution).
 *
 * We simulate that behavior here: the test sets up a tmp project
 * root with seeded rule files + a drafted task-file, then performs
 * the factory ops the agent WOULD perform in each scenario, then
 * asserts the post-state matches the contract documented in
 * `plugin/agents/rules-check.md`.
 *
 * Same shape as the plan-check sibling test suite added in P8.
 *
 * Five scenarios:
 *   1. aligned — every phase already has the right rules; agent
 *      changes nothing.
 *   2. missing-rule auto-fix — an applicable rule isn't yet on a
 *      phase; agent appends it via rules.add (no question marker).
 *   3. orphaned-rule surfaces question — a phase references a rule
 *      file that no longer exists; agent never silently removes,
 *      surfaces as `→ ?` instead.
 *   4. new-rule-since-plan — a rule file added after the plan was
 *      drafted now applies to an existing phase; agent attaches it.
 *   5. cross-phase-conflict — two phases reference rules with
 *      conflicting imperatives over the same path; agent surfaces
 *      as `→ ?` marker (no silent rule changes).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { createOps } from '../src/core/factory.js';
import { parseAnchoredYml } from '../src/schema/anchored-yml.js';

// ─────────────────────────────────────────────────────────────────────
// fixture helper — tmp project root with .claude/rules + task-file
// ─────────────────────────────────────────────────────────────────────

const ANCHORED_YML = `task:
  phase:
    fields: []
plan: {}
refine: {}
build: {}
wrap: {}
`;

interface RulesFixture {
  root: string;
  cleanup: () => Promise<void>;
}

/**
 * Seed a tmp project root with:
 *   - anchored.yml (minimal — no extension fields)
 *   - .claude/rules/<name>.md for each rule passed in `rules`
 *   - .claude/tasks/<slug>.yml with the provided body
 */
async function createRulesFixture(opts: {
  slug: string;
  taskYml: string;
  rules: Record<string, string>;
}): Promise<RulesFixture> {
  const root = await mkdtemp(join(tmpdir(), 'anchored-rules-check-'));
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true });
  await mkdir(join(root, '.claude', 'rules'), { recursive: true });
  await writeFile(join(root, 'anchored.yml'), ANCHORED_YML, 'utf-8');
  await writeFile(join(root, '.claude', 'tasks', `${opts.slug}.yml`), opts.taskYml, 'utf-8');
  for (const [name, body] of Object.entries(opts.rules)) {
    await writeFile(join(root, '.claude', 'rules', name), body, 'utf-8');
  }
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function makeOps(root: string) {
  const config = parseAnchoredYml(yamlParse(ANCHORED_YML));
  return createOps(config, root);
}

// ─────────────────────────────────────────────────────────────────────
// rule bodies (kept short — content matters only for documentation)
// ─────────────────────────────────────────────────────────────────────

const FACTORY_RULE = `# Factory pattern

Applies to: src/core/

All public ops MUST be created via factory functions returning closures.
No \`class\` keyword outside src/framework/.
`;

const ATOMIC_RULE = `# Atomic writes

Applies to: src/core/io.ts, src/core/

Filesystem mutations MUST use atomic temp-file + rename. Direct
write-through is forbidden for any file under src/core/.
`;

const FAST_CACHE_RULE = `# Fast cache writes

Applies to: src/core/io.ts

Cache files under src/core/cache/ MAY be written directly without
atomic temp+rename — speed matters more than crash-safety for caches.
`;

const ERROR_HANDLING_RULE = `# Error handling

Applies to: src/cli/

All CLI commands MUST surface errors with both a message and a
suggestions array. Bare throws are forbidden in CLI handlers.
`;

// ─────────────────────────────────────────────────────────────────────
// shared task-file template helper
// ─────────────────────────────────────────────────────────────────────

function taskYml(opts: {
  slug?: string;
  status?: string;
  phases: {
    name: string;
    slug: string;
    rules?: { path: string; why: string }[];
    affected_paths?: string[];
  }[];
}): string {
  const slug = opts.slug ?? 'oauth-flow';
  const status = opts.status ?? 'drafted';
  const phaseBlocks = opts.phases
    .map((p) => {
      const rulesBlock =
        p.rules && p.rules.length > 0
          ? `    rules:\n${p.rules
              .map(
                (r) =>
                  `      - path: ${JSON.stringify(r.path)}\n        why: ${JSON.stringify(r.why)}`,
              )
              .join('\n')}\n`
          : '';
      const affectedBlock =
        p.affected_paths && p.affected_paths.length > 0
          ? `    affected_paths:\n${p.affected_paths.map((path) => `      - ${path}`).join('\n')}\n`
          : '';
      return `  - name: ${p.name}
    slug: ${p.slug}
    status: pending
${rulesBlock}${affectedBlock}    acceptance_criteria:
      - text: do the thing
        status: pending
`;
    })
    .join('');
  return `schema_version: 2
slug: ${slug}
status: ${status}
created: 2026-05-26
title: OAuth Flow
context:
  intro: A drafted task for rules-check tests.
phases:
${phaseBlocks}`;
}

// ─────────────────────────────────────────────────────────────────────
// per-test cleanup
// ─────────────────────────────────────────────────────────────────────

let fixture: RulesFixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

// ─────────────────────────────────────────────────────────────────────
// 1. aligned — every phase has correct rules already
// ─────────────────────────────────────────────────────────────────────

describe('rules-check — aligned (zero fixes, zero questions)', () => {
  it('makes no changes when each phase already references its applicable rules', async () => {
    fixture = await createRulesFixture({
      slug: 'oauth-flow',
      rules: {
        'factory-pattern.md': FACTORY_RULE,
        'atomic-writes.md': ATOMIC_RULE,
      },
      taskYml: taskYml({
        phases: [
          {
            name: 'Phase One',
            slug: 'phase-one',
            affected_paths: ['src/core/factory.ts'],
            rules: [
              {
                path: '.claude/rules/factory-pattern.md',
                why: 'phase one adds new ops in src/core/ and must use factory functions',
              },
            ],
          },
          {
            name: 'Phase Two',
            slug: 'phase-two',
            affected_paths: ['src/core/io.ts'],
            rules: [
              {
                path: '.claude/rules/atomic-writes.md',
                why: 'phase two adds io mutations in src/core/io.ts which must be atomic',
              },
            ],
          },
        ],
      }),
    });

    const ops = makeOps(fixture.root);
    const before = await ops.task.read('oauth-flow');

    // rules-check's "aligned" path performs no MCP writes. Re-read
    // and assert nothing changed.
    const after = await ops.task.read('oauth-flow');
    expect(after.phases[0]!.rules).toEqual(before.phases[0]!.rules);
    expect(after.phases[1]!.rules).toEqual(before.phases[1]!.rules);
    expect(after.context.plan ?? '').toBe(before.context.plan ?? '');
    expect(after.context.plan ?? '').not.toContain('→ ?');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. missing-rule auto-fix — agent calls rules.add
// ─────────────────────────────────────────────────────────────────────

describe('rules-check — missing-rule auto-fix', () => {
  it('appends an applicable rule to a phase that was missing it (no question marker)', async () => {
    fixture = await createRulesFixture({
      slug: 'oauth-flow',
      rules: {
        'atomic-writes.md': ATOMIC_RULE,
      },
      taskYml: taskYml({
        phases: [
          {
            name: 'Phase Two',
            slug: 'phase-two',
            affected_paths: ['src/core/io.ts'],
            // No rules: [] — agent should detect atomic-writes.md
            // applies and append it.
          },
        ],
      }),
    });

    const ops = makeOps(fixture.root);

    // Simulate the agent's auto-fix:
    const newRule = {
      path: '.claude/rules/atomic-writes.md',
      why: 'phase two adds io mutations in src/core/io.ts; rule mandates atomic temp+rename for filesystem writes',
    };
    await ops.task.phase.rules.add('oauth-flow', 'phase-two', newRule);

    // Assert phase 2 rules array now has atomic-writes.md.
    const after = await ops.task.read('oauth-flow');
    const phaseTwo = after.phases.find((p) => p.slug === 'phase-two');
    expect(phaseTwo?.rules).toEqual([newRule]);

    // Assert no `→ ?` marker was added — additive fixes are silent.
    expect(after.context.plan ?? '').not.toContain('→ ?');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. orphaned-rule surfaces question — never silently remove
// ─────────────────────────────────────────────────────────────────────

describe('rules-check — orphaned-rule surfaces question', () => {
  it('appends a `→ ?` marker instead of silently removing a rule that no longer exists on disk', async () => {
    fixture = await createRulesFixture({
      slug: 'oauth-flow',
      // Note: typed-evidence.md is referenced below but NOT seeded
      // here — it's the orphaned reference.
      rules: {
        'factory-pattern.md': FACTORY_RULE,
      },
      taskYml: taskYml({
        phases: [
          {
            name: 'Phase One',
            slug: 'phase-one',
            affected_paths: ['src/core/factory.ts'],
            rules: [
              {
                path: '.claude/rules/typed-evidence.md',
                why: 'phase one writes evidence strings; this rule constrains their shape',
              },
            ],
          },
        ],
      }),
    });

    const ops = makeOps(fixture.root);
    const before = await ops.task.read('oauth-flow');
    const beforeRules = before.phases[0]!.rules;

    // Simulate the agent's question-surfacing behavior:
    const marker =
      'Q: Rule .claude/rules/typed-evidence.md is referenced in phase phase-one but no longer exists on disk. Remove the reference, or was the rule moved/renamed? → ?';
    await ops.task.context.plan.append('oauth-flow', marker);

    const after = await ops.task.read('oauth-flow');

    // Assert context.plan has the new marker.
    expect(after.context.plan ?? '').toContain('→ ?');
    expect(after.context.plan ?? '').toContain('typed-evidence.md');

    // Assert phase 1's rules array was NOT silently changed.
    expect(after.phases[0]!.rules).toEqual(beforeRules);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. new-rule-since-plan — rule added later, agent auto-applies
// ─────────────────────────────────────────────────────────────────────

describe('rules-check — new-rule-since-plan', () => {
  it('auto-attaches a newly-created rule file that applies to an existing phase', async () => {
    fixture = await createRulesFixture({
      slug: 'oauth-flow',
      // error-handling.md is "new" — added to the rules folder after
      // the plan was drafted. The drafted task didn't know about it.
      rules: {
        'error-handling.md': ERROR_HANDLING_RULE,
      },
      taskYml: taskYml({
        phases: [
          {
            name: 'Phase One',
            slug: 'phase-one',
            affected_paths: ['src/core/factory.ts'],
          },
          {
            name: 'Phase Two',
            slug: 'phase-two',
            affected_paths: ['src/core/io.ts'],
          },
          {
            name: 'Phase Three',
            slug: 'phase-three',
            affected_paths: ['src/cli/commands/task.ts'],
            // No rules listed — agent should detect error-handling.md
            // applies to src/cli/ and attach it.
          },
        ],
      }),
    });

    const ops = makeOps(fixture.root);

    const newRule = {
      path: '.claude/rules/error-handling.md',
      why: 'phase three modifies CLI command src/cli/commands/task.ts; rule mandates structured error output with suggestions',
    };
    await ops.task.phase.rules.add('oauth-flow', 'phase-three', newRule);

    const after = await ops.task.read('oauth-flow');
    const phaseThree = after.phases.find((p) => p.slug === 'phase-three');
    expect(phaseThree?.rules).toEqual([newRule]);

    // No question marker — additive fix is silent.
    expect(after.context.plan ?? '').not.toContain('→ ?');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. cross-phase-conflict — surface as `→ ?` marker, no silent changes
// ─────────────────────────────────────────────────────────────────────

describe('rules-check — cross-phase rule conflict', () => {
  it('surfaces conflicting rules over overlapping paths as a `→ ?` marker (no silent rule changes)', async () => {
    fixture = await createRulesFixture({
      slug: 'oauth-flow',
      // Both rules touch src/core/io.ts but contradict each other.
      rules: {
        'atomic-writes.md': ATOMIC_RULE,
        'fast-cache.md': FAST_CACHE_RULE,
      },
      taskYml: taskYml({
        phases: [
          {
            name: 'Phase One',
            slug: 'phase-one',
            affected_paths: ['src/core/io.ts'],
            rules: [
              {
                path: '.claude/rules/atomic-writes.md',
                why: 'phase one adds new write paths under src/core/; atomic temp+rename required',
              },
            ],
          },
          {
            name: 'Phase Three',
            slug: 'phase-three',
            affected_paths: ['src/core/io.ts'],
            rules: [
              {
                path: '.claude/rules/fast-cache.md',
                why: 'phase three adds cache writes under src/core/cache/; direct writes acceptable',
              },
            ],
          },
        ],
      }),
    });

    const ops = makeOps(fixture.root);
    const before = await ops.task.read('oauth-flow');
    const beforeRulesOne = before.phases[0]!.rules;
    const beforeRulesThree = before.phases[1]!.rules;

    // Simulate the agent's conflict-surfacing behavior:
    const marker =
      'Q: Phases phase-one and phase-three both touch src/core/io.ts but reference conflicting rules — atomic-writes.md says "filesystem mutations MUST use atomic temp+rename", fast-cache.md says "cache files MAY be written directly". Resolve which intent applies. → ?';
    await ops.task.context.plan.append('oauth-flow', marker);

    const after = await ops.task.read('oauth-flow');

    // Assert the conflict marker landed in context.plan.
    expect(after.context.plan ?? '').toContain('→ ?');
    expect(after.context.plan ?? '').toContain('atomic-writes.md');
    expect(after.context.plan ?? '').toContain('fast-cache.md');

    // Assert NEITHER phase had rules silently changed — conflicts
    // never auto-fix; the human picks the winner via Q&A.
    expect(after.phases[0]!.rules).toEqual(beforeRulesOne);
    expect(after.phases[1]!.rules).toEqual(beforeRulesThree);
  });
});
