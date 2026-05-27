/**
 * task.* op tests — create, read, status.set, title.set.
 *
 * Verifies the state-machine gate on status.set (delegates to
 * assertTaskTransition) plus the file-existence semantics of create
 * (DuplicateSlug on clobber) and read (NotFound on missing).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { DuplicateSlug, NotFound, InvalidTransition } from '../../src/core/errors.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('task.create', () => {
  it('writes a valid file with status=plan', async () => {
    fixture = await createFixture({ noTaskFile: true });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.create('new-task', {
      title: 'A brand new task',
    });
    expect(file.slug).toBe('new-task');
    expect(file.status).toBe('plan');
    expect(file.title).toBe('A brand new task');
    expect(file.schema_version).toBe(2);
    expect(file.context.intro).toBeTypeOf('string');
    expect(file.phases).toEqual([]);

    // The file actually landed on disk.
    const onDisk = await fixture.readTaskRaw('new-task');
    expect(onDisk.status).toBe('plan');
  });

  it('rejects DuplicateSlug if a task-file already exists at that slug', async () => {
    fixture = await createFixture({ slug: 'collision' });
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.create('collision', { title: 'Collides' }),
    ).rejects.toBeInstanceOf(DuplicateSlug);
  });
});

describe('task.read', () => {
  it('returns the parsed TaskFile', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.read('sample');
    expect(file.slug).toBe('sample');
    expect(file.phases.length).toBe(2);
    expect(file.phases[0]!.slug).toBe('first');
  });

  it('throws NotFound when the task-file is missing', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.read('does-not-exist')).rejects.toBeInstanceOf(
      NotFound,
    );
  });
});

describe('task.status.set', () => {
  it('transitions plan → drafted', async () => {
    fixture = await createFixture({
      taskYml: `schema_version: 2
slug: sample
status: plan
created: 2026-05-26
title: Sample
context:
  intro: plan-stage task.
phases: []
`,
    });
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.status.set('sample', 'drafted');
    expect(file.status).toBe('drafted');
  });

  it('rejects illegal back-edge build → plan', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    // The fixture seeds status=build. build → plan is illegal
    // (only drafted is allowed as the back-edge).
    await expect(
      ops.task.status.set('sample', 'plan'),
    ).rejects.toBeInstanceOf(InvalidTransition);
  });
});

describe('task.title.set', () => {
  it('updates the title', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.title.set('sample', 'Renamed Title');
    expect(file.title).toBe('Renamed Title');
    const onDisk = await fixture.readTaskRaw();
    expect(onDisk.title).toBe('Renamed Title');
  });
});
