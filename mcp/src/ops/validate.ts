/**
 * State-machine validation for status transitions and field-type
 * conformance.
 *
 * The service-layer calls these BEFORE mutating + persisting. Illegal
 * mutations throw typed errors; callers (CLI commands, MCP tools)
 * catch and surface to the user without writing partial state.
 */

import type { TaskStatus, PhaseStatus } from '../schema/task-file.js';
import type { PhaseFieldDecl, PhaseFieldType } from '../schema/anchored-yml.js';

// ─────────────────────────────────────────────────────────────────────
// Task-status state machine
// ─────────────────────────────────────────────────────────────────────

/**
 * Legal transitions for the task-level `status` field.
 *
 * Forward-only in V0.2: plan → build → wrap → done. No back-edges.
 * Idempotent stay-in-place transitions (X → X) are allowed (no-op).
 * To "reset" a task, the user edits the file directly — there's no
 * service-layer op for it.
 */
const TASK_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  plan:  new Set<TaskStatus>(['plan', 'build']),
  build: new Set<TaskStatus>(['build', 'wrap']),
  wrap:  new Set<TaskStatus>(['wrap', 'done']),
  done:  new Set<TaskStatus>(['done']),
};

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from].has(to)) {
    throw new InvalidTransition(
      `task status: cannot transition ${from} → ${to}. ` +
        `Legal from ${from}: ${[...TASK_TRANSITIONS[from]].join(', ')}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Phase-status state machine
// ─────────────────────────────────────────────────────────────────────

/**
 * Legal transitions for per-phase `status` field.
 *
 *   pending     → in-progress | deferred
 *   in-progress → done | blocked | deferred
 *   blocked     → pending | in-progress      (retry path)
 *   done        → terminal (no transitions)
 *   deferred    → terminal (no transitions)
 *
 * The retry path on `blocked` is what lets users unblock a phase
 * (e.g. after fixing an external dep, or editing the file to clear
 * evidence and reset).
 */
const PHASE_TRANSITIONS: Record<PhaseStatus, ReadonlySet<PhaseStatus>> = {
  pending:        new Set<PhaseStatus>(['pending', 'in-progress', 'deferred']),
  'in-progress':  new Set<PhaseStatus>(['in-progress', 'done', 'blocked', 'deferred']),
  blocked:        new Set<PhaseStatus>(['blocked', 'pending', 'in-progress']),
  done:           new Set<PhaseStatus>(['done']),
  deferred:       new Set<PhaseStatus>(['deferred']),
};

export function assertPhaseTransition(from: PhaseStatus, to: PhaseStatus): void {
  if (!PHASE_TRANSITIONS[from].has(to)) {
    throw new InvalidTransition(
      `phase status: cannot transition ${from} → ${to}. ` +
        `Legal from ${from}: ${[...PHASE_TRANSITIONS[from]].join(', ')}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Field-type validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate that `value` matches the declared field type. Returns
 * the coerced value (e.g. numeric strings → numbers) when sensible,
 * or throws InvalidFieldType.
 *
 * Used by field.set ops before persisting user-declared extension
 * field values to the task-file.
 */
export function coerceFieldValue(decl: PhaseFieldDecl, value: unknown): unknown {
  switch (decl.type) {
    case 'string':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      throw new InvalidFieldType(
        `field ${decl.name}: expected string, got ${typeof value}`,
      );

    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      throw new InvalidFieldType(
        `field ${decl.name}: expected number, got "${value}" (${typeof value})`,
      );
    }

    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new InvalidFieldType(
        `field ${decl.name}: expected boolean, got "${value}"`,
      );
    }

    case 'enum': {
      const allowed = decl.values ?? [];
      const s = String(value);
      if (allowed.includes(s)) return s;
      throw new InvalidFieldType(
        `field ${decl.name}: expected one of [${allowed.join(', ')}], got "${s}"`,
      );
    }

    default:
      assertExhaustive(decl.type);
  }
}

// ─────────────────────────────────────────────────────────────────────
// AC-index range validation
// ─────────────────────────────────────────────────────────────────────

export function assertAcIndexInRange(acCount: number, acIndex: number): void {
  if (!Number.isInteger(acIndex) || acIndex < 0 || acIndex >= acCount) {
    throw new OutOfRange(
      `ac_index ${acIndex} out of range (phase has ${acCount} acceptance_criteria, valid 0..${acCount - 1})`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Evidence non-empty validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Evidence cannot be empty, whitespace-only, or the em-dash sentinel.
 * Setting evidence is supposed to signal completion — empty values
 * defeat the USP. If the caller wants to "clear" evidence, they
 * should be using a different op (e.g., resetting the phase).
 */
export function assertEvidenceNonEmpty(evidence: string): void {
  const trimmed = evidence.trim();
  if (trimmed === '' || trimmed === '—') {
    throw new InvalidEvidence(
      `evidence cannot be empty or "—". Provide a concrete reference ` +
        `(file:line, command + outcome, test name + result, commit SHA).`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────

export class InvalidTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransition';
  }
}

export class InvalidFieldType extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFieldType';
  }
}

export class OutOfRange extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfRange';
  }
}

export class InvalidEvidence extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEvidence';
  }
}

export class NotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFound';
  }
}

// ─────────────────────────────────────────────────────────────────────
// utility
// ─────────────────────────────────────────────────────────────────────

function assertExhaustive(_: never): never {
  throw new Error('exhaustive switch missed a case');
}

// Re-export PhaseFieldType for convenience
export type { PhaseFieldType };
