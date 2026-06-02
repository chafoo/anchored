/**
 * phase.field.* op tests — schema-driven extension field validation.
 *
 * Covers list (pure config read), set (declared-name + type-coercion +
 * reserved-name guard), and get (declared-name guard + undefined for
 * unset).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { InvalidFieldValue, InvalidFieldType } from '../../src/core/errors.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('phase.field.list', () => {
  it('returns the declared fields from anchored.yml', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const list = ops.task.phase.field.list();
    expect(list).toEqual([
      { name: 'commit', type: 'string' },
      { name: 'coverage_pct', type: 'number' },
      { name: 'pr_ready', type: 'boolean' },
      { name: 'env', type: 'enum' },
    ]);
  });
});

describe('phase.field.set', () => {
  it('sets a declared string field', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.field.set('sample', 'first', 'commit', 'abc1234');
    const phase = file.phases.find((p) => p.slug === 'first')!;
    expect((phase as { commit?: string }).commit).toBe('abc1234');
  });

  it('coerces a numeric-string for a declared number field', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const file = await ops.task.phase.field.set('sample', 'first', 'coverage_pct', '87.3');
    const phase = file.phases.find((p) => p.slug === 'first')!;
    expect((phase as { coverage_pct?: number }).coverage_pct).toBe(87.3);
  });

  it('rejects an out-of-enum value for an enum field', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.phase.field.set('sample', 'first', 'env', 'nope')).rejects.toBeInstanceOf(
      InvalidFieldType,
    );
  });

  it('rejects an undeclared field name (InvalidFieldValue)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.phase.field.set('sample', 'first', 'undeclared', 'x'),
    ).rejects.toBeInstanceOf(InvalidFieldValue);
  });

  it('rejects a reserved field name (status)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.phase.field.set('sample', 'first', 'status', 'done'),
    ).rejects.toBeInstanceOf(InvalidFieldValue);
  });

  it('rejects every other reserved name (name, context, rules, acceptance_criteria, retry_count, executor, slug)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    for (const name of [
      'name',
      'context',
      'rules',
      'acceptance_criteria',
      'retry_count',
      'executor',
      'slug',
    ]) {
      await expect(ops.task.phase.field.set('sample', 'first', name, 'x')).rejects.toBeInstanceOf(
        InvalidFieldValue,
      );
    }
  });
});

describe('phase.field.get', () => {
  it('returns the set value', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.phase.field.set('sample', 'first', 'commit', 'sha');
    const v = await ops.task.phase.field.get('sample', 'first', 'commit');
    expect(v).toBe('sha');
  });

  it('returns undefined when declared but not set', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const v = await ops.task.phase.field.get('sample', 'first', 'commit');
    expect(v).toBeUndefined();
  });

  it('throws InvalidFieldValue for an undeclared field name', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.phase.field.get('sample', 'first', 'undeclared')).rejects.toBeInstanceOf(
      InvalidFieldValue,
    );
  });
});
