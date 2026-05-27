/**
 * plan-check integration tests — exercise the service-layer surface
 * the `plan-check` agent uses during /impl-refine. These tests do NOT
 * spawn a Claude sub-agent (we'd need a model to drive that); they
 * simulate plan-check's auto-fix + question-surfacing behavior by
 * calling the same factory ops plan-check would call.
 *
 * What we're verifying:
 *   - The ops surface plan-check declares in its frontmatter actually
 *     produces the expected on-disk shape after each auto-fix.
 *   - Questions surfaced as `→ ?` markers land in context.plan and
 *     don't accidentally trigger silent edits to phase.context or
 *     acceptance_criteria.
 *   - Info notes (parallelism candidates, FYI line-ref staleness)
 *     append cleanly WITHOUT a `→ ?` marker — the orchestrator's
 *     Q&A loop must skip them.
 *
 * Each scenario seeds a tmp project, runs the simulated plan-check
 * actions, then asserts on the resulting task-file.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { createOps } from '../src/core/factory.js';
import { createFixture, type Fixture } from './core/_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

/**
 * Helper — count `→ ?` markers in context.plan. Matches the
 * orchestrator's Q&A-loop detector.
 */
function countQuestions(plan: string | undefined): number {
  if (!plan) return 0;
  return (plan.match(/→ \?/g) ?? []).length;
}

/**
 * Helper — count plan-check info notes (lines starting with `Note:`).
 * Used to distinguish info notes from questions in the same field.
 */
function countNotes(plan: string | undefined): number {
  if (!plan) return 0;
  return (plan.match(/^Note:/gm) ?? []).length;
}

const ALIGNED_TASK = `schema_version: 2
slug: aligned-sample
status: drafted
created: 2026-05-26
title: Aligned plan
context:
  intro: A task whose plan already matches current code.
  plan: |
    Decisions:
    - use factory functions
phases:
  - name: First Phase
    slug: first
    status: pending
    context: "Touches src/new/foo.ts — already correct path."
    rules:
      - path: .claude/rules/_pattern/factory.md
        why: "src/new/foo.ts needs factory pattern"
    acceptance_criteria:
      - text: foo module exposes get() and set()
        status: pending
  - name: Second Phase
    slug: second
    status: pending
    context: "Wires foo into the API in src/api/route.ts."
    acceptance_criteria:
      - text: route imports foo
        status: pending
`;

const DRIFT_TASK = `schema_version: 2
slug: drift-sample
status: drafted
created: 2026-05-26
title: Drift in phase.context
context:
  intro: Plan references the OLD path.
  plan: |
    Decisions:
    - storage layer first
phases:
  - name: Storage Phase
    slug: storage
    status: pending
    context: "Implements TokenStore in src/old/foo.ts following factory pattern."
    acceptance_criteria:
      - text: TokenStore interface defined
        status: pending
`;

const MISSING_RULE_TASK = `schema_version: 2
slug: missing-rule-sample
status: drafted
created: 2026-05-26
title: Phase missing a rule
context:
  intro: Plan touches src/auth/ but doesn't list the factory rule.
  plan: |
    Decisions:
    - add auth handler
phases:
  - name: Auth Phase
    slug: auth
    status: pending
    context: "Adds handler in src/auth/handler.ts."
    rules:
      - path: .claude/rules/_concern/testing.md
        why: "tests required for new auth handler"
    acceptance_criteria:
      - text: handler accepts POST /login
        status: pending
`;

const SEMANTIC_GAP_TASK = `schema_version: 2
slug: semantic-gap-sample
status: drafted
created: 2026-05-26
title: Phase 2 ignores existing handler
context:
  intro: Phase 2 plans new work in src/auth/ without acknowledging existing handler.
  plan: |
    Decisions:
    - storage then routes
phases:
  - name: Storage Phase
    slug: storage
    status: pending
    context: "Implements TokenStore in src/auth/store.ts."
    acceptance_criteria:
      - text: store has TTL eviction
        status: pending
  - name: Routes Phase
    slug: routes
    status: pending
    context: "Adds OAuth routes in src/auth/ — does not mention existing handler.ts."
    acceptance_criteria:
      - text: POST /authorize wired up
        status: pending
`;

