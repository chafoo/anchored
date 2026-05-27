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

// Re-export from this module for convenience — historical callers
// import these types from `validate.js`.
export type { TaskStatus, PhaseStatus };

// ─────────────────────────────────────────────────────────────────────
// Task-status state machine
// ─────────────────────────────────────────────────────────────────────

/**
 * Legal transitions for the task-level `status` field — V0.2 6-state machine.
 *
 * Forward pipeline:
 *
 *   plan → drafted → refined → build → wrap → done
 *
 * Allowed shortcut:
 *
 *   drafted → build   skip refinement (orchestrator must warn the user)
 *
 * Update-mode back-edge — any forward state may step back to `drafted`
 * so the user can revise scope/ACs/context mid-flight:
 *
 *   refined → drafted | build → drafted | wrap → drafted | done → drafted
 *
 * Idempotent self-transitions (X → X) are allowed as no-ops.
 * No other back-edges are legal — they'd skip required gates.
 */
const TASK_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  plan:    new Set<TaskStatus>(['plan', 'drafted']),
  drafted: new Set<TaskStatus>(['drafted', 'refined', 'build']),
  refined: new Set<TaskStatus>(['refined', 'build', 'drafted']),
  build:   new Set<TaskStatus>(['build', 'wrap', 'drafted']),
  wrap:    new Set<TaskStatus>(['wrap', 'done', 'drafted']),
  done:    new Set<TaskStatus>(['done', 'drafted']),
};

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from].has(to)) {
    const legal = [...TASK_TRANSITIONS[from]].filter((s) => s !== from);
    const suggestions: string[] = [];
    if (legal.length > 0) {
      suggestions.push(
        `Use one of the legal next states: ${legal.join(', ')}.`,
      );
      const forward = legal.find((s) => s !== 'drafted');
      if (forward !== undefined) {
        suggestions.push(
          `Run \`anchored task status set <slug> ${forward}\` to advance forward.`,
        );
      }
      if (legal.includes('drafted')) {
        suggestions.push(
          `To enter update-mode and revise scope, transition back to "drafted" first.`,
        );
      }
    } else {
      suggestions.push(
        `Status "${from}" is terminal — no further transitions allowed.`,
      );
    }
    throw new InvalidTransition(
      `task status: cannot transition ${from} → ${to}. ` +
        `Legal from ${from}: ${[...TASK_TRANSITIONS[from]].join(', ')}`,
      suggestions,
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
    const legal = [...PHASE_TRANSITIONS[from]].filter((s) => s !== from);
    const suggestions: string[] = [];
    if (legal.length > 0) {
      suggestions.push(`Legal next phase states: ${legal.join(', ')}.`);
      // Suggest the most useful concrete CLI command for common stuck states
      if (from === 'pending') {
        suggestions.push(
          `Run \`anchored phase status set <slug> <phase> in-progress\` to start work.`,
        );
      } else if (from === 'in-progress') {
        suggestions.push(
          `Fill evidence + use \`anchored phase status set <slug> <phase> done\`, or transition to blocked/deferred to park.`,
        );
      } else if (from === 'blocked') {
        suggestions.push(
          `Retry via \`anchored phase status set <slug> <phase> in-progress\` once unblocked.`,
        );
      }
    } else {
      suggestions.push(
        `Phase status "${from}" is terminal — no further transitions allowed.`,
      );
    }
    throw new InvalidTransition(
      `phase status: cannot transition ${from} → ${to}. ` +
        `Legal from ${from}: ${[...PHASE_TRANSITIONS[from]].join(', ')}`,
      suggestions,
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
        [
          `Pass a string value (or a coercible primitive like number/boolean).`,
          `Edit anchored.yml if the field should be a different type.`,
        ],
      );

    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      throw new InvalidFieldType(
        `field ${decl.name}: expected number, got "${value}" (${typeof value})`,
        [
          `Pass a finite number or a numeric string (e.g. "87.3").`,
          `Edit anchored.yml if the field should be a different type.`,
        ],
      );
    }

    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new InvalidFieldType(
        `field ${decl.name}: expected boolean, got "${value}"`,
        [
          `Pass true, false, "true", or "false".`,
          `Edit anchored.yml if the field should be a different type.`,
        ],
      );
    }

    case 'enum': {
      const allowed = decl.values ?? [];
      const s = String(value);
      if (allowed.includes(s)) return s;
      throw new InvalidFieldType(
        `field ${decl.name}: expected one of [${allowed.join(', ')}], got "${s}"`,
        [
          `Pass one of the allowed values: ${allowed.join(', ')}.`,
          `Edit anchored.yml.task.phase.fields if the enum should change.`,
        ],
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
    const validRange =
      acCount === 0 ? 'none — phase has 0 ACs' : `0..${acCount - 1}`;
    throw new OutOfRange(
      `ac_index ${acIndex} out of range (phase has ${acCount} acceptance_criteria, valid ${validRange})`,
      [
        `Use \`anchored ac list <slug> <phase>\` to see the actual AC indices for this phase.`,
        acCount === 0
          ? `The phase has no acceptance_criteria — add at least one before setting evidence.`
          : `Pass an index between 0 and ${acCount - 1} (inclusive).`,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Evidence non-empty validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Reject an AC evidence array that's empty or contains empty /
 * whitespace-only / em-dash-sentinel elements. AC evidence in V0.2
 * is a `string[]`, with each element being one concrete proof bullet
 * (file:line, command + outcome, test name + result, commit SHA, etc.).
 *
 * Used by the `ac.evidence.set` op before persisting, and by the
 * `phase.status.set('done')` gate when scanning a phase's ACs.
 */
export function assertEvidenceArrayNonEmpty(evidence: string[]): void {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new InvalidEvidence(
      `evidence must be a non-empty array of concrete proof strings.`,
      [
        `Pass at least one evidence string (file:line, command + outcome, etc.).`,
        `If the AC genuinely can't be satisfied yet, transition the phase to blocked or deferred instead.`,
      ],
    );
  }
  for (let i = 0; i < evidence.length; i++) {
    const item = evidence[i];
    if (typeof item !== 'string' || item.trim() === '' || item.trim() === '—') {
      throw new InvalidEvidence(
        `evidence[${i}] is empty, whitespace-only, or the legacy '—' sentinel. ` +
          `Every element must be a concrete proof string.`,
        [
          `Replace the empty / sentinel entry with a real reference (file:line, command + outcome, commit SHA, etc.).`,
          `Remove the entry if it was a placeholder — the array can shrink as long as it stays non-empty.`,
        ],
      );
    }
  }
}

/**
 * Pure predicate: does this evidence value count as "filled"?
 * Non-throwing counterpart to the assert helpers.
 *
 * Accepts the shapes that exist on disk:
 *
 *   - `string[]` — AC evidence: filled iff non-empty AND every
 *     element is non-empty, non-whitespace, and not the legacy `'—'`.
 *   - `string` — single-line evidence fallback: filled iff non-empty,
 *     non-whitespace, and not `'—'`.
 *   - `null` / `undefined` → unfilled.
 *
 * Used by `phase.status.set("done")` enforcement to scan all ACs in
 * the phase and refuse the transition if any are unfilled — this is
 * how anchored prevents agents from marking phases done without
 * concrete proof per criterion.
 */
export function isEvidenceFilled(evidence: unknown): boolean {
  if (evidence == null) return false;
  if (Array.isArray(evidence)) {
    if (evidence.length === 0) return false;
    return evidence.every(
      (e) => typeof e === 'string' && e.trim() !== '' && e.trim() !== '—',
    );
  }
  if (typeof evidence !== 'string') return false;
  const trimmed = evidence.trim();
  return trimmed !== '' && trimmed !== '—';
}

// ─────────────────────────────────────────────────────────────────────
// Errors — every typed error carries an actionable `suggestions: string[]`
// ─────────────────────────────────────────────────────────────────────

/**
 * Base class for service-layer errors. Carries a `suggestions` array
 * with 1-3 concrete recovery actions (CLI commands, MCP-tool calls,
 * or short steps). CLI prints them as a bulleted list under the
 * error message; MCP tools surface them in error.data.suggestions so
 * agents can read them programmatically.
 */
export class AnchoredError extends Error {
  public readonly suggestions: string[];

  constructor(message: string, suggestions: string[] = []) {
    super(message);
    this.name = 'AnchoredError';
    this.suggestions = suggestions;
  }
}

export class InvalidTransition extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'InvalidTransition';
  }
}

export class InvalidFieldType extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'InvalidFieldType';
  }
}

export class OutOfRange extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'OutOfRange';
  }
}

export class InvalidEvidence extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'InvalidEvidence';
  }
}

export class NotFound extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'NotFound';
  }
}

/**
 * Thrown by `phase.status.set("done")` when one or more acceptance
 * criteria still have empty evidence. This enforces anchored's USP:
 * a phase can't be marked done unless every AC has a concrete proof
 * string. The agent or orchestrator must either fill the missing
 * evidence (via ac.evidence.set) or transition to blocked/deferred.
 */
export class IncompleteEvidence extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'IncompleteEvidence';
  }
}

/**
 * Thrown by `task.status.set("wrap")` when one or more phases are
 * still in pending or in-progress state. The build skill must drive
 * every phase to a terminal state (done | blocked | deferred) before
 * the task can transition to wrap. Prevents premature wrap-up.
 */
export class IncompletePhases extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'IncompletePhases';
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
