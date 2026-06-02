/**
 * phase.* op tests.
 *
 * Covers list/next/add/remove/move + status/name/context/rules +
 * retry_count.increment. The state-machine gate on status.set is
 * inherited from assertPhaseTransition (tested in state-machine.test.ts);
 * here we focus on the AC-completeness gate (IncompletePhase) added at
 * V0.2 for the done transition.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import {
  DuplicateSlug,
  DonePhaseImmutable,
  IncompletePhase,
  InvalidFieldValue,
  InvalidTransition,
} from '../../src/core/errors.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('phase.list / phase.next', () => {
  it('list returns name/slug/status for each phase', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const list = await ops.task.phase.list('sample');
    expect(list).toEqual([
      { name: 'First Phase', slug: 'first', status: 'pending' },
      { name: 'Second Phase', slug: 'second', status: 'pending' },
    ]);
  });

  it('next returns the first pending phase when none are in-progress', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const next = await ops.task.phase.next('sample');
    expect(next).toEqual({ name: 'First Phase', slug: 'first' });
  });

  it('next returns null when all phases are terminal', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: P1
    slug: p1
    status: done
    acceptance_criteria:
      - text: a
        status: done
        evidence: ['proven']
  - name: P2
    slug: p2
    status: deferred
    acceptance_criteria:
      - text: b
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const next = await ops.task.phase.next('sample');
    expect(next).toBeNull();
  });
});

describe('phase.add', () => {
  it('places at end when no position is given', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.add('sample', {
      name: 'Third',
      slug: 'third',
    });
    expect(file.phases.map((p) => p.slug)).toEqual(['first', 'second', 'third']);
  });

  it('places after the named phase', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.add(
      'sample',
      { name: 'Middle', slug: 'middle' },
      { after: 'first' },
    );
    expect(file.phases.map((p) => p.slug)).toEqual(['first', 'middle', 'second']);
  });

  it('places before the named phase', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.add(
      'sample',
      { name: 'Pre', slug: 'pre' },
      { before: 'second' },
    );
    expect(file.phases.map((p) => p.slug)).toEqual(['first', 'pre', 'second']);
  });

  it('places at the start with { to: "start" }', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.add(
      'sample',
      { name: 'Zero', slug: 'zero' },
      { to: 'start' },
    );
    expect(file.phases.map((p) => p.slug)).toEqual(['zero', 'first', 'second']);
  });

  it('rejects DuplicateSlug if the slug already exists in the task', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.phase.add('sample', { name: 'Dup', slug: 'first' }),
    ).rejects.toBeInstanceOf(DuplicateSlug);
  });
});

describe('phase.remove', () => {
  it('removes by slug', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.remove('sample', 'first');
    expect(file.phases.map((p) => p.slug)).toEqual(['second']);
  });

  it('rejects a done-status phase without { force: true }', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: Done
    slug: done-phase
    status: done
    acceptance_criteria:
      - text: ok
        status: done
        evidence: ['proven']
  - name: Other
    slug: other
    status: pending
    acceptance_criteria:
      - text: ok
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.phase.remove('sample', 'done-phase')).rejects.toBeInstanceOf(
      DonePhaseImmutable,
    );
  });

  it('removes a done phase when force: true is passed', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: T
context:
  intro: x
phases:
  - name: Done
    slug: done-phase
    status: done
    acceptance_criteria:
      - text: ok
        status: done
        evidence: ['proven']
  - name: Other
    slug: other
    status: pending
    acceptance_criteria:
      - text: ok
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.remove('sample', 'done-phase', {
      force: true,
    });
    expect(file.phases.map((p) => p.slug)).toEqual(['other']);
  });
});

describe('phase.move', () => {
  it('repositions a phase via { after: ... }', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    // Add a third phase, then move it before 'first'.
    await ops.task.phase.add('sample', { name: 'Third', slug: 'third' });
    const file = await ops.task.phase.move('sample', 'third', {
      to: 'start',
    });
    expect(file.phases.map((p) => p.slug)).toEqual(['third', 'first', 'second']);
  });
});

describe('phase.status.set', () => {
  it('transitions pending → in-progress', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.status.set('sample', 'first', 'in-progress');
    expect(file.phases.find((p) => p.slug === 'first')!.status).toBe('in-progress');
  });

  it('rejects illegal transition pending → done directly', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    // pending → done is not a legal direct transition (must go via in-progress).
    await expect(ops.task.phase.status.set('sample', 'first', 'done')).rejects.toBeInstanceOf(
      InvalidTransition,
    );
  });

  it('rejects done transition when any AC is still pending (IncompletePhase)', async () => {
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
        evidence: ['proven']
      - text: b
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.phase.status.set('sample', 'p', 'done')).rejects.toBeInstanceOf(
      IncompletePhase,
    );
  });

  it('allows done transition when every AC is status="done"', async () => {
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
        evidence: ['proven a']
      - text: b
        status: done
        evidence: ['proven b']
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.status.set('sample', 'p', 'done');
    expect(file.phases[0]!.status).toBe('done');
  });
});

describe('phase.executor.set', () => {
  it('persists executor through atomicWrite + full-file re-validation (re-read shows the value)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.executor.set('sample', 'first', 'workflow');
    const file = await fixture.readTaskRaw();
    expect(file.phases.find((p) => p.slug === 'first')!.executor).toBe('workflow');
  });

  it('accepts the "implement" value too', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.executor.set('sample', 'first', 'implement');
    expect(file.phases.find((p) => p.slug === 'first')!.executor).toBe('implement');
  });

  it('rejects an invalid executor value with InvalidFieldValue', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      // @ts-expect-error — deliberately passing an invalid enum value
      ops.task.phase.executor.set('sample', 'first', 'parallel'),
    ).rejects.toBeInstanceOf(InvalidFieldValue);
  });

  it('does NOT alter phase status or trigger a state-machine transition', async () => {
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
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.executor.set('sample', 'p', 'workflow');
    // status untouched — still in-progress, no transition fired even though
    // an AC is pending (which would block a status→done transition).
    expect(file.phases.find((p) => p.slug === 'p')!.status).toBe('in-progress');
    expect(file.phases.find((p) => p.slug === 'p')!.executor).toBe('workflow');
  });
});

describe('phase.name.set / context.set', () => {
  it('name.set updates the phase name', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.name.set('sample', 'first', 'Renamed');
    expect(file.phases.find((p) => p.slug === 'first')!.name).toBe('Renamed');
  });

  it('context.set updates the phase context', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.context.set('sample', 'first', 'phase-specific notes');
    expect(file.phases.find((p) => p.slug === 'first')!.context).toBe('phase-specific notes');
  });
});

describe('phase.rules', () => {
  it('rules.set replaces the rules array wholesale', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.rules.set('sample', 'first', [
      { path: 'src/foo.ts', why: 'because' },
    ]);
    expect(file.phases.find((p) => p.slug === 'first')!.rules).toEqual([
      { path: 'src/foo.ts', why: 'because' },
    ]);
  });

  it('rules.add appends one rule', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.rules.add('sample', 'first', {
      path: 'a',
      why: 'A',
    });
    const file = await ops.task.phase.rules.add('sample', 'first', {
      path: 'b',
      why: 'B',
    });
    expect(file.phases.find((p) => p.slug === 'first')!.rules).toEqual([
      { path: 'a', why: 'A' },
      { path: 'b', why: 'B' },
    ]);
  });

  it('rules.remove deletes by index', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.rules.set('sample', 'first', [
      { path: 'a', why: 'A' },
      { path: 'b', why: 'B' },
    ]);
    const file = await ops.task.phase.rules.remove('sample', 'first', 0);
    expect(file.phases.find((p) => p.slug === 'first')!.rules).toEqual([{ path: 'b', why: 'B' }]);
  });
});

describe('phase.retry_count.increment', () => {
  it('returns 1 on first call, 2 on second', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const first = await ops.task.phase.retry_count.increment('sample', 'first');
    expect(first).toBe(1);
    const second = await ops.task.phase.retry_count.increment('sample', 'first');
    expect(second).toBe(2);
  });

  it('persists the count atomically (re-read shows incremented value)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.retry_count.increment('sample', 'first');
    await ops.task.phase.retry_count.increment('sample', 'first');
    await ops.task.phase.retry_count.increment('sample', 'first');
    const file = await fixture.readTaskRaw();
    expect(file.phases.find((p) => p.slug === 'first')!.retry_count).toBe(3);
  });
});