const DISJOINT_PHASES_TASK = `schema_version: 2
slug: disjoint-sample
status: drafted
created: 2026-05-26
title: Two phases on disjoint paths
context:
  intro: phases touch wholly separate trees, no data dependencies.
  plan: |
    Decisions:
    - auth + oauth in parallel-friendly shape
phases:
  - name: Auth Phase
    slug: auth-phase
    status: pending
    context: "Work in src/auth/. No reference to oauth."
    acceptance_criteria:
      - text: auth flow done
        status: pending
  - name: Oauth Phase
    slug: oauth-phase
    status: pending
    context: "Work in src/oauth/. No reference to auth phase outputs."
    acceptance_criteria:
      - text: oauth flow done
        status: pending
`;

// ─────────────────────────────────────────────────────────────────────
// Test 1 — aligned plan, clean verdict
// ─────────────────────────────────────────────────────────────────────

describe('plan-check integration: aligned plan (clean verdict)', () => {
  it('makes no auto-fixes and surfaces no questions when plan matches code', async () => {
    fixture = await createFixture({ slug: 'aligned-sample', taskYml: ALIGNED_TASK });
    const ops = createOps(fixture.config, fixture.root);

    // Snapshot before simulation — capture current state.
    const before = await ops.task.read('aligned-sample');
    const planBefore = before.context.plan ?? '';
    const firstRulesBefore = before.phases.find((p) => p.slug === 'first')!.rules;
    const firstContextBefore = before.phases.find((p) => p.slug === 'first')!.context;

    // Simulate plan-check's "nothing to do" path — the agent reads the
    // task-file, finds zero drift / zero gaps / zero missing rules, and
    // returns without calling any mutating op.

    // Assert: on-disk state is unchanged after the no-op pass.
    const after = await ops.task.read('aligned-sample');
    expect(after.context.plan).toBe(planBefore);
    expect(after.phases.find((p) => p.slug === 'first')!.rules).toEqual(
      firstRulesBefore,
    );
    expect(after.phases.find((p) => p.slug === 'first')!.context).toBe(
      firstContextBefore,
    );

    // Crucially: no new `→ ?` markers added.
    expect(countQuestions(after.context.plan)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 2 — auto-fixable drift (path patch in phase.context)
// ─────────────────────────────────────────────────────────────────────

describe('plan-check integration: auto-fixable drift (path patch)', () => {
  it('patches a moved path in phase.context via set_phase_context', async () => {
    fixture = await createFixture({ slug: 'drift-sample', taskYml: DRIFT_TASK });
    const ops = createOps(fixture.config, fixture.root);

    // Simulate plan-check detecting that src/old/foo.ts has moved to
    // src/new/foo.ts and applying the patch via set_phase_context.
    const patched =
      'Implements TokenStore in src/new/foo.ts following factory pattern.';
    await ops.task.phase.context.set('drift-sample', 'storage', patched);

    const after = await ops.task.read('drift-sample');
    const storagePhase = after.phases.find((p) => p.slug === 'storage')!;

    // Path is patched in-place.
    expect(storagePhase.context).toBe(patched);
    expect(storagePhase.context).toContain('src/new/foo.ts');
    expect(storagePhase.context).not.toContain('src/old/foo.ts');

    // Auto-fix is NOT a question — context.plan unchanged (no `→ ?`
    // marker added by this op).
    expect(countQuestions(after.context.plan)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 3 — missing rule detection (rules.add)
// ─────────────────────────────────────────────────────────────────────

describe('plan-check integration: missing-rule detection', () => {
  it('appends a missing rule via rules.add without adding a question', async () => {
    fixture = await createFixture({
      slug: 'missing-rule-sample',
      taskYml: MISSING_RULE_TASK,
    });
    const ops = createOps(fixture.config, fixture.root);

    // Simulate plan-check spotting that src/auth/ touches require the
    // factory rule, which is missing from phase.rules. It appends the
    // rule additively via rules.add (no removal, no edit to existing).
    const newRule = {
      path: '.claude/rules/_pattern/factory.md',
      why: 'src/auth/handler.ts requires factory pattern',
    };
    await ops.task.phase.rules.add('missing-rule-sample', 'auth', newRule);

    const after = await ops.task.read('missing-rule-sample');
    const authPhase = after.phases.find((p) => p.slug === 'auth')!;

    // Existing rule preserved, new rule appended at the end.
    expect(authPhase.rules).toEqual([
      { path: '.claude/rules/_concern/testing.md', why: 'tests required for new auth handler' },
      newRule,
    ]);

    // No question marker added — this is an additive auto-fix.
    expect(countQuestions(after.context.plan)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 4 — semantic gap surfaces as question (no silent edit)
// ─────────────────────────────────────────────────────────────────────

describe('plan-check integration: semantic-gap surfaces question', () => {
  it('appends a `→ ?` marker to context.plan; does not edit phase.context or ACs', async () => {
    fixture = await createFixture({
      slug: 'semantic-gap-sample',
      taskYml: SEMANTIC_GAP_TASK,
    });
    const ops = createOps(fixture.config, fixture.root);

    const before = await ops.task.read('semantic-gap-sample');
    const routesBefore = before.phases.find((p) => p.slug === 'routes')!;
    const routesContextBefore = routesBefore.context;
    const routesAcsBefore = routesBefore.acceptance_criteria.map((ac) => ac.text);

    // Simulate plan-check surfacing the gap as a question via
    // append_plan with the `→ ?` marker suffix. NO call to
    // set_phase_context or set_ac_text (the agent's frontmatter
    // explicitly omits those for semantic changes).
    const question =
      'Q: routes phase plans new work in src/auth/ but does not acknowledge existing handler.ts — extend or replace? → ?';
    await ops.task.context.plan.append('semantic-gap-sample', question);

    const after = await ops.task.read('semantic-gap-sample');

    // Question marker is now present in context.plan.
    expect(after.context.plan).toContain(question);
    expect(countQuestions(after.context.plan)).toBe(1);

    // phase.context untouched — no silent edit.
    const routesAfter = after.phases.find((p) => p.slug === 'routes')!;
    expect(routesAfter.context).toBe(routesContextBefore);

    // acceptance_criteria untouched — no silent text changes.
    expect(routesAfter.acceptance_criteria.map((ac) => ac.text)).toEqual(
      routesAcsBefore,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 5 — parallelism detection is info-only (no question marker)
// ─────────────────────────────────────────────────────────────────────

describe('plan-check integration: parallelism detection (info-only)', () => {
  it('appends a `Note: ...` line to context.plan WITHOUT a `→ ?` suffix', async () => {
    fixture = await createFixture({
      slug: 'disjoint-sample',
      taskYml: DISJOINT_PHASES_TASK,
    });
    const ops = createOps(fixture.config, fixture.root);

    const notesBefore = countNotes((await ops.task.read('disjoint-sample')).context.plan);
    const questionsBefore = countQuestions(
      (await ops.task.read('disjoint-sample')).context.plan,
    );

    // Simulate plan-check flagging the parallelism candidate as an
    // info note (NOT a question — no `→ ?` suffix). The orchestrator's
    // Q&A loop must skip these.
    const note =
      'Note: phases auth-phase + oauth-phase touch disjoint files (src/auth/ vs src/oauth/), no apparent data dependencies — candidates for parallel execution in V0.3.';
    await ops.task.context.plan.append('disjoint-sample', note);

    const after = await ops.task.read('disjoint-sample');

    // Note landed in context.plan.
    expect(after.context.plan).toContain(note);
    expect(countNotes(after.context.plan)).toBe(notesBefore + 1);

    // No question marker added — info notes are statements, not
    // questions. This is the key invariant: orchestrator's Q&A loop
    // counts `→ ?` markers, and an info note must NOT trigger it.
    expect(countQuestions(after.context.plan)).toBe(questionsBefore);
  });
});
