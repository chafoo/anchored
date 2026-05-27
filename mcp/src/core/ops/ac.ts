/**
 * Acceptance-criterion ops — V0.2 atomicity contracts.
 *
 * Every op that touches an AC writes ALL three of {status, evidence,
 * failures} together in ONE write. The atomicity is what eliminates
 * the torn-state bug class (evidence filled but status pending, or
 * failures lingering after evidence is set). The behaviors:
 *
 *   - evidence.set:   set evidence + status='done' + clear failures
 *   - evidence.add:   append evidence + status='done' (if pending) + clear failures
 *   - failures.set:   set failures + status='pending' + KEEP evidence as history
 *   - failures.clear: delete failures + status UNCHANGED
 *   - status.set('pending'): full reset — clear evidence + clear failures
 *
 * Plus the non-atomicity helpers (add/remove/text.set).
 */

import { readTask, writeTask, type Deps } from './task.js';
import type { TaskFile, AcceptanceCriterion } from '../../schema/task-file.js';
import {
  assertAcIndexInRange,
  assertEvidenceArrayNonEmpty,
} from '../../ops/validate.js';
import { NotFound } from '../errors.js';

// ─────────────────────────────────────────────────────────────────────
// shared phase lookup
// ─────────────────────────────────────────────────────────────────────

function findPhase(file: TaskFile, phaseSlug: string) {
  const phase = file.phases.find((p) => p.slug === phaseSlug);
  if (!phase) {
    const known = file.phases.map((p) => p.slug);
    throw new NotFound(
      `phase "${phaseSlug}" not found in task "${file.slug}"`,
      [
        known.length > 0
          ? `Known phase slugs in this task: ${known.join(', ')}.`
          : `This task has no phases yet — re-run \`/impl-plan\` to populate.`,
        `Run \`anchored task read ${file.slug}\` to see the full task structure.`,
      ],
    );
  }
  return phase;
}

// ─────────────────────────────────────────────────────────────────────
// init shape
// ─────────────────────────────────────────────────────────────────────

/**
 * Caller-supplied shape for `ac.add`. Status defaults to 'pending';
 * evidence/failures default to absent (since 'pending' ACs can't have
 * evidence per the schema refine).
 */
export interface AcInit {
  text: string;
  status?: AcceptanceCriterion['status'];
  evidence?: string[];
  failures?: string[];
}

// ─────────────────────────────────────────────────────────────────────
// add / remove / text.set
// ─────────────────────────────────────────────────────────────────────

export function makeAcAdd({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    ac: AcInit,
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    const status = ac.status ?? 'pending';
    const newAc: AcceptanceCriterion = {
      text: ac.text,
      status,
      ...(ac.evidence !== undefined && ac.evidence.length > 0
        ? { evidence: ac.evidence }
        : {}),
      ...(ac.failures !== undefined && ac.failures.length > 0
        ? { failures: ac.failures }
        : {}),
    };
    phase.acceptance_criteria.push(newAc);
    return writeTask(root, slug, file);
  };
}

export function makeAcRemove({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    // Schema requires min(1) AC per phase — but we still let
    // remove drop to zero here and let the writeTask re-validate
    // surface the error. That's the right behavior: the schema is
    // the gate, not the op layer.
    phase.acceptance_criteria.splice(idx, 1);
    return writeTask(root, slug, file);
  };
}

export function makeAcTextSet({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
    text: string,
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    ac.text = text;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// evidence.set / evidence.add — atomicity contracts
// ─────────────────────────────────────────────────────────────────────

/**
 * Sets the evidence array, flips status → 'done', and CLEARS failures.
 * Single write. This is the canonical "AC proven" op.
 *
 * Atomicity contract verified by tests/core/ops-ac.test.ts: after this
 * call returns, a fresh read shows evidence == provided, status =
 * 'done', and `failures` field absent — regardless of the prior shape.
 */
export function makeAcEvidenceSet({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
    evidence: string[],
  ): Promise<TaskFile> => {
    assertEvidenceArrayNonEmpty(evidence);
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    ac.evidence = [...evidence];
    ac.status = 'done';
    delete (ac as { failures?: string[] }).failures;
    return writeTask(root, slug, file);
  };
}

/**
 * Appends a single evidence line to the existing array (or creates
 * the array if absent), flips status → 'done' if it was 'pending',
 * and CLEARS failures.
 *
 * Useful for incremental evidence capture — e.g. the impl agent
 * finds proof for one of several ACs and wants to record it without
 * touching the others.
 */
export function makeAcEvidenceAdd({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
    line: string,
  ): Promise<TaskFile> => {
    // Single-element non-empty check via the array assert.
    assertEvidenceArrayNonEmpty([line]);
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    const current = ac.evidence ?? [];
    ac.evidence = [...current, line];
    ac.status = 'done';
    delete (ac as { failures?: string[] }).failures;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// failures.set / failures.clear — atomicity contracts
// ─────────────────────────────────────────────────────────────────────

/**
 * Sets failures and flips status → 'pending'.
 *
 * Critical: existing `evidence` is KEPT. The implement-agent re-do
 * loop reads both fields — evidence shows what was claimed proven
 * earlier, failures shows what the validation gate caught. That
 * combination is the retry context.
 */
export function makeAcFailuresSet({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
    failures: string[],
  ): Promise<TaskFile> => {
    if (!Array.isArray(failures) || failures.length === 0) {
      throw new Error(
        `failures must be a non-empty array — pass at least one failure description.`,
      );
    }
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    ac.failures = [...failures];
    ac.status = 'pending';
    // KEEP evidence — implement agent needs it for retry context.
    return writeTask(root, slug, file);
  };
}

/**
 * Removes the `failures` field. Status is UNCHANGED.
 *
 * Used after a successful retry where the implement-agent satisfies
 * the failure conditions — the orchestrator clears failures as part
 * of moving the AC back into the proof workflow, but doesn't touch
 * status (which `evidence.set` will flip to 'done').
 */
export function makeAcFailuresClear({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    delete (ac as { failures?: string[] }).failures;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// status.set('pending') — full reset
// ─────────────────────────────────────────────────────────────────────

/**
 * Resets an AC to 'pending' and clears BOTH evidence + failures.
 *
 * The use case is plan-stage scope changes: the user revises an AC's
 * text and wants to start over from scratch. Distinct from
 * `failures.set` (which keeps evidence for retry context) — this is
 * the clean-slate op.
 *
 * Restricted to `status: 'pending'` deliberately: transitioning an
 * AC to 'done' must go through `evidence.set` (so evidence is filled
 * atomically with the status flip).
 */
export function makeAcStatusSet({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    idx: number,
    status: 'pending',
  ): Promise<TaskFile> => {
    void status;
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    assertAcIndexInRange(phase.acceptance_criteria.length, idx);
    const ac = phase.acceptance_criteria[idx]!;
    ac.status = 'pending';
    delete (ac as { evidence?: string[] }).evidence;
    delete (ac as { failures?: string[] }).failures;
    return writeTask(root, slug, file);
  };
}
