/**
 * ac.* op tests — the atomicity contracts are the soul of this module.
 *
 * The "all three fields move together" claims are checked by reading
 * the file back from disk after each op (not just trusting the
 * returned value) — that's the real atomicity assertion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

// ─────────────────────────────────────────────────────────────────────
// ac.add / ac.remove / ac.text.set
// ─────────────────────────────────────────────────────────────────────

describe('ac.add', () => {
  it('appends a new AC with status=pending and no evidence', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.ac.add('sample', 'first', {
      text: 'extra criterion',
    });
    const phase = file.phases.find((p) => p.slug === 'first')!;
    expect(phase.acceptance_criteria.length).toBe(3);
    const newAc = phase.acceptance_criteria[2]!;
    expect(newAc.text).toBe('extra criterion');
    expect(newAc.status).toBe('pending');
    expect(newAc.evidence).toBeUndefined();
  });
});

describe('ac.remove', () => {
  it('deletes by index', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.ac.remove('sample', 'first', 0);
    const phase = file.phases.find((p) => p.slug === 'first')!;
    expect(phase.acceptance_criteria.length).toBe(1);
    expect(phase.acceptance_criteria[0]!.text).toBe('test the thing');
  });
});

describe('ac.text.set', () => {
  it('updates text without touching status / evidence / failures', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: old
        status: done
        evidence: ['proven via src/foo.ts:1']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.ac.text.set('sample', 'p', 0, 'new text');
    const ac = file.phases[0]!.acceptance_criteria[0]!;
    expect(ac.text).toBe('new text');
    expect(ac.status).toBe('done');
    expect(ac.evidence).toEqual(['proven via src/foo.ts:1']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ac.evidence.set — full atomicity contract
// ─────────────────────────────────────────────────────────────────────

describe('ac.evidence.set — atomicity', () => {
  it('sets evidence, flips status=done, CLEARS failures in one write', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: a
        status: pending
        failures: ['validation gate caught a typo']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.evidence.set('sample', 'p', 0, [
      'src/foo.ts:42 — implemented',
      'npm test — green',
    ]);
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.status).toBe('done');
    expect(ac.evidence).toEqual([
      'src/foo.ts:42 — implemented',
      'npm test — green',
    ]);
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// ac.evidence.add — atomic incremental
// ─────────────────────────────────────────────────────────────────────

describe('ac.evidence.add — atomicity', () => {
  it('appends to pending AC and flips status to done', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.evidence.add(
      'sample',
      'first',
      0,
      'src/foo.ts:1',
    );
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.evidence).toEqual(['src/foo.ts:1']);
    expect(ac.status).toBe('done');
  });

  it('appends to existing evidence array and clears failures', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: a
        status: done
        evidence: ['first proof']
        failures: ['something stale']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.evidence.add('sample', 'p', 0, 'second proof');
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.evidence).toEqual(['first proof', 'second proof']);
    expect(ac.status).toBe('done');
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// ac.failures.set — keeps evidence as history
// ─────────────────────────────────────────────────────────────────────

describe('ac.failures.set — atomicity', () => {
  it('sets failures, flips status=pending, KEEPS evidence as history', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: a
        status: done
        evidence: ['claimed proof']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.failures.set('sample', 'p', 0, [
      'task-check found a bug',
    ]);
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.status).toBe('pending');
    expect((ac as { failures?: string[] }).failures).toEqual([
      'task-check found a bug',
    ]);
    // Critical: evidence is KEPT as history for retry context.
    expect(ac.evidence).toEqual(['claimed proof']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ac.failures.clear — does not touch status
// ─────────────────────────────────────────────────────────────────────

describe('ac.failures.clear — atomicity', () => {
  it('removes failures field, status unchanged', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: a
        status: pending
        failures: ['x']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.failures.clear('sample', 'p', 0);
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
    expect(ac.status).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────
// ac.status.set('pending') — full reset
// ─────────────────────────────────────────────────────────────────────

describe('ac.status.set(pending) — full reset', () => {
  it('clears both evidence AND failures', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P
    slug: p
    status: in-progress
    acceptance_criteria:
      - text: a
        status: done
        evidence: ['e1', 'e2']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.ac.status.set('sample', 'p', 0, 'pending');
    const onDisk = await fixture.readTaskRaw();
    const ac = onDisk.phases[0]!.acceptance_criteria[0]!;
    expect(ac.status).toBe('pending');
    expect(ac.evidence).toBeUndefined();
    expect((ac as { failures?: string[] }).failures).toBeUndefined();
  });
});
