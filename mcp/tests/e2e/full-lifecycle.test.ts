/**
 * End-to-end full-lifecycle test — V0.2 architecture checkpoint.
 *
 * Drives the factory ops directly (no LLM spawning) through the complete
 * 6-state task lifecycle (plan → drafted → refined → build → wrap → done).
 * If this suite is green, the foundational refactor (P1-P4) holds end-to-end:
 *   - the 6-state machine is correct
 *   - the atomicity contracts (evidence.set clears failures, failures.set
 *     keeps evidence) hold
 *   - state-gates (phase.done requires all ACs done, task.wrap requires
 *     all phases terminal) work
 *   - YAML round-trip is stable across every op
 *
 * No subprocess / no MCP server / no CLI — pure factory ops only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import { performance } from 'node:perf_hooks';

import { createOps, type TaskOps } from '../../src/core/factory.js';
import { parseAnchoredYml, type AnchoredYml } from '../../src/schema/anchored-yml.js';
import { parseTaskFile } from '../../src/schema/task-file.js';
import {
  IncompletePhase,
  IncompletePhases,
  InvalidEvidence,
  InvalidTransition,
} from '../../src/core/errors.js';

// ─────────────────────────────────────────────────────────────────────
// per-test scratch project root
// ─────────────────────────────────────────────────────────────────────

const EMPTY_ANCHORED_YML = `task:
  phase:
    fields: []
plan: {}
refine: {}
build: {}
wrap: {}
`;

interface E2EFixture {
  root: string;
  config: AnchoredYml;
  ops: TaskOps;
  taskFilePath: (slug: string) => string;
  cleanup: () => Promise<void>;
}

async function createE2EFixture(): Promise<E2EFixture> {
  const root = await mkdtemp(join(tmpdir(), 'anchored-e2e-lifecycle-'));
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true });
  await writeFile(join(root, 'anchored.yml'), EMPTY_ANCHORED_YML, 'utf-8');
  const config = parseAnchoredYml(yamlParse(EMPTY_ANCHORED_YML));
  const ops = createOps(config, root);
  return {
    root,
    config,
    ops,
    taskFilePath: (slug: string) => join(root, '.claude', 'tasks', `${slug}.yml`),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * Char-code scan: reject any control character other than the YAML-legal
 * whitespace trio (\t \n \r) plus DEL (0x7f). Done as a code-point loop
 * (instead of a regex literal) so the test source file itself does NOT
 * have to contain the control characters it's checking for.
 */
function assertNoUnexpectedControlChars(raw: string): void {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 0x00) {
      throw new Error(`unexpected NUL byte at offset ${i}`);
    }
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      throw new Error(`unexpected control char 0x${code.toString(16)} at offset ${i}`);
    }
    if (code === 0x7f) {
      throw new Error(`unexpected DEL char (0x7f) at offset ${i}`);
    }
  }
}

/**
 * After-every-mutation health check. Re-reads the file from disk, asserts:
 *   - file parses as valid YAML
 *   - schema_version is still 2
 *   - Zod schema validation passes (TaskFile.parse() succeeds)
 *   - no unexpected control chars / null bytes
 *
 * Returns the parsed file so callers can assert further on it.
 */
async function assertRoundTrip(
  fixture: E2EFixture,
  slug: string,
): Promise<ReturnType<typeof parseTaskFile>> {
  const raw = await readFile(fixture.taskFilePath(slug), 'utf-8');
  assertNoUnexpectedControlChars(raw);
  const parsed = yamlParse(raw);
  expect(parsed).toBeTypeOf('object');
  expect((parsed as { schema_version?: unknown }).schema_version).toBe(2);
  return parseTaskFile(parsed);
}

// ─────────────────────────────────────────────────────────────────────
// fixture lifecycle
// ─────────────────────────────────────────────────────────────────────

let fixture: E2EFixture | null = null;

beforeEach(async () => {
  fixture = await createE2EFixture();
});

afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

function fx(): E2EFixture {
  if (!fixture) throw new Error('fixture missing — beforeEach failed?');
  return fixture;
}

// ─────────────────────────────────────────────────────────────────────
// 1. Full happy-path lifecycle
// ─────────────────────────────────────────────────────────────────────

