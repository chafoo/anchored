/**
 * Retry-loop integration test — exercises the failures-driven re-do
 * cycle that /impl-build drives through the MCP factory.
 *
 * This is a factory-level test (no LLM, no MCP transport) — it
 * simulates what the orchestrator does between agent spawns:
 *
 *   1. implement writes evidence → set_evidence atomically (status='done')
 *   2. task-validate rejects → set_failures atomically (status='pending',
 *      evidence KEPT as history)
 *   3. orchestrator scans the phase, sees failures, calls
 *      increment_retry → checks the new count vs retry_limit
 *   4. if N <= limit: re-spawn implement (loop) — implement reads
 *      failures, fixes, set_evidence again (failures cleared atomically)
 *   5. if N > limit: orchestrator sets phase status='blocked', failures
 *      preserved for user inspection
 *
 * We drive the loop directly via factory ops to verify the
 * atomicity contracts hold across realistic re-do sequences and
 * that retry_count + failures persist correctly across reads.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../src/core/factory.js';
import { createFixture, type Fixture } from './core/_fixture.js';

const RETRY_LIMIT = 3;

const STUBBORN_TASK_YML = `schema_version: 2
slug: stubborn
status: build
created: 2026-05-27
title: Stubborn Phase Task
context:
  intro: |
    A task whose only phase fails validation repeatedly to exercise
    the retry-loop until it hits the retry_limit and gets blocked.
phases:
  - name: Stubborn Phase
    slug: stubborn-phase
    status: in-progress
    acceptance_criteria:
      - text: implement the thing correctly
        status: pending
`;

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('retry-loop — failures-driven re-do cycle', () => {
  it('preserves retry_count + failures across the bounded re-do loop, then blocks', async () => {
    fixture = await createFixture({
      slug: 'stubborn',
      taskYml: STUBBORN_TASK_YML,
    });
    const ops = createOps(fixture.config, fixture.root);

    // ─── Attempt 1: implement → validate rejects ──────────────────
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'attempt 1 — src/foo.ts:9999 — bogus line ref',
    ]);
    // task-validate caught the bogus line; orchestrator stores per-AC
    // failures via set_failures (which keeps evidence as history).
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['evidence cites src/foo.ts:9999 but file has only 8 lines'],
    );

    // Orchestrator scans the phase, sees failures, bumps the retry
    // counter before re-spawning implement.
    let count = await ops.task.phase.retry_count.increment(
      'stubborn',
      'stubborn-phase',
    );
    expect(count).toBe(1);

    // After increment, the retry_count is persisted on disk.
    let onDisk = await fixture.readTaskRaw();
    expect(onDisk.phases[0]!.retry_count).toBe(1);
    // Evidence is preserved as history.
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.evidence).toEqual([
      'attempt 1 — src/foo.ts:9999 — bogus line ref',
    ]);
    // Failures are present, status flipped back to pending.
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.failures).toEqual([
      'evidence cites src/foo.ts:9999 but file has only 8 lines',
    ]);
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.status).toBe('pending');

    // ─── Attempt 2: implement still wrong → validate rejects ──────
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'attempt 2 — src/foo.ts:8888 — still bogus',
    ]);
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['evidence cites src/foo.ts:8888 — file still has only 8 lines'],
    );
    count = await ops.task.phase.retry_count.increment(
      'stubborn',
      'stubborn-phase',
    );
    expect(count).toBe(2);

    // ─── Attempt 3: implement still wrong → validate rejects ──────
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'attempt 3 — src/foo.ts:7777 — STILL bogus',
    ]);
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['evidence cites src/foo.ts:7777 — really still bogus'],
    );
    count = await ops.task.phase.retry_count.increment(
      'stubborn',
      'stubborn-phase',
    );
    expect(count).toBe(3);

    // Orchestrator check: count (3) is still ≤ retry_limit (3), so
    // we could re-spawn once more. Simulate the fourth round.

    // ─── Attempt 4: implement still wrong → validate rejects ──────
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'attempt 4 — src/foo.ts:6666 — give up',
    ]);
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['evidence cites src/foo.ts:6666 — exhausted patience'],
    );
    count = await ops.task.phase.retry_count.increment(
      'stubborn',
      'stubborn-phase',
    );
    expect(count).toBe(4);
    // count (4) > retry_limit (3) — orchestrator transitions to blocked.
    expect(count).toBeGreaterThan(RETRY_LIMIT);

    await ops.task.phase.status.set('stubborn', 'stubborn-phase', 'blocked');

    onDisk = await fixture.readTaskRaw();
    expect(onDisk.phases[0]!.status).toBe('blocked');
    // retry_count is preserved on the blocked phase.
    expect(onDisk.phases[0]!.retry_count).toBe(4);
    // Failures are preserved on the blocked AC.
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.failures).toEqual([
      'evidence cites src/foo.ts:6666 — exhausted patience',
    ]);
    // Evidence (latest attempt) is preserved as history.
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.evidence).toEqual([
      'attempt 4 — src/foo.ts:6666 — give up',
    ]);
  });

  it('keeps set_evidence working on a blocked phase (recovery mechanics)', async () => {
    // The orchestrator stops re-spawning implement after retry-limit
    // exhaustion, but the underlying MCP ops still work — the user can
    // intervene manually, set evidence, and unblock.
    fixture = await createFixture({
      slug: 'stubborn',
      taskYml: STUBBORN_TASK_YML,
    });
    const ops = createOps(fixture.config, fixture.root);

    // Drive the loop to blocked state.
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'bogus',
    ]);
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['bogus'],
    );
    for (let i = 0; i < RETRY_LIMIT + 1; i++) {
      await ops.task.phase.retry_count.increment(
        'stubborn',
        'stubborn-phase',
      );
    }
    await ops.task.phase.status.set('stubborn', 'stubborn-phase', 'blocked');

    let onDisk = await fixture.readTaskRaw();
    expect(onDisk.phases[0]!.status).toBe('blocked');

    // User fixes the underlying issue manually and writes real evidence.
    // The factory still accepts it (set_evidence doesn't gate on phase
    // status), atomically clearing failures + flipping AC to done.
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'src/foo.ts:5 — fixed for real',
    ]);

    onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.status).toBe('done');
    expect(ac.evidence).toEqual(['src/foo.ts:5 — fixed for real']);
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
    // Phase is still blocked (no auto-transition); user can move it
    // back to in-progress via set_phase_status if desired.
    expect(onDisk.phases[0]!.status).toBe('blocked');
  });

  it('clears failures atomically on the happy-path retry (impl fixes, set_evidence clears)', async () => {
    fixture = await createFixture({
      slug: 'stubborn',
      taskYml: STUBBORN_TASK_YML,
    });
    const ops = createOps(fixture.config, fixture.root);

    // Attempt 1: bogus.
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'attempt 1 — bogus',
    ]);
    await ops.task.phase.ac.failures.set(
      'stubborn',
      'stubborn-phase',
      0,
      ['evidence is bogus'],
    );
    const n1 = await ops.task.phase.retry_count.increment(
      'stubborn',
      'stubborn-phase',
    );
    expect(n1).toBe(1);

    // Pre-retry on disk: failures present, status pending, evidence preserved.
    let onDisk = await fixture.readTaskRaw();
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.failures).toEqual([
      'evidence is bogus',
    ]);
    expect(onDisk.phases[0]!.acceptance_criteria[0]!.status).toBe('pending');

    // Attempt 2: implement reads failures, fixes, writes real evidence.
    // The single set_evidence call atomically clears failures + sets done.
    await ops.task.phase.ac.evidence.set('stubborn', 'stubborn-phase', 0, [
      'src/foo.ts:5 — actually correct now',
    ]);

    onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.status).toBe('done');
    expect(ac.evidence).toEqual(['src/foo.ts:5 — actually correct now']);
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
    // retry_count persists — it's a historical counter, not reset on success.
    expect(onDisk.phases[0]!.retry_count).toBe(1);
  });
});
