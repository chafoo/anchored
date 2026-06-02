/**
 * Factory shape + surface contract tests.
 *
 * Two layers of assertion:
 *   1. Type-level: TaskOps shape compiles — TypeScript catches the
 *      structural drift on the first `tsc --noEmit`.
 *   2. Runtime: every documented op path exists as a function on the
 *      returned object. Catches the "I wired it up at the type layer
 *      but forgot to add the factory branch" bug.
 *
 * The list of paths below is the documented 32-op surface from the
 * Phase 2 spec. If you add an op, add it here too — this test is the
 * compile-time-style guard for the surface.
 */

import { describe, it, expect } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { parseAnchoredYml } from '../../src/schema/anchored-yml.js';

const EMPTY_CONFIG = parseAnchoredYml({});

describe('createOps factory', () => {
  const ops = createOps(EMPTY_CONFIG, '/tmp/anchored-fixture');

  it('accepts a config + root and returns a TaskOps object', () => {
    expect(ops).toBeTypeOf('object');
    expect(ops.task).toBeTypeOf('object');
  });

  const PATHS: { path: string; getter: (ops: ReturnType<typeof createOps>) => unknown }[] = [
    // task — 4 ops
    { path: 'task.create', getter: (o) => o.task.create },
    { path: 'task.read', getter: (o) => o.task.read },
    { path: 'task.status.set', getter: (o) => o.task.status.set },
    { path: 'task.title.set', getter: (o) => o.task.title.set },

    // task.context — 8 ops (intro, plan.append, plan.refinement.resolve,
    // build.subsection (factory), wrap.intro.set, wrap.subsection (factory))
    { path: 'task.context.intro.set', getter: (o) => o.task.context.intro.set },
    { path: 'task.context.plan.append', getter: (o) => o.task.context.plan.append },
    {
      path: 'task.context.plan.refinement.resolve',
      getter: (o) => o.task.context.plan.refinement.resolve,
    },
    { path: 'task.context.build.subsection', getter: (o) => o.task.context.build.subsection },
    {
      path: 'task.context.build.subsection(X).append',
      getter: (o) => o.task.context.build.subsection('X').append,
    },
    {
      path: 'task.context.build.subsection(X).set',
      getter: (o) => o.task.context.build.subsection('X').set,
    },
    { path: 'task.context.wrap.intro.set', getter: (o) => o.task.context.wrap.intro.set },
    { path: 'task.context.wrap.subsection', getter: (o) => o.task.context.wrap.subsection },
    {
      path: 'task.context.wrap.subsection(X).append',
      getter: (o) => o.task.context.wrap.subsection('X').append,
    },
    {
      path: 'task.context.wrap.subsection(X).set',
      getter: (o) => o.task.context.wrap.subsection('X').set,
    },

    // task.phase — list / next / add / remove / move
    { path: 'task.phase.list', getter: (o) => o.task.phase.list },
    { path: 'task.phase.next', getter: (o) => o.task.phase.next },
    { path: 'task.phase.add', getter: (o) => o.task.phase.add },
    { path: 'task.phase.remove', getter: (o) => o.task.phase.remove },
    { path: 'task.phase.move', getter: (o) => o.task.phase.move },

    // task.phase scalar mutators
    { path: 'task.phase.status.set', getter: (o) => o.task.phase.status.set },
    { path: 'task.phase.executor.set', getter: (o) => o.task.phase.executor.set },
    { path: 'task.phase.name.set', getter: (o) => o.task.phase.name.set },
    { path: 'task.phase.context.set', getter: (o) => o.task.phase.context.set },

    // task.phase.rules — 3 ops
    { path: 'task.phase.rules.set', getter: (o) => o.task.phase.rules.set },
    { path: 'task.phase.rules.add', getter: (o) => o.task.phase.rules.add },
    { path: 'task.phase.rules.remove', getter: (o) => o.task.phase.rules.remove },

    // task.phase.retry_count
    { path: 'task.phase.retry_count.increment', getter: (o) => o.task.phase.retry_count.increment },

    // task.phase.ac — 9 ops (add, remove, text.set, evidence.set,
    // evidence.add, failures.set, failures.clear, status.set)
    { path: 'task.phase.ac.add', getter: (o) => o.task.phase.ac.add },
    { path: 'task.phase.ac.remove', getter: (o) => o.task.phase.ac.remove },
    { path: 'task.phase.ac.text.set', getter: (o) => o.task.phase.ac.text.set },
    { path: 'task.phase.ac.evidence.set', getter: (o) => o.task.phase.ac.evidence.set },
    { path: 'task.phase.ac.evidence.add', getter: (o) => o.task.phase.ac.evidence.add },
    { path: 'task.phase.ac.failures.set', getter: (o) => o.task.phase.ac.failures.set },
    { path: 'task.phase.ac.failures.clear', getter: (o) => o.task.phase.ac.failures.clear },
    { path: 'task.phase.ac.status.set', getter: (o) => o.task.phase.ac.status.set },

    // task.phase.field — 3 ops
    { path: 'task.phase.field.list', getter: (o) => o.task.phase.field.list },
    { path: 'task.phase.field.set', getter: (o) => o.task.phase.field.set },
    { path: 'task.phase.field.get', getter: (o) => o.task.phase.field.get },
  ];

  for (const { path, getter } of PATHS) {
    it(`exposes ${path}`, () => {
      const op = getter(ops);
      expect(op, `expected ${path} to be defined`).toBeTypeOf('function');
    });
  }

  it('exposes at least the 32 documented op paths', () => {
    expect(PATHS.length).toBeGreaterThanOrEqual(32);
  });
});