describe('e2e: full task lifecycle', () => {
  it('drives a complete task through plan → drafted → refined → build → wrap → done', async () => {
    const f = fx();
    const slug = 'demo-lifecycle';

    // ─── 1. plan stage ─────────────────────────────────────────────
    const created = await f.ops.task.create(slug, {
      title: 'Demo E2E',
      intro: 'Building a small auth flow',
    });
    expect(created.status).toBe('plan');
    expect(created.title).toBe('Demo E2E');
    await assertRoundTrip(f, slug);

    const afterCreate = await f.ops.task.read(slug);
    expect(afterCreate.status).toBe('plan');

    // plan context — initial brainstorm
    await f.ops.task.context.plan.append(slug, 'Decisions:\n- Use JWT\n- Token TTL = 1h');
    await assertRoundTrip(f, slug);

    // plan context — open refinement questions
    await f.ops.task.context.plan.append(
      slug,
      '\n\nQ: What signing algo? → ?\nQ: Refresh strategy? → ?',
    );
    const afterQs = await assertRoundTrip(f, slug);
    expect(afterQs.context.plan).toBeDefined();
    // Two `→ ?` markers should now be present.
    expect((afterQs.context.plan ?? '').match(/→ \?/g)?.length).toBe(2);

    // Resolve first question.
    await f.ops.task.context.plan.refinement.resolve(slug, 0, 'HS256');
    const afterFirstResolve = await assertRoundTrip(f, slug);
    expect((afterFirstResolve.context.plan ?? '').match(/→ \?/g)?.length).toBe(1);
    expect(afterFirstResolve.context.plan).toContain('→ HS256');

    // Resolve the (now first / originally second) question. Index 0 again,
    // because the original index 0 marker is gone.
    await f.ops.task.context.plan.refinement.resolve(slug, 0, 'Sliding window, 30d max');
    const afterAllResolved = await assertRoundTrip(f, slug);
    expect(afterAllResolved.context.plan ?? '').not.toContain('→ ?');
    expect(afterAllResolved.context.plan).toContain('→ Sliding window');

    // Add 3 phases.
    await f.ops.task.phase.add(slug, {
      name: 'Token storage',
      slug: 'token-storage',
      acceptance_criteria: [
        { text: 'Storage interface exists', status: 'pending' },
        { text: 'JWT decoder works', status: 'pending' },
      ],
    });
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.add(slug, {
      name: 'Login endpoint',
      slug: 'login',
      acceptance_criteria: [{ text: 'POST /login returns token', status: 'pending' }],
    });
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.add(slug, {
      name: 'Logout endpoint',
      slug: 'logout',
      acceptance_criteria: [{ text: 'POST /logout clears token', status: 'pending' }],
    });
    const afterPhases = await assertRoundTrip(f, slug);
    expect(afterPhases.phases.map((p) => p.slug)).toEqual(['token-storage', 'login', 'logout']);

    // ─── 2. plan → drafted ─────────────────────────────────────────
    await f.ops.task.status.set(slug, 'drafted');
    const drafted = await assertRoundTrip(f, slug);
    expect(drafted.status).toBe('drafted');

    // ─── 3. refine stage ──────────────────────────────────────────
    await f.ops.task.context.build
      .subsection('plan-check')
      .append(
        slug,
        'Plan reviewed. Phase paths verified against src/. Phase 1 missing factory-pattern rule — auto-added.',
      );
    await assertRoundTrip(f, slug);

    await f.ops.task.context.build
      .subsection('rules-check')
      .append(slug, 'Rules scan complete. 3 rules applied across phases.');
    const afterRefine = await assertRoundTrip(f, slug);
    expect(afterRefine.context.build).toBeDefined();
    expect(afterRefine.context.build?.['plan-check']).toContain('Plan reviewed');
    expect(afterRefine.context.build?.['rules-check']).toContain('Rules scan complete');

    // ─── 4. drafted → refined ─────────────────────────────────────
    await f.ops.task.status.set(slug, 'refined');
    const refined = await assertRoundTrip(f, slug);
    expect(refined.status).toBe('refined');

    // ─── 5. refined → build ───────────────────────────────────────
    await f.ops.task.status.set(slug, 'build');
    const inBuild = await assertRoundTrip(f, slug);
    expect(inBuild.status).toBe('build');

    // ─── 6. build stage — phase 1 (token-storage) ─────────────────
    await f.ops.task.phase.status.set(slug, 'token-storage', 'in-progress');
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.ac.evidence.set(slug, 'token-storage', 0, [
      'src/auth/storage.ts:12 — TokenStorage interface',
      'tests/auth/storage.test.ts:8 — 4/4 passing',
    ]);
    const afterAc0 = await assertRoundTrip(f, slug);
    const tsPhase = afterAc0.phases.find((p) => p.slug === 'token-storage')!;
    expect(tsPhase.acceptance_criteria[0]!.status).toBe('done');
    expect(tsPhase.acceptance_criteria[0]!.failures).toBeUndefined();
    expect(tsPhase.acceptance_criteria[0]!.evidence?.length).toBe(2);

    await f.ops.task.phase.ac.evidence.set(slug, 'token-storage', 1, [
      'src/auth/jwt.ts:34 — decodeJwt() impl',
      'npm test src/auth/jwt — 6/6 passing',
    ]);
    const afterAc1 = await assertRoundTrip(f, slug);
    const tsPhase2 = afterAc1.phases.find((p) => p.slug === 'token-storage')!;
    expect(tsPhase2.acceptance_criteria[1]!.status).toBe('done');

    await f.ops.task.phase.status.set(slug, 'token-storage', 'done');
    const afterPhase1Done = await assertRoundTrip(f, slug);
    expect(afterPhase1Done.phases.find((p) => p.slug === 'token-storage')!.status).toBe('done');

    // ─── 6. build stage — phase 2 (login) ─────────────────────────
    await f.ops.task.phase.status.set(slug, 'login', 'in-progress');
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.ac.evidence.set(slug, 'login', 0, [
      'src/auth/routes/login.ts:18 — POST handler',
      'curl -X POST /login → 200 + JWT body verified',
    ]);
    const afterLoginAc = await assertRoundTrip(f, slug);
    expect(
      afterLoginAc.phases.find((p) => p.slug === 'login')!.acceptance_criteria[0]!.status,
    ).toBe('done');

    await f.ops.task.phase.status.set(slug, 'login', 'done');
    await assertRoundTrip(f, slug);

    // ─── 6. build stage — phase 3 (logout) ────────────────────────
    await f.ops.task.phase.status.set(slug, 'logout', 'in-progress');
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.ac.evidence.set(slug, 'logout', 0, [
      'src/auth/routes/logout.ts:14 — POST handler clears cookie',
      'integration test logout.test.ts:22 — 3/3 passing',
    ]);
    await assertRoundTrip(f, slug);

    await f.ops.task.phase.status.set(slug, 'logout', 'done');
    const afterAllPhases = await assertRoundTrip(f, slug);
    expect(afterAllPhases.phases.every((p) => p.status === 'done')).toBe(true);

    // ─── 7. build → wrap ──────────────────────────────────────────
    await f.ops.task.status.set(slug, 'wrap');
    const wrapping = await assertRoundTrip(f, slug);
    expect(wrapping.status).toBe('wrap');

    await f.ops.task.context.wrap.intro.set(
      slug,
      'Auth flow shipped. 3 phases, 4 ACs, all evidence concrete.',
    );
    const afterWrapIntro = await assertRoundTrip(f, slug);
    expect(afterWrapIntro.context.wrap?.intro).toContain('Auth flow shipped');

    // ─── 8. wrap → done ───────────────────────────────────────────
    await f.ops.task.status.set(slug, 'done');
    const finalRead = await f.ops.task.read(slug);
    expect(finalRead.status).toBe('done');
    const finalParsed = await assertRoundTrip(f, slug);
    expect(finalParsed.status).toBe('done');
    // No `→ ?` markers anywhere in plan after refinement.
    expect(finalParsed.context.plan ?? '').not.toContain('→ ?');
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. Failures-driven re-do loop
  // ───────────────────────────────────────────────────────────────────

  it('handles a failures-driven re-do loop mid-build', async () => {
    const f = fx();
    const slug = 'redo-loop';

    // Setup: create task, add 1 phase with 1 AC, walk to status=build,
    // phase=in-progress.
    await f.ops.task.create(slug, {
      title: 'Redo loop test',
      intro: 'Validates evidence/failures atomicity contracts.',
    });
    await f.ops.task.phase.add(slug, {
      name: 'The one phase',
      slug: 'one',
      acceptance_criteria: [{ text: 'Function shipped', status: 'pending' }],
    });
    await f.ops.task.status.set(slug, 'drafted');
    await f.ops.task.status.set(slug, 'refined');
    await f.ops.task.status.set(slug, 'build');
    await f.ops.task.phase.status.set(slug, 'one', 'in-progress');

    // Step 1: first evidence set — claim it's done.
    await f.ops.task.phase.ac.evidence.set(slug, 'one', 0, [
      'stub implementation in src/auth.ts:10',
    ]);
    const afterFirst = await assertRoundTrip(f, slug);
    const acAfterFirst = afterFirst.phases[0]!.acceptance_criteria[0]!;
    expect(acAfterFirst.status).toBe('done');
    expect(acAfterFirst.evidence).toEqual(['stub implementation in src/auth.ts:10']);
    expect(acAfterFirst.failures).toBeUndefined();

    // Step 2: task-validate rejects it — set failures.
    await f.ops.task.phase.ac.failures.set(slug, 'one', 0, [
      're-ran test → 0/3 passing',
      'curl returns 404',
    ]);
    const afterFailures = await assertRoundTrip(f, slug);
    const acAfterFailures = afterFailures.phases[0]!.acceptance_criteria[0]!;
    expect(acAfterFailures.status).toBe('pending');
    expect(acAfterFailures.failures).toEqual(['re-ran test → 0/3 passing', 'curl returns 404']);
    // Critical: evidence is PRESERVED for retry context.
    expect(acAfterFailures.evidence).toEqual(['stub implementation in src/auth.ts:10']);

    // Step 3: implement-agent retries with real proof.
    await f.ops.task.phase.ac.evidence.set(slug, 'one', 0, [
      'real implementation in src/auth.ts:25',
      'test 3/3 passing',
    ]);
    const afterRetry = await assertRoundTrip(f, slug);
    const acAfterRetry = afterRetry.phases[0]!.acceptance_criteria[0]!;
    expect(acAfterRetry.status).toBe('done');
    // evidence array REPLACED with new content (not appended).
    expect(acAfterRetry.evidence).toEqual([
      'real implementation in src/auth.ts:25',
      'test 3/3 passing',
    ]);
    // failures CLEARED on successful evidence.set.
    expect(acAfterRetry.failures).toBeUndefined();

    // Step 4: phase done now succeeds.
    await f.ops.task.phase.status.set(slug, 'one', 'done');
    const phaseDone = await assertRoundTrip(f, slug);
    expect(phaseDone.phases[0]!.status).toBe('done');
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. State-machine and AC gates — negative assertions
  // ───────────────────────────────────────────────────────────────────

  it('enforces state-machine and AC gates throughout', async () => {
    const f = fx();
    const slug = 'gates-test';

    // Bootstrap: create at status=plan.
    await f.ops.task.create(slug, {
      title: 'Gates test',
      intro: 'Negative tests for state-machine + AC gates.',
    });

    // (6) Task at status=plan: status.set('done') → InvalidTransition.
    await expect(f.ops.task.status.set(slug, 'done')).rejects.toBeInstanceOf(InvalidTransition);
    // (7) Task at status=plan: status.set('refined') → InvalidTransition.
    await expect(f.ops.task.status.set(slug, 'refined')).rejects.toBeInstanceOf(InvalidTransition);

    // Walk to build with one phase + one AC.
    await f.ops.task.phase.add(slug, {
      name: 'Gate phase',
      slug: 'gate',
      acceptance_criteria: [{ text: 'gate AC', status: 'pending' }],
    });
    await f.ops.task.status.set(slug, 'drafted');
    await f.ops.task.status.set(slug, 'build');
    await f.ops.task.phase.status.set(slug, 'gate', 'in-progress');

    // (1) Task at status=build with one phase still in-progress:
    // status.set('wrap') → IncompletePhases.
    await expect(f.ops.task.status.set(slug, 'wrap')).rejects.toBeInstanceOf(IncompletePhases);

    // (2) Phase with one AC still status=pending: phase.status.set('done')
    // → IncompletePhase.
    await expect(f.ops.task.phase.status.set(slug, 'gate', 'done')).rejects.toBeInstanceOf(
      IncompletePhase,
    );

    // (3-5) Evidence.set rejects bad input — empty string, empty array,
    // and em-dash sentinel.
    await expect(f.ops.task.phase.ac.evidence.set(slug, 'gate', 0, [''])).rejects.toBeInstanceOf(
      InvalidEvidence,
    );

    await expect(f.ops.task.phase.ac.evidence.set(slug, 'gate', 0, [])).rejects.toBeInstanceOf(
      InvalidEvidence,
    );

    await expect(f.ops.task.phase.ac.evidence.set(slug, 'gate', 0, ['—'])).rejects.toBeInstanceOf(
      InvalidEvidence,
    );

    // Final sanity: file is still valid after all the failed mutations.
    const stillValid = await assertRoundTrip(f, slug);
    expect(stillValid.status).toBe('build');
    expect(stillValid.phases[0]!.status).toBe('in-progress');
    expect(stillValid.phases[0]!.acceptance_criteria[0]!.status).toBe('pending');
  });

  // ───────────────────────────────────────────────────────────────────
  // 4. YAML round-trip stability across many ops
  // ───────────────────────────────────────────────────────────────────

  it('preserves YAML round-trip after every op', async () => {
    const f = fx();
    const slug = 'roundtrip';

    type OpFn = () => Promise<unknown>;
    const opsList: { label: string; fn: OpFn }[] = [];

    opsList.push({
      label: 'task.create',
      fn: () =>
        f.ops.task.create(slug, {
          title: 'Round-trip task',
          intro: 'Multi-op stability check.',
        }),
    });
    opsList.push({
      label: 'task.title.set',
      fn: () => f.ops.task.title.set(slug, 'Round-trip task v2'),
    });
    opsList.push({
      label: 'context.intro.set',
      fn: () => f.ops.task.context.intro.set(slug, 'Intro updated by round-trip test.'),
    });
    opsList.push({
      label: 'context.plan.append #1',
      fn: () => f.ops.task.context.plan.append(slug, 'First plan line.'),
    });
    opsList.push({
      label: 'context.plan.append #2',
      fn: () => f.ops.task.context.plan.append(slug, '\nQ: refinement marker? → ?'),
    });
    opsList.push({
      label: 'context.plan.refinement.resolve',
      fn: () => f.ops.task.context.plan.refinement.resolve(slug, 0, 'resolved'),
    });
    opsList.push({
      label: 'phase.add a',
      fn: () =>
        f.ops.task.phase.add(slug, {
          name: 'Alpha',
          slug: 'alpha',
          acceptance_criteria: [
            { text: 'first ac', status: 'pending' },
            { text: 'second ac', status: 'pending' },
          ],
        }),
    });
    opsList.push({
      label: 'phase.add b',
      fn: () =>
        f.ops.task.phase.add(slug, {
          name: 'Beta',
          slug: 'beta',
          acceptance_criteria: [{ text: 'beta ac', status: 'pending' }],
        }),
    });
    opsList.push({
      label: 'phase.name.set',
      fn: () => f.ops.task.phase.name.set(slug, 'alpha', 'Alpha (renamed)'),
    });
    opsList.push({
      label: 'phase.context.set',
      fn: () => f.ops.task.phase.context.set(slug, 'alpha', 'Phase-specific context for alpha.'),
    });
    opsList.push({
      label: 'phase.rules.add',
      fn: () =>
        f.ops.task.phase.rules.add(slug, 'alpha', {
          path: 'src/style.md',
          why: 'project style rules',
        }),
    });
    opsList.push({
      label: 'phase.rules.set',
      fn: () =>
        f.ops.task.phase.rules.set(slug, 'alpha', [
          { path: 'src/style.md', why: 'project style' },
          { path: 'tests/conventions.md', why: 'testing patterns' },
        ]),
    });
    opsList.push({
      label: 'phase.rules.remove',
      fn: () => f.ops.task.phase.rules.remove(slug, 'alpha', 0),
    });
    opsList.push({
      label: 'ac.add',
      fn: () =>
        f.ops.task.phase.ac.add(slug, 'alpha', {
          text: 'third ac added later',
          status: 'pending',
        }),
    });
    opsList.push({
      label: 'ac.text.set',
      fn: () => f.ops.task.phase.ac.text.set(slug, 'alpha', 0, 'first ac (text updated)'),
    });
    opsList.push({
      label: 'phase.move',
      fn: () => f.ops.task.phase.move(slug, 'beta', { to: 'start' }),
    });
    opsList.push({
      label: 'task.status.set drafted',
      fn: () => f.ops.task.status.set(slug, 'drafted'),
    });
    opsList.push({
      label: 'task.status.set build (shortcut)',
      fn: () => f.ops.task.status.set(slug, 'build'),
    });
    opsList.push({
      label: 'phase.status.set alpha in-progress',
      fn: () => f.ops.task.phase.status.set(slug, 'alpha', 'in-progress'),
    });
    opsList.push({
      label: 'phase.retry_count.increment',
      fn: () => f.ops.task.phase.retry_count.increment(slug, 'alpha'),
    });
    opsList.push({
      label: 'ac.evidence.set',
      fn: () =>
        f.ops.task.phase.ac.evidence.set(slug, 'alpha', 0, ['src/alpha.ts:10 — initial impl']),
    });
    opsList.push({
      label: 'ac.evidence.add',
      fn: () =>
        f.ops.task.phase.ac.evidence.add(slug, 'alpha', 0, 'src/alpha.test.ts:5 — 1/1 passing'),
    });
    opsList.push({
      label: 'ac.failures.set',
      fn: () => f.ops.task.phase.ac.failures.set(slug, 'alpha', 1, ['expected: nope']),
    });
    opsList.push({
      label: 'ac.failures.clear',
      fn: () => f.ops.task.phase.ac.failures.clear(slug, 'alpha', 1),
    });
    opsList.push({
      label: 'context.build.subsection(impl).append',
      fn: () => f.ops.task.context.build.subsection('Implement').append(slug, 'impl notes line 1'),
    });
    opsList.push({
      label: 'context.build.subsection(impl).set',
      fn: () =>
        f.ops.task.context.build
          .subsection('Implement')
          .set(slug, 'impl notes (replaced wholesale)'),
    });

    // Run each op, asserting round-trip after every single one.
    for (const { label, fn } of opsList) {
      await fn();
      const parsed = await assertRoundTrip(f, slug);
      expect(parsed.schema_version, `after ${label}`).toBe(2);
    }

    // We exercised more than 20 ops.
    expect(opsList.length).toBeGreaterThanOrEqual(20);
  });

  // ───────────────────────────────────────────────────────────────────
  // 5. Performance budget — no LLM, this must be fast
  // ───────────────────────────────────────────────────────────────────

  it('completes the full lifecycle in under 10 seconds', async () => {
    const f = fx();
    const slug = 'perf-lifecycle';
    const start = performance.now();

    await f.ops.task.create(slug, {
      title: 'Perf check',
      intro: 'meta-assertion: pure ops drive in < 10s',
    });
    await f.ops.task.context.plan.append(slug, 'Quick decisions; Q: any blockers? → ?');
    await f.ops.task.context.plan.refinement.resolve(slug, 0, 'no');
    await f.ops.task.phase.add(slug, {
      name: 'Only phase',
      slug: 'only',
      acceptance_criteria: [{ text: 'ship it', status: 'pending' }],
    });
    await f.ops.task.status.set(slug, 'drafted');
    await f.ops.task.status.set(slug, 'refined');
    await f.ops.task.status.set(slug, 'build');
    await f.ops.task.phase.status.set(slug, 'only', 'in-progress');
    await f.ops.task.phase.ac.evidence.set(slug, 'only', 0, ['src/x.ts:1 — done']);
    await f.ops.task.phase.status.set(slug, 'only', 'done');
    await f.ops.task.status.set(slug, 'wrap');
    await f.ops.task.context.wrap.intro.set(slug, 'shipped');
    await f.ops.task.status.set(slug, 'done');

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});
