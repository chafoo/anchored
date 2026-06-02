/**
 * P11 production-safeguards: cross-process write locking.
 *
 * `core/io.ts:atomicWrite` acquires a `proper-lockfile` lock on the
 * target path before writing. The lock guarantees:
 *
 *   1. Two writers contending on the same task-file SERIALIZE. Neither
 *      loses; both writes land in some order, and the final file is
 *      the schema-valid result of the later one (no torn state).
 *
 *   2. A writer that finds the lock held retries 3× with 100ms backoff
 *      (~400ms total). If the lock is still held at the end of the
 *      budget, `WriteContention` surfaces with a recovery message.
 *
 *   3. Locks older than 10s with no mtime refresh auto-reclaim — a
 *      crashed prior writer doesn't permanently brick the file.
 *
 * proper-lockfile's behavior under simultaneous-init races can be
 * subtle; these tests use the factory ops layer (which is the actual
 * usage pattern) rather than reaching into proper-lockfile directly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import lockfile from 'proper-lockfile';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createOps } from '../src/core/factory.js';
import { atomicWrite } from '../src/core/io.js';
import { WriteContention } from '../src/core/errors.js';
import { createFixture, type Fixture } from './core/_fixture.js';
import { taskPath } from '../src/core/ops/task.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('atomicWrite cross-process serialization', () => {
  it('two SEQUENTIAL ops on the same task-file both land (no torn state)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);

    // Sequential — each op fully completes (read → mutate → write)
    // before the next begins. This is the recommended pattern; it
    // guarantees both writes apply on top of each other.
    await ops.task.phase.ac.evidence.set('sample', 'first', 0, ['evidence-A']);
    await ops.task.phase.ac.evidence.set('sample', 'first', 1, ['evidence-B']);

    const final = await fixture.readTaskRaw();
    const firstPhase = final.phases.find((p) => p.slug === 'first');
    expect(firstPhase).toBeDefined();
    expect(firstPhase!.acceptance_criteria[0]!.status).toBe('done');
    expect(firstPhase!.acceptance_criteria[0]!.evidence).toEqual(['evidence-A']);
    expect(firstPhase!.acceptance_criteria[1]!.status).toBe('done');
    expect(firstPhase!.acceptance_criteria[1]!.evidence).toEqual(['evidence-B']);
  });

  it('concurrent ops never produce a torn or schema-invalid file', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);

    // Concurrent ops MAY lose updates (RMW race — each op reads
    // independently, then writes; the last-write-wins). The lock
    // does NOT prevent that — it prevents torn FILES (partial
    // writes, mixed bytes from two writers). This test asserts
    // the weaker-but-real guarantee: the resulting file is always
    // a complete, schema-valid task-file.
    //
    // (Callers that need read-modify-write transactions must
    // serialize at the orchestrator level — sequential awaits, not
    // Promise.all. See plugin/references/state-mutations.md.)
    await Promise.all([
      ops.task.phase.ac.evidence.set('sample', 'first', 0, ['A']),
      ops.task.phase.ac.evidence.set('sample', 'second', 0, ['B']),
      ops.task.phase.ac.evidence.set('sample', 'first', 1, ['C']),
      ops.task.phase.ac.evidence.set('sample', 'first', 0, ['D']),
    ]);

    const final = await fixture.readTaskRaw();
    // No torn state: file parses, schema validates, phase structure
    // matches the original (2 phases, with their ACs intact).
    expect(final.schema_version).toBe(2);
    expect(final.phases.length).toBe(2);
    expect(final.phases[0]!.slug).toBe('first');
    expect(final.phases[1]!.slug).toBe('second');
    expect(final.phases[0]!.acceptance_criteria.length).toBe(2);
    expect(final.phases[1]!.acceptance_criteria.length).toBe(1);
  });
});

describe('atomicWrite contention handling', () => {
  it('throws WriteContention when a held lock blocks the retry budget', async () => {
    fixture = await createFixture();
    const path = taskPath(fixture.root, 'sample');
    // Ensure parent exists (atomicWrite mkdirs it; we replicate for
    // the direct proper-lockfile.lock() call below).
    await mkdir(dirname(path), { recursive: true });

    // Acquire the lock directly with a long stale threshold so it
    // won't auto-reclaim during our retry-budget exhaustion.
    const release = await lockfile.lock(path, {
      stale: 60_000, // 60s — well past atomicWrite's 3×100ms retry budget
      realpath: false,
    });

    try {
      // atomicWrite should retry 3 times then give up. 3 × 100ms +
      // overhead ~= 500ms tops; we give the test a generous timeout.
      await expect(atomicWrite(path, 'whatever: value\n')).rejects.toBeInstanceOf(WriteContention);
    } finally {
      await release();
    }
  }, 10_000);

  it('WriteContention error carries recovery suggestions', async () => {
    fixture = await createFixture();
    const path = taskPath(fixture.root, 'sample');
    await mkdir(dirname(path), { recursive: true });
    const release = await lockfile.lock(path, {
      stale: 60_000,
      realpath: false,
    });

    try {
      await atomicWrite(path, 'whatever: value\n');
      throw new Error('expected WriteContention');
    } catch (err) {
      expect(err).toBeInstanceOf(WriteContention);
      const e = err as WriteContention;
      expect(e.message).toMatch(/lock/i);
      expect(e.suggestions.length).toBeGreaterThan(0);
      const joined = e.suggestions.join('\n').toLowerCase();
      // At least one suggestion should mention waiting or another process.
      expect(joined).toMatch(/another anchored process|wait|worktree/i);
    } finally {
      await release();
    }
  }, 10_000);

  it('proceeds normally after a stale lock is reclaimed', async () => {
    fixture = await createFixture();
    const path = taskPath(fixture.root, 'sample');
    await mkdir(dirname(path), { recursive: true });

    // Simulate a stale lock: acquire with the minimum stale threshold
    // (5s — proper-lockfile's hard minimum), then synthetically age
    // the lock's mtime past staleness. The next acquire will reclaim.
    //
    // Using proper-lockfile's lock() with a 5s stale, then we manually
    // backdate the lockfile's mtime to make it appear stale.
    const release = await lockfile.lock(path, {
      stale: 5_000,
      realpath: false,
    });
    // Backdate the lockfile dir's mtime to 30s in the past.
    const { utimes } = await import('node:fs/promises');
    const past = Date.now() / 1000 - 30;
    await utimes(`${path}.lock`, past, past);

    // Now atomicWrite should reclaim the stale lock and succeed.
    // We don't release the original lock — the staleness check
    // should handle it.
    await atomicWrite(
      path,
      'schema_version: 2\nslug: sample\nstatus: plan\ncreated: 2026-05-26\ntitle: T\ncontext:\n  intro: x\nphases: []\n',
    );

    // The file should have been written.
    const { readFile } = await import('node:fs/promises');
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('title: T');

    // Best-effort release of the original handle; it may have been
    // compromised by the reclaim and that's fine.
    try {
      await release();
    } catch {
      // Expected — reclaim invalidates the original release().
    }
  }, 15_000);
});
