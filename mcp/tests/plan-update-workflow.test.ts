/**
 * Plan-update workflow tests (Phase 10).
 *
 * Drives the factory directly to exercise the four update-mode patterns
 * `/impl-plan` will use when invoked on an existing task-file:
 *   1. discuss-only           — read-only (no mutations)
 *   2. small tweak            — add an AC + append audit entry
 *   3. restructure mid-build  — insert phase between done + in-progress,
 *                               verify done evidence preserved
 *   4. done-phase remove      — force-flag required; without it,
 *                               DonePhaseImmutable
 *   5. status flip-back       — status=refined → drafted via the
 *                               documented back-edge (P1 state-machine
 *                               relaxation)
 *
 * These tests don't load the skill or invoke any agent — they verify
 * the FACTORY surface the skill will call. Skill behavior (AskUser
 * prompts, agent spawning) is exercised via in-product use; the
 * factory primitives this layer drives are what those flows depend on.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { createOps } from '../src/core/factory.js';
import { DonePhaseImmutable } from '../src/core/errors.js';
import { parseAnchoredYml } from '../src/schema/anchored-yml.js';

const ANCHORED_YML = `task:
  phase:
    fields: []
plan: {}
refine: {}
build: {}
wrap: {}
`;

async function makeProject(taskYml: string, slug = 'sample') {
  const root = await mkdtemp(join(tmpdir(), 'anchored-plan-update-'));
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true });
  await writeFile(join(root, 'anchored.yml'), ANCHORED_YML, 'utf-8');
  await writeFile(join(root, '.claude', 'tasks', `${slug}.yml`), taskYml, 'utf-8');
  const config = parseAnchoredYml(yamlParse(ANCHORED_YML));
  const ops = createOps(config, root);
  return {
    root,
    config,
    ops,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
    async readRaw() {
      return await readFile(join(root, '.claude', 'tasks', `${slug}.yml`), 'utf-8');
    },
  };
}

type Project = Awaited<ReturnType<typeof makeProject>>;
let project: Project | null = null;
afterEach(async () => {
  if (project) await project.cleanup();
  project = null;
});

// ─────────────────────────────────────────────────────────────────────
// 1. discuss-only
// ─────────────────────────────────────────────────────────────────────

describe('update-mode: discuss-only', () => {
  it('task.read does not mutate the file on disk', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: drafted
created: 2026-05-26
title: Sample
context:
  intro: discuss test
phases:
  - name: P1
    slug: p1
    status: pending
    acceptance_criteria:
      - text: a
        status: pending
`);
    const before = await project.readRaw();
    const file = await project.ops.task.read('sample');
    const after = await project.readRaw();
    expect(file.slug).toBe('sample');
    expect(after).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. small tweak — add an AC, append audit, status unchanged
// ─────────────────────────────────────────────────────────────────────

describe('update-mode: small tweak (add AC + append audit)', () => {
  it('increments AC count on the pending phase and appends an audit entry', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: drafted
created: 2026-05-26
title: Sample
context:
  intro: tweak test
  plan: |
    - decision: initial plan
phases:
  - name: P1
    slug: p1
    status: pending
    acceptance_criteria:
      - text: original AC
        status: pending
`);
    const beforeFile = await project.ops.task.read('sample');
    const initialAcCount = beforeFile.phases.find((p) => p.slug === 'p1')!.acceptance_criteria
      .length;
    expect(initialAcCount).toBe(1);

    await project.ops.task.phase.ac.add('sample', 'p1', {
      text: 'input is validated',
    });

    const audit = `Updated 2026-05-27: added 'input validation' AC to phase 1`;
    const afterFile = await project.ops.task.context.plan.append('sample', audit);

    const phase = afterFile.phases.find((p) => p.slug === 'p1')!;
    expect(phase.acceptance_criteria.length).toBe(2);
    expect(phase.acceptance_criteria[1]!.text).toBe('input is validated');
    expect(phase.acceptance_criteria[1]!.status).toBe('pending');
    expect(afterFile.status).toBe('drafted'); // unchanged
    expect(afterFile.context.plan).toContain(audit);
    expect(afterFile.context.plan).toContain('initial plan'); // preserved
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. restructure mid-build — insert phase, done evidence preserved
// ─────────────────────────────────────────────────────────────────────

describe('update-mode: restructure on mid-build task', () => {
  it('inserts a new pending phase between done + in-progress, preserves done evidence', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: Sample
context:
  intro: restructure test
  plan: |
    - decision: initial 3-phase shape
phases:
  - name: Done One
    slug: done-one
    status: done
    acceptance_criteria:
      - text: shipped one
        status: done
        evidence:
          - 'src/one.ts:42'
          - 'commit abc123'
  - name: Done Two
    slug: done-two
    status: done
    acceptance_criteria:
      - text: shipped two
        status: done
        evidence:
          - 'src/two.ts:7'
  - name: In Progress
    slug: in-prog
    status: in-progress
    acceptance_criteria:
      - text: doing
        status: pending
  - name: Pending
    slug: pending-one
    status: pending
    acceptance_criteria:
      - text: later
        status: pending
`);

    // Insert a new phase between done-two and in-prog.
    const after = await project.ops.task.phase.add(
      'sample',
      {
        name: 'Inserted Mid',
        slug: 'inserted-mid',
        acceptance_criteria: [{ text: 'new mid-build work', status: 'pending' }],
      },
      { after: 'done-two' },
    );

    // Order is correct.
    expect(after.phases.map((p) => p.slug)).toEqual([
      'done-one',
      'done-two',
      'inserted-mid',
      'in-prog',
      'pending-one',
    ]);

    // Done phases keep their evidence verbatim.
    const doneOne = after.phases.find((p) => p.slug === 'done-one')!;
    expect(doneOne.status).toBe('done');
    expect(doneOne.acceptance_criteria[0]!.evidence).toEqual(['src/one.ts:42', 'commit abc123']);
    const doneTwo = after.phases.find((p) => p.slug === 'done-two')!;
    expect(doneTwo.status).toBe('done');
    expect(doneTwo.acceptance_criteria[0]!.evidence).toEqual(['src/two.ts:7']);

    // New phase is pending with the AC we gave it.
    const inserted = after.phases.find((p) => p.slug === 'inserted-mid')!;
    expect(inserted.status).toBe('pending');
    expect(inserted.acceptance_criteria.length).toBe(1);
    expect(inserted.acceptance_criteria[0]!.text).toBe('new mid-build work');

    // Audit lands in plan.
    const audited = await project.ops.task.context.plan.append(
      'sample',
      'Updated 2026-05-27: inserted new phase between done-two and in-prog',
    );
    expect(audited.context.plan).toContain('inserted new phase');
    expect(audited.context.plan).toContain('initial 3-phase shape');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. done-phase remove — force gate
// ─────────────────────────────────────────────────────────────────────

describe('update-mode: done-phase remove guard', () => {
  it('throws DonePhaseImmutable without force, succeeds with force: true', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: Sample
context:
  intro: done-remove test
phases:
  - name: Done Already
    slug: done-already
    status: done
    acceptance_criteria:
      - text: was proven
        status: done
        evidence:
          - 'commit deadbeef'
  - name: Keep
    slug: keep
    status: pending
    acceptance_criteria:
      - text: later
        status: pending
`);

    // Without force → throws.
    await expect(project.ops.task.phase.remove('sample', 'done-already')).rejects.toBeInstanceOf(
      DonePhaseImmutable,
    );

    // The file is still intact after the rejected remove.
    const stillThere = await project.ops.task.read('sample');
    expect(stillThere.phases.map((p) => p.slug)).toEqual(['done-already', 'keep']);

    // With force → succeeds and phase is gone.
    const removed = await project.ops.task.phase.remove('sample', 'done-already', { force: true });
    expect(removed.phases.map((p) => p.slug)).toEqual(['keep']);
  });

  it('does not require force for pending or in-progress phases', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: Sample
context:
  intro: no-force test
phases:
  - name: Pending
    slug: pending-phase
    status: pending
    acceptance_criteria:
      - text: tbd
        status: pending
  - name: In Progress
    slug: in-prog-phase
    status: in-progress
    acceptance_criteria:
      - text: tbd
        status: pending
  - name: Keep
    slug: keep
    status: pending
    acceptance_criteria:
      - text: tbd
        status: pending
`);

    const afterFirst = await project.ops.task.phase.remove('sample', 'pending-phase');
    expect(afterFirst.phases.map((p) => p.slug)).toEqual(['in-prog-phase', 'keep']);

    const afterSecond = await project.ops.task.phase.remove('sample', 'in-prog-phase');
    expect(afterSecond.phases.map((p) => p.slug)).toEqual(['keep']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. status flip-back — refined → drafted (the documented exception)
// ─────────────────────────────────────────────────────────────────────

describe('update-mode: backward status transition to drafted', () => {
  it('allows refined → drafted (the P1 update-mode back-edge)', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: refined
created: 2026-05-26
title: Sample
context:
  intro: backward-edge test
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: tbd
        status: pending
`);

    const after = await project.ops.task.status.set('sample', 'drafted');
    expect(after.status).toBe('drafted');

    const reread = await project.ops.task.read('sample');
    expect(reread.status).toBe('drafted');
  });

  it('allows build → drafted (mid-build update-mode entry)', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: build
created: 2026-05-26
title: Sample
context:
  intro: backward from build
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: tbd
        status: pending
`);
    const after = await project.ops.task.status.set('sample', 'drafted');
    expect(after.status).toBe('drafted');
  });

  it('allows wrap → drafted', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: wrap
created: 2026-05-26
title: Sample
context:
  intro: backward from wrap
phases:
  - name: P
    slug: p
    status: done
    acceptance_criteria:
      - text: shipped
        status: done
        evidence:
          - 'proof'
`);
    const after = await project.ops.task.status.set('sample', 'drafted');
    expect(after.status).toBe('drafted');
  });

  it('allows done → drafted (re-opening a finished task for update-mode)', async () => {
    project = await makeProject(`schema_version: 2
slug: sample
status: done
created: 2026-05-26
title: Sample
context:
  intro: re-open
phases:
  - name: P
    slug: p
    status: done
    acceptance_criteria:
      - text: shipped
        status: done
        evidence:
          - 'proof'
`);
    const after = await project.ops.task.status.set('sample', 'drafted');
    expect(after.status).toBe('drafted');
  });
});
