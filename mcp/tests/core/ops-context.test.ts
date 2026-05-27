/**
 * context.* op tests — intro / plan / build.subsection / wrap.intro /
 * wrap.subsection + the refinement marker resolver.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { RefinementMarkerNotFound } from '../../src/core/errors.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('context.intro.set', () => {
  it('replaces the intro', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.context.intro.set(
      'sample',
      'New intro paragraph.',
    );
    expect(file.context.intro).toBe('New intro paragraph.');
  });
});

describe('context.plan.append', () => {
  it('creates the plan field on first append', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.context.plan.append(
      'sample',
      'First line of plan.',
    );
    expect(file.context.plan).toBe('First line of plan.');
  });

  it('preserves existing content on subsequent appends', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.context.plan.append('sample', 'Line 1');
    const file = await ops.task.context.plan.append('sample', 'Line 2');
    expect(file.context.plan).toContain('Line 1');
    expect(file.context.plan).toContain('Line 2');
  });
});

describe('context.plan.refinement.resolve', () => {
  it('replaces the q_index-th `→ ?` marker with the resolution', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: drafted
created: 2026-05-26
title: Sample
context:
  intro: A
  plan: |
    Q: should we cache → ?
    Q: should we ship → ?
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: do it
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);

    const file = await ops.task.context.plan.refinement.resolve(
      'sample',
      1,
      'yes — ship Monday',
    );
    expect(file.context.plan).toContain('Q: should we cache → ?');
    expect(file.context.plan).toContain('Q: should we ship → yes — ship Monday');
    // First marker is untouched.
    expect((file.context.plan!.match(/→ \?/g) ?? []).length).toBe(1);
  });

  it('throws RefinementMarkerNotFound on out-of-range index', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: drafted
created: 2026-05-26
title: Sample
context:
  intro: A
  plan: |
    Q: only one marker → ?
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: do it
        status: pending
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.context.plan.refinement.resolve('sample', 5, 'nope'),
    ).rejects.toBeInstanceOf(RefinementMarkerNotFound);
  });
});

describe('context.build.subsection', () => {
  it('creates the subsection on first append', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.context.build
      .subsection('Implement')
      .append('sample', 'wrote a helper');
    expect(file.context.build?.Implement).toBe('wrote a helper');
  });

  it('appends to an existing subsection', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.context.build.subsection('Implement').append('sample', 'one');
    const file = await ops.task.context.build
      .subsection('Implement')
      .append('sample', 'two');
    expect(file.context.build?.Implement).toContain('one');
    expect(file.context.build?.Implement).toContain('two');
  });

  it('set() replaces wholesale', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.context.build.subsection('Implement').append('sample', 'one');
    const file = await ops.task.context.build
      .subsection('Implement')
      .set('sample', 'fresh content');
    expect(file.context.build?.Implement).toBe('fresh content');
  });
});

describe('context.wrap', () => {
  it('wrap.intro.set creates the intro field', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.context.wrap.intro.set('sample', 'wrap summary');
    expect(file.context.wrap?.intro).toBe('wrap summary');
  });

  it('wrap.subsection(name).set creates the subsection', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.context.wrap
      .subsection('code-check')
      .set('sample', 'lgtm');
    expect(file.context.wrap?.subsections?.['code-check']).toBe('lgtm');
  });

  it('wrap.subsection append preserves previous content', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.context.wrap.subsection('notes').append('sample', 'A');
    const file = await ops.task.context.wrap
      .subsection('notes')
      .append('sample', 'B');
    expect(file.context.wrap?.subsections?.notes).toContain('A');
    expect(file.context.wrap?.subsections?.notes).toContain('B');
  });
});
