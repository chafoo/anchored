/**
 * P11 production-safeguards: phase-slug uniqueness.
 *
 * Two enforcement layers must agree:
 *
 *   1. **Schema layer.** `TaskFile.phases.superRefine` rejects any
 *      parse where two phases share a slug. This catches hand-edits
 *      and migrations that introduce duplicates, and forms the
 *      backstop for the op-layer check (if a buggy op slipped a
 *      duplicate past, the re-validation in `writeTask` would catch
 *      it on the way back to disk).
 *
 *   2. **Op layer.** `phase.add` pre-checks before splicing, so the
 *      error surfaces with `DuplicateSlug` and actionable recovery
 *      suggestions before the disk write happens.
 *
 * Both layers' error messages name the offending slug so a human or
 * agent can act without re-reading the file.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../src/core/factory.js';
import { DuplicateSlug } from '../src/core/errors.js';
import { parseTaskFileYAML } from '../src/parser/parse.js';
import { ParseError } from '../src/parser/parse.js';
import { createFixture, type Fixture } from './core/_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('schema-level phase-slug uniqueness', () => {
  it('rejects a task-file whose phases share the same slug', () => {
    const raw = `schema_version: 2
slug: dup-task
status: plan
created: 2026-05-26
title: Duplicate phases
context:
  intro: This task accidentally has two phases with the same slug.
phases:
  - name: First Pass
    slug: implement
    status: pending
    acceptance_criteria:
      - text: do the thing
        status: pending
  - name: Second Pass
    slug: implement
    status: pending
    acceptance_criteria:
      - text: do it again
        status: pending
`;
    expect(() => parseTaskFileYAML(raw)).toThrow(ParseError);
  });

  it('error message names the offending slug', () => {
    const raw = `schema_version: 2
slug: dup-task
status: plan
created: 2026-05-26
title: Duplicate phases
context:
  intro: x
phases:
  - name: A
    slug: shared
    status: pending
    acceptance_criteria:
      - text: a
        status: pending
  - name: B
    slug: shared
    status: pending
    acceptance_criteria:
      - text: b
        status: pending
`;
    try {
      parseTaskFileYAML(raw);
      throw new Error('expected parse to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/duplicate phase slug "shared"/);
      // Both indices should appear in the message (0 and 1).
      expect(msg).toMatch(/\[0, 1\]/);
    }
  });

  it('accepts a task-file with all distinct phase slugs', () => {
    const raw = `schema_version: 2
slug: ok-task
status: plan
created: 2026-05-26
title: Distinct phases
context:
  intro: x
phases:
  - name: First
    slug: phase-one
    status: pending
    acceptance_criteria:
      - text: a
        status: pending
  - name: Second
    slug: phase-two
    status: pending
    acceptance_criteria:
      - text: b
        status: pending
`;
    expect(() => parseTaskFileYAML(raw)).not.toThrow();
  });

  it('flags three-way duplicate as well (not just pairs)', () => {
    const raw = `schema_version: 2
slug: triple
status: plan
created: 2026-05-26
title: Triple
context:
  intro: x
phases:
  - name: A
    slug: same
    status: pending
    acceptance_criteria: [{text: a, status: pending}]
  - name: B
    slug: same
    status: pending
    acceptance_criteria: [{text: b, status: pending}]
  - name: C
    slug: same
    status: pending
    acceptance_criteria: [{text: c, status: pending}]
`;
    try {
      parseTaskFileYAML(raw);
      throw new Error('expected parse to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/duplicate phase slug "same"/);
      expect(msg).toMatch(/\[0, 1, 2\]/);
    }
  });
});

describe('op-level phase.add slug-uniqueness gate', () => {
  it('throws DuplicateSlug when adding a phase whose slug collides', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.phase.add('sample', { name: 'Dup', slug: 'first' }),
    ).rejects.toBeInstanceOf(DuplicateSlug);
  });

  it('error includes the offending slug + recovery suggestions', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    try {
      await ops.task.phase.add('sample', { name: 'Dup', slug: 'first' });
      throw new Error('expected DuplicateSlug');
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateSlug);
      const e = err as DuplicateSlug;
      expect(e.message).toMatch(/phase slug "first"/);
      expect(e.suggestions.length).toBeGreaterThan(0);
      // At least one suggestion should mention the recovery path.
      const joined = e.suggestions.join('\n');
      expect(joined).toMatch(/different slug|remove the existing phase|anchored phase list/i);
    }
  });

  it('does NOT write the file when add is rejected for duplicate slug', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const before = await fixture.readTaskRaw();
    await expect(
      ops.task.phase.add('sample', { name: 'Dup', slug: 'first' }),
    ).rejects.toBeInstanceOf(DuplicateSlug);
    const after = await fixture.readTaskRaw();
    expect(after.phases.length).toBe(before.phases.length);
    expect(after.phases.map((p) => p.slug)).toEqual(
      before.phases.map((p) => p.slug),
    );
  });
});
