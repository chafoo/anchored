/**
 * Tests for the V0.2 6-state task-status transition machine.
 *
 * The forward pipeline is:
 *
 *   plan → drafted → refined → build → wrap → done
 *
 * Plus two compulsory back-edges:
 *   - drafted → build       (shortcut: skip refine — orchestrator warns)
 *   - {refined,build,wrap,done} → drafted  (update-mode: revise scope mid-flight)
 *
 * Every other transition is illegal — the validator throws
 * `InvalidTransition` so the caller can surface a clear recovery hint.
 */

import { describe, it, expect } from 'vitest';
import { assertTaskTransition, InvalidTransition } from '../src/ops/validate.js';
import type { TaskStatus } from '../src/schema/task-file.js';

type TaskStatus = TaskStatus;

const ALL_STATES: TaskStatus[] = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done'];

// ─────────────────────────────────────────────────────────────────────
// Forward pipeline — every adjacent step is legal
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — forward pipeline', () => {
  it('plan → drafted is legal', () => {
    expect(() => assertTaskTransition('plan', 'drafted')).not.toThrow();
  });

  it('drafted → refined is legal', () => {
    expect(() => assertTaskTransition('drafted', 'refined')).not.toThrow();
  });

  it('refined → build is legal', () => {
    expect(() => assertTaskTransition('refined', 'build')).not.toThrow();
  });

  it('build → wrap is legal', () => {
    expect(() => assertTaskTransition('build', 'wrap')).not.toThrow();
  });

  it('wrap → done is legal', () => {
    expect(() => assertTaskTransition('wrap', 'done')).not.toThrow();
  });

  it('full pipeline (each step in sequence) is legal', () => {
    // The validator is per-step — we just need every adjacent pair to succeed.
    const pipeline: TaskStatus[] = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done'];
    for (let i = 0; i < pipeline.length - 1; i++) {
      expect(() => assertTaskTransition(pipeline[i]!, pipeline[i + 1]!)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Shortcut: drafted → build (skip refine)
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — drafted → build shortcut', () => {
  it('drafted → build is legal (skip-refine path)', () => {
    expect(() => assertTaskTransition('drafted', 'build')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Idempotent self-transitions
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — idempotent self-transitions', () => {
  it.each(ALL_STATES)('%s → %s (self) is legal (no-op)', (s) => {
    expect(() => assertTaskTransition(s, s)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Update-mode: back-edge to drafted from any forward state
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — update-mode back-edge to drafted', () => {
  it('refined → drafted is legal (update-mode)', () => {
    expect(() => assertTaskTransition('refined', 'drafted')).not.toThrow();
  });

  it('build → drafted is legal (update-mode)', () => {
    expect(() => assertTaskTransition('build', 'drafted')).not.toThrow();
  });

  it('wrap → drafted is legal (update-mode)', () => {
    expect(() => assertTaskTransition('wrap', 'drafted')).not.toThrow();
  });

  it('done → drafted is legal (update-mode)', () => {
    expect(() => assertTaskTransition('done', 'drafted')).not.toThrow();
  });

  it('plan → drafted is legal (already part of forward pipeline)', () => {
    expect(() => assertTaskTransition('plan', 'drafted')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Illegal back-edges to non-drafted states
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — illegal back-edges', () => {
  const illegalBackward: [TaskStatus, TaskStatus][] = [
    ['drafted', 'plan'],
    ['refined', 'plan'],
    ['build', 'plan'],
    ['build', 'refined'],
    ['wrap', 'plan'],
    ['wrap', 'refined'],
    ['wrap', 'build'],
    ['done', 'plan'],
    ['done', 'refined'],
    ['done', 'build'],
    ['done', 'wrap'],
  ];

  it.each(illegalBackward)('%s → %s throws InvalidTransition', (from, to) => {
    expect(() => assertTaskTransition(from, to)).toThrow(InvalidTransition);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Illegal skip-forward (only drafted → build is allowed as a skip)
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — illegal skip-forward', () => {
  const illegalSkip: [TaskStatus, TaskStatus][] = [
    ['plan', 'refined'],
    ['plan', 'build'],
    ['plan', 'wrap'],
    ['plan', 'done'],
    ['drafted', 'wrap'],
    ['drafted', 'done'],
    ['refined', 'wrap'],
    ['refined', 'done'],
    ['build', 'done'],
  ];

  it.each(illegalSkip)('%s → %s throws InvalidTransition', (from, to) => {
    expect(() => assertTaskTransition(from, to)).toThrow(InvalidTransition);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Error message content — surfaces legal next states + update-mode hint
// ─────────────────────────────────────────────────────────────────────

describe('task transitions — error messages help recovery', () => {
  it('illegal transition error includes legal next states', () => {
    try {
      assertTaskTransition('refined', 'plan');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransition);
      const e = err as InvalidTransition;
      // Message must mention refined's legal next states (build, drafted)
      expect(e.message).toContain('refined');
      expect(e.message).toContain('plan');
      expect(e.message).toMatch(/build/);
      expect(e.message).toMatch(/drafted/);
    }
  });

  it('illegal transition surfaces forward-advance suggestion', () => {
    try {
      assertTaskTransition('build', 'done');
      expect.fail('expected throw');
    } catch (err) {
      const e = err as InvalidTransition;
      // suggestions should reference the forward next-state (wrap)
      const text = e.suggestions.join(' ').toLowerCase();
      expect(text).toContain('wrap');
    }
  });

  it('illegal transition surfaces update-mode hint when drafted is a back-edge option', () => {
    try {
      assertTaskTransition('build', 'plan');
      expect.fail('expected throw');
    } catch (err) {
      const e = err as InvalidTransition;
      const text = e.suggestions.join(' ').toLowerCase();
      // build's legal back-edge is drafted → suggestion should mention update-mode
      expect(text).toMatch(/update[- ]mode|drafted/);
    }
  });
});
