/**
 * Sanity tests for the service-layer ops (core + field + validate).
 *
 * Each test sets up a temp directory with a task-file + anchored.yml,
 * runs ops against it, asserts on the file state after.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  taskRead,
  taskStatusSet,
  phaseNextPending,
  phaseStatusSet,
  acList,
  acEvidenceSet,
  contextAppend,
} from '../src/ops/core.js';
import { phaseFieldSet, phaseFieldGet, UnknownField } from '../src/ops/field.js';
import {
  InvalidTransition,
  InvalidEvidence,
  OutOfRange,
  InvalidFieldType,
} from '../src/ops/validate.js';

const SAMPLE_TASK = `---
slug: test-task
status: build
created: 2026-05-25
---

# Test Task

## Context
A small task for ops testing.

## Phases

### First Phase
<!-- id: first-phase -->
- status: pending
- acceptance_criteria:
  - implement the thing
    evidence: —
  - test the thing
    evidence: —

### Second Phase
<!-- id: second-phase -->
- status: pending
- acceptance_criteria:
  - do part two
    evidence: —
`;

const SAMPLE_ANCHORED_YML = `task:
  phase:
    fields:
      - name: commit
        type: string
      - name: coverage_pct
        type: number
plan: {}
build: {}
wrap: {}
`;

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'anchored-test-'));
  await mkdir(join(projectRoot, '.claude', 'tasks'), { recursive: true });
  await writeFile(
    join(projectRoot, '.claude', 'tasks', 'test-task.md'),
    SAMPLE_TASK,
    'utf-8',
  );
  await writeFile(
    join(projectRoot, 'anchored.yml'),
    SAMPLE_ANCHORED_YML,
    'utf-8',
  );
});

afterEach(async () => {
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

describe('taskRead', () => {
  it('returns the parsed task-file', async () => {
    const file = await taskRead(projectRoot, 'test-task');
    expect(file.frontmatter.slug).toBe('test-task');
    expect(file.frontmatter.status).toBe('build');
    expect(file.phases).toHaveLength(2);
  });
});

describe('taskStatusSet', () => {
  it('transitions build → wrap', async () => {
    const file = await taskStatusSet(projectRoot, 'test-task', 'wrap');
    expect(file.frontmatter.status).toBe('wrap');
    const reread = await taskRead(projectRoot, 'test-task');
    expect(reread.frontmatter.status).toBe('wrap');
  });

  it('rejects illegal transition build → done', async () => {
    await expect(
      taskStatusSet(projectRoot, 'test-task', 'done'),
    ).rejects.toThrow(InvalidTransition);
  });

  it('rejects illegal back-transition build → plan', async () => {
    await expect(
      taskStatusSet(projectRoot, 'test-task', 'plan'),
    ).rejects.toThrow(InvalidTransition);
  });
});

describe('phaseNextPending', () => {
  it('returns the first pending phase', async () => {
    const phase = await phaseNextPending(projectRoot, 'test-task');
    expect(phase?.slug).toBe('first-phase');
  });

  it('returns null when no pending phases', async () => {
    await phaseStatusSet(projectRoot, 'test-task', 'first-phase', 'in-progress');
    await phaseStatusSet(projectRoot, 'test-task', 'first-phase', 'done');
    await phaseStatusSet(projectRoot, 'test-task', 'second-phase', 'in-progress');
    await phaseStatusSet(projectRoot, 'test-task', 'second-phase', 'deferred');
    const phase = await phaseNextPending(projectRoot, 'test-task');
    expect(phase).toBeNull();
  });

  it('prefers in-progress over pending (resume-safety)', async () => {
    await phaseStatusSet(projectRoot, 'test-task', 'second-phase', 'in-progress');
    // first-phase is still pending; second-phase is in-progress
    const phase = await phaseNextPending(projectRoot, 'test-task');
    expect(phase?.slug).toBe('second-phase');
  });
});

describe('phaseStatusSet', () => {
  it('transitions pending → in-progress', async () => {
    const file = await phaseStatusSet(
      projectRoot,
      'test-task',
      'first-phase',
      'in-progress',
    );
    expect(file.phases[0]!.status).toBe('in-progress');
  });

  it('rejects illegal direct pending → done', async () => {
    await expect(
      phaseStatusSet(projectRoot, 'test-task', 'first-phase', 'done'),
    ).rejects.toThrow(InvalidTransition);
  });

  it('allows blocked → in-progress retry', async () => {
    await phaseStatusSet(projectRoot, 'test-task', 'first-phase', 'in-progress');
    await phaseStatusSet(projectRoot, 'test-task', 'first-phase', 'blocked');
    const file = await phaseStatusSet(
      projectRoot,
      'test-task',
      'first-phase',
      'in-progress',
    );
    expect(file.phases[0]!.status).toBe('in-progress');
  });
});

describe('acList + acEvidenceSet', () => {
  it('lists initial ACs with em-dash evidence', async () => {
    const acs = await acList(projectRoot, 'test-task', 'first-phase');
    expect(acs).toHaveLength(2);
    expect(acs[0]!.evidence).toBe('—');
  });

  it('sets evidence and round-trips', async () => {
    await acEvidenceSet(
      projectRoot,
      'test-task',
      'first-phase',
      0,
      'src/foo.ts:42 — implementation added',
    );
    const acs = await acList(projectRoot, 'test-task', 'first-phase');
    expect(acs[0]!.evidence).toContain('src/foo.ts:42');
  });

  it('rejects empty evidence', async () => {
    await expect(
      acEvidenceSet(projectRoot, 'test-task', 'first-phase', 0, ''),
    ).rejects.toThrow(InvalidEvidence);
    await expect(
      acEvidenceSet(projectRoot, 'test-task', 'first-phase', 0, '—'),
    ).rejects.toThrow(InvalidEvidence);
  });

  it('rejects out-of-range ac_index', async () => {
    await expect(
      acEvidenceSet(projectRoot, 'test-task', 'first-phase', 99, 'something'),
    ).rejects.toThrow(OutOfRange);
  });
});

describe('contextAppend', () => {
  it('writes to ### Plan (no subsection)', async () => {
    await contextAppend(
      projectRoot,
      'test-task',
      'Plan',
      null,
      '- new decision noted mid-plan',
    );
    const file = await taskRead(projectRoot, 'test-task');
    expect(file.context.plan).toContain('new decision noted mid-plan');
  });

  it('writes to ### Build → #### Implement (H4 sub-section)', async () => {
    await contextAppend(
      projectRoot,
      'test-task',
      'Build',
      'Implement',
      '- first-phase / First Phase\n  switched libraries mid-flight',
    );
    const file = await taskRead(projectRoot, 'test-task');
    expect(file.context.build['Implement']).toContain('switched libraries');
  });

  it('creates ### Wrap on-demand with intro prose', async () => {
    await contextAppend(
      projectRoot,
      'test-task',
      'Wrap',
      null,
      '## Wrap-up summary\n\nShipped 2 phases done.',
    );
    const file = await taskRead(projectRoot, 'test-task');
    expect(file.context.wrap?.intro).toContain('Shipped 2 phases');
  });

  it('rejects Plan section with subsection', async () => {
    await expect(
      contextAppend(projectRoot, 'test-task', 'Plan', 'NotAllowed', 'oops'),
    ).rejects.toThrow();
  });

  it('rejects Build section without subsection', async () => {
    await expect(
      contextAppend(projectRoot, 'test-task', 'Build', null, 'oops'),
    ).rejects.toThrow();
  });
});

describe('phaseFieldSet + phaseFieldGet', () => {
  it('sets a declared string field', async () => {
    const file = await phaseFieldSet(
      projectRoot,
      'test-task',
      'first-phase',
      'commit',
      'abc1234',
    );
    expect(file.phases[0]!.extensions['commit']).toBe('abc1234');
    const got = await phaseFieldGet(projectRoot, 'test-task', 'first-phase', 'commit');
    expect(got).toBe('abc1234');
  });

  it('sets a declared number field, coercing from string', async () => {
    const file = await phaseFieldSet(
      projectRoot,
      'test-task',
      'first-phase',
      'coverage_pct',
      '87.3',
    );
    expect(file.phases[0]!.extensions['coverage_pct']).toBe(87.3);
  });

  it('rejects undeclared field', async () => {
    await expect(
      phaseFieldSet(
        projectRoot,
        'test-task',
        'first-phase',
        'not_declared',
        'whatever',
      ),
    ).rejects.toThrow(UnknownField);
  });

  it('rejects wrong type for declared field', async () => {
    await expect(
      phaseFieldSet(
        projectRoot,
        'test-task',
        'first-phase',
        'coverage_pct',
        'not-a-number',
      ),
    ).rejects.toThrow(InvalidFieldType);
  });

  it('returns null for unset field', async () => {
    const got = await phaseFieldGet(
      projectRoot,
      'test-task',
      'first-phase',
      'commit',
    );
    expect(got).toBeNull();
  });

  it('persists field through round-trip', async () => {
    await phaseFieldSet(
      projectRoot,
      'test-task',
      'first-phase',
      'commit',
      'abc1234',
    );
    const raw = await readFile(
      join(projectRoot, '.claude', 'tasks', 'test-task.md'),
      'utf-8',
    );
    expect(raw).toContain('- commit: abc1234');
  });
});
