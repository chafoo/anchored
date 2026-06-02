/**
 * Phase-level ops: list / next / add / remove / move plus status,
 * name, context, rules, retry_count mutations.
 *
 * Behaviors:
 *   - phase.add with a `position: PhasePosition` argument (after|before|to)
 *   - phase.remove rejects done-status phases unless `{ force: true }`
 *   - phase.status.set('done') checks every AC is status='done'
 *     (IncompletePhase if not — listing the offending AC indices)
 *   - phase.retry_count.increment returns the new count atomically
 */

import { readTask, writeTask, type Deps } from './task.js';
import type {
  TaskFile,
  Phase,
  PhaseStatus,
  PhaseExecutor,
  PhaseRule,
  AcceptanceCriterion,
} from '../../schema/task-file.js';
import { PhaseExecutor as PhaseExecutorSchema } from '../../schema/task-file.js';
import { assertPhaseTransition } from '../../ops/validate.js';
import {
  DuplicateSlug,
  DonePhaseImmutable,
  IncompletePhase,
  InvalidFieldValue,
  NotFound,
} from '../errors.js';

// ─────────────────────────────────────────────────────────────────────
// types
// ─────────────────────────────────────────────────────────────────────

export type PhasePosition = { after: string } | { before: string } | { to: 'start' | 'end' };

/**
 * Caller-supplied shape for `phase.add`. Status defaults to 'pending';
 * acceptance_criteria defaults to a single placeholder AC (the schema
 * requires min(1) per phase, and the plan stage typically fills real
 * ACs in a follow-up call).
 */
export interface PhaseInit {
  name: string;
  slug: string;
  status?: PhaseStatus;
  context?: string;
  rules?: PhaseRule[];
  acceptance_criteria?: AcceptanceCriterion[];
}

// ─────────────────────────────────────────────────────────────────────
// shared helpers
// ─────────────────────────────────────────────────────────────────────

function findPhaseOrThrow(file: TaskFile, phaseSlug: string): Phase {
  const phase = file.phases.find((p) => p.slug === phaseSlug);
  if (!phase) {
    const known = file.phases.map((p) => p.slug);
    throw new NotFound(`phase "${phaseSlug}" not found in task "${file.slug}"`, [
      known.length > 0
        ? `Known phase slugs in this task: ${known.join(', ')}.`
        : `This task has no phases yet — re-run \`/impl-plan\` to populate.`,
      `Run \`anchored task read ${file.slug}\` to see the full task structure.`,
    ]);
  }
  return phase;
}

function findIndexOrThrow(file: TaskFile, phaseSlug: string): number {
  const idx = file.phases.findIndex((p) => p.slug === phaseSlug);
  if (idx === -1) {
    findPhaseOrThrow(file, phaseSlug); // throws NotFound with full message
  }
  return idx;
}

function resolveInsertIndex(file: TaskFile, position: PhasePosition): number {
  if ('to' in position) {
    return position.to === 'start' ? 0 : file.phases.length;
  }
  if ('after' in position) {
    return findIndexOrThrow(file, position.after) + 1;
  }
  // 'before' in position
  return findIndexOrThrow(file, position.before);
}

// ─────────────────────────────────────────────────────────────────────
// list / next
// ─────────────────────────────────────────────────────────────────────

export function makePhaseList({ root }: Deps) {
  return async (slug: string): Promise<{ name: string; slug: string; status: PhaseStatus }[]> => {
    const file = await readTask(root, slug);
    return file.phases.map((p) => ({
      name: p.name,
      slug: p.slug,
      status: p.status,
    }));
  };
}

export function makePhaseNext({ root }: Deps) {
  return async (slug: string): Promise<{ name: string; slug: string } | null> => {
    const file = await readTask(root, slug);
    // Resume-safety first: in-progress takes priority over pending.
    const inProgress = file.phases.find((p) => p.status === 'in-progress');
    if (inProgress) {
      return { name: inProgress.name, slug: inProgress.slug };
    }
    const pending = file.phases.find((p) => p.status === 'pending');
    if (pending) return { name: pending.name, slug: pending.slug };
    return null;
  };
}

// ─────────────────────────────────────────────────────────────────────
// add / remove / move
// ─────────────────────────────────────────────────────────────────────

export function makePhaseAdd({ root }: Deps) {
  return async (
    slug: string,
    init: PhaseInit,
    position: PhasePosition = { to: 'end' },
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    if (file.phases.some((p) => p.slug === init.slug)) {
      const known = file.phases.map((p) => p.slug);
      throw new DuplicateSlug(`phase slug "${init.slug}" already exists in task "${file.slug}"`, [
        `Pick a different slug, or remove the existing phase first. Existing slugs: ${known.join(', ')}.`,
        `Use \`anchored phase list ${file.slug}\` to see current phase slugs.`,
        `If you want to rename, use \`phase.name.set\` — slugs are immutable identifiers.`,
      ]);
    }
    const insertAt = resolveInsertIndex(file, position);
    const newPhase: Phase = {
      name: init.name,
      slug: init.slug,
      status: init.status ?? 'pending',
      ...(init.context !== undefined ? { context: init.context } : {}),
      ...(init.rules !== undefined ? { rules: init.rules } : {}),
      acceptance_criteria: init.acceptance_criteria ?? [
        { text: 'TBD — fill in during plan stage', status: 'pending' },
      ],
    };
    file.phases.splice(insertAt, 0, newPhase);
    return writeTask(root, slug, file);
  };
}

