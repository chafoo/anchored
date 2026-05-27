/**
 * Typed errors for the v2 factory ops layer.
 *
 * Re-exports the state-machine + validation errors from
 * `../ops/validate.js` so callers (CLI commands, MCP tools) only need
 * to import from one place — `src/core/errors.js` — when they want to
 * catch ops-layer failures. The re-export bundle is the public error
 * surface for the factory.
 *
 * The classes defined locally here are the ones specific to the
 * factory layer: file-level concerns (DuplicateSlug, NotFound for
 * task/phase lookup), AC-level completeness (IncompletePhase — a phase
 * marked done with pending ACs), and a few smaller ones. Each error
 * carries a `suggestions: string[]` with 1-3 actionable next steps the
 * CLI surfaces and MCP tools embed in error.data.suggestions.
 */

import { AnchoredError } from '../ops/validate.js';

export {
  AnchoredError,
  InvalidTransition,
  InvalidFieldType,
  OutOfRange,
  InvalidEvidence,
  IncompleteEvidence,
  IncompletePhases,
  NotFound,
} from '../ops/validate.js';

/**
 * Thrown when the caller attempts to create a task whose slug already
 * has a task-file on disk, or when adding a phase whose slug collides
 * with an existing phase in the same task.
 */
export class DuplicateSlug extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'DuplicateSlug';
  }
}

/**
 * Thrown by `phase.status.set('done')` when one or more acceptance
 * criteria in the phase still have status='pending'. V0.2 moves the
 * USP gate to the AC-status level (was at evidence level in v1) — a
 * phase is "done" iff every AC is "done". Callers must drive each
 * pending AC to 'done' (via `ac.evidence.set` or `ac.status.set` after
 * filling evidence) before retrying.
 */
export class IncompletePhase extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'IncompletePhase';
  }
}

/**
 * Thrown by `context.plan.refinement.resolve` when the q_index-th
 * `Q: ... → ?` marker can't be found in the plan content. Either the
 * index is out of range (no Nth marker exists) or the plan has no
 * unresolved refinement markers at all.
 */
export class RefinementMarkerNotFound extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'RefinementMarkerNotFound';
  }
}

/**
 * Thrown by `phase.field.set` / `phase.field.get` when the field name
 * is not declared in `anchored.yml.task.phase.fields`, or when the
 * value fails type validation against the declaration, or when the
 * name collides with a reserved built-in phase key (status, name,
 * context, rules, acceptance_criteria, retry_count, slug).
 *
 * Distinct from `InvalidFieldType` (which only fires on type mismatch
 * for a declared field) — this is the broader "field name is wrong"
 * error.
 */
export class InvalidFieldValue extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'InvalidFieldValue';
  }
}

/**
 * Thrown by `phase.remove` when the target phase has status='done'
 * and the caller didn't pass `{ force: true }`. Done phases represent
 * proven work — removing them silently would discard the evidence
 * that justifies their status. The force flag is the explicit
 * acknowledgement that the caller understands this.
 */
export class DonePhaseImmutable extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'DonePhaseImmutable';
  }
}

/**
 * Thrown by the centralized YAML parser (`core/parser.ts`) when the
 * raw document exceeds the 1 MB hard cap. A task-file that large is
 * either a runaway accumulation bug (context/audit history growing
 * unbounded) or an attempted parse-bomb (YAML alias expansion). The
 * cap is well above any legitimate task-file's expected size — the
 * largest dogfood task-files seen in V0.1 capped out around 60 KB.
 */
export class DocumentTooLarge extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'DocumentTooLarge';
  }
}

/**
 * Thrown by `core/io.ts:atomicWrite` when the cross-process lock on
 * the target task-file cannot be acquired within the retry budget
 * (3 retries × 100 ms backoff = ~400 ms total). Indicates another
 * anchored process is actively writing the same file. The fix is
 * either to wait + retry the operation, or to investigate why two
 * processes are racing on the same task (one-task-per-worktree is
 * the recommended pattern — see plugin/references/state-mutations.md).
 *
 * Stale locks (>10s old, prior process crashed) auto-reclaim — this
 * error only fires for genuine live contention.
 */
export class WriteContention extends AnchoredError {
  constructor(message: string, suggestions: string[] = []) {
    super(message, suggestions);
    this.name = 'WriteContention';
  }
}