export function makePhaseRemove({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    opts: { force?: boolean } = {},
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    if (phase.status === 'done' && !opts.force) {
      throw new DonePhaseImmutable(
        `cannot remove phase "${phase.name}" (slug: ${phase.slug}): ` +
          `status is 'done'. Removing a done phase discards proven work.`,
        [
          `Pass \`{ force: true }\` to confirm you understand this discards proven evidence.`,
          `Or revisit whether the phase actually needs removal — its done evidence may be useful as audit history.`,
        ],
      );
    }
    file.phases.splice(file.phases.indexOf(phase), 1);
    return writeTask(root, slug, file);
  };
}

export function makePhaseMove({ root }: Deps) {
  return async (slug: string, phase_slug: string, target: PhasePosition): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    file.phases.splice(file.phases.indexOf(phase), 1);
    // Re-resolve the insert index AFTER the removal — `after: 'foo'`
    // means "after foo's current position" in the post-removal array.
    const insertAt = resolveInsertIndex(file, target);
    file.phases.splice(insertAt, 0, phase);
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// status / name / context
// ─────────────────────────────────────────────────────────────────────

export function makePhaseStatusSet({ root }: Deps) {
  return async (slug: string, phase_slug: string, status: PhaseStatus): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    assertPhaseTransition(phase.status, status);

    if (status === 'done') {
      // V0.2: AC-level completeness gate. The phase can only go to
      // 'done' if every AC has already been driven to 'done' (which
      // by schema invariant means each has non-empty evidence).
      const pendingIndices: number[] = [];
      phase.acceptance_criteria.forEach((ac, i) => {
        if (ac.status !== 'done') pendingIndices.push(i);
      });
      if (pendingIndices.length > 0) {
        throw new IncompletePhase(
          `cannot mark phase "${phase.name}" (slug: ${phase.slug}) as done: ` +
            `${pendingIndices.length} of ${phase.acceptance_criteria.length} ` +
            `acceptance criteria still have status='pending' ` +
            `(indices: ${pendingIndices.join(', ')}).`,
          [
            `For each pending AC, fill evidence via \`anchored ac evidence set ${slug} ${phase.slug} <index> '<evidence>'\` — this atomically flips status to done.`,
            `If you can't satisfy these ACs right now, transition the phase to blocked or deferred instead — those have no AC-completeness requirement.`,
          ],
        );
      }
    }

    phase.status = status;
    return writeTask(root, slug, file);
  };
}

/**
 * Sets a phase's `executor` (implement | workflow). Plan/refine-time
 * write-path — execution-time /impl-build only READS this value, so
 * setting it deliberately does NOT touch phase.status or trigger any
 * state-machine transition (mirrors `phase.name.set`, not
 * `phase.status.set`).
 *
 * The enum is validated at the op layer: any value other than
 * 'implement' | 'workflow' is rejected with an InvalidFieldValue error
 * carrying actionable suggestions — even when callers bypass the
 * transport-layer Zod parse.
 */
export function makePhaseExecutorSet({ root }: Deps) {
  return async (slug: string, phase_slug: string, executor: PhaseExecutor): Promise<TaskFile> => {
    const parsed = PhaseExecutorSchema.safeParse(executor);
    if (!parsed.success) {
      throw new InvalidFieldValue(
        `invalid executor "${String(executor)}" for phase "${phase_slug}": ` +
          `must be one of 'implement' | 'workflow'.`,
        [
          `Pass 'implement' for the standard sequential implement worker, or 'workflow' for a nested sub-workflow phase.`,
          `Run \`anchored phase executor set ${slug} ${phase_slug} implement\` (or \`workflow\`).`,
        ],
      );
    }

    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    phase.executor = parsed.data;
    return writeTask(root, slug, file);
  };
}

export function makePhaseNameSet({ root }: Deps) {
  return async (slug: string, phase_slug: string, name: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    phase.name = name;
    return writeTask(root, slug, file);
  };
}

export function makePhaseContextSet({ root }: Deps) {
  return async (slug: string, phase_slug: string, content: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    phase.context = content;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// rules.set / rules.add / rules.remove
// ─────────────────────────────────────────────────────────────────────

export function makePhaseRulesSet({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    rules: { path: string; why: string }[],
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    phase.rules = rules.map((r) => ({ path: r.path, why: r.why }));
    return writeTask(root, slug, file);
  };
}

export function makePhaseRulesAdd({ root }: Deps) {
  return async (
    slug: string,
    phase_slug: string,
    rule: { path: string; why: string },
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    if (!phase.rules) phase.rules = [];
    phase.rules.push({ path: rule.path, why: rule.why });
    return writeTask(root, slug, file);
  };
}

export function makePhaseRulesRemove({ root }: Deps) {
  return async (slug: string, phase_slug: string, idx: number): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    const rules = phase.rules ?? [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= rules.length) {
      throw new NotFound(
        `rule index ${idx} out of range for phase "${phase.slug}" (has ${rules.length} rule(s))`,
        [
          rules.length === 0
            ? `This phase has no rules yet — add one via \`phase.rules.add\`.`
            : `Pass an index in [0, ${rules.length - 1}].`,
        ],
      );
    }
    rules.splice(idx, 1);
    phase.rules = rules;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// retry_count.increment
// ─────────────────────────────────────────────────────────────────────

/**
 * Atomically increments `phase.retry_count` and returns the NEW value.
 * The increment + write happen in one read→mutate→write cycle.
 *
 * Compared against `anchored.yml.build.retry_limit` by the build skill
 * to short-circuit the retry loop and surface a manual-intervention
 * prompt when the limit is exceeded.
 */
export function makePhaseRetryCountIncrement({ root }: Deps) {
  return async (slug: string, phase_slug: string): Promise<number> => {
    const file = await readTask(root, slug);
    const phase = findPhaseOrThrow(file, phase_slug);
    const next = (phase.retry_count ?? 0) + 1;
    phase.retry_count = next;
    await writeTask(root, slug, file);
    return next;
  };
}
