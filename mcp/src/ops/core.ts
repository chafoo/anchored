/**
 * Typed core ops — service-layer mutations for the invariant task-file
 * schema (task.status, phase.status, ac.evidence, context.append, etc.).
 *
 * Each op follows the same pattern:
 *   1. read task-file from disk
 *   2. parse → typed structure
 *   3. validate the requested mutation
 *   4. mutate the typed structure
 *   5. render → markdown
 *   6. write atomically (temp + rename)
 *
 * Callers (CLI commands, MCP tool exposures) get typed inputs/outputs;
 * the file format is hidden inside.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { parse } from '../parser/parse.js';
import { render } from '../parser/render.js';
import type {
  TaskFile,
  TaskStatus,
  PhaseStatus,
  Phase,
  AcceptanceCriterion,
} from '../schema/task-file.js';
import {
  assertTaskTransition,
  assertPhaseTransition,
  assertAcIndexInRange,
  assertEvidenceNonEmpty,
  NotFound,
} from './validate.js';

// ─────────────────────────────────────────────────────────────────────
// File I/O — atomic read/write
// ─────────────────────────────────────────────────────────────────────

/**
 * Path resolution: the task-file lives at
 * `<projectRoot>/.claude/tasks/<slug>.md`. Callers pass `slug` and a
 * `projectRoot` (typically `process.cwd()`).
 */
export function taskFilePath(projectRoot: string, slug: string): string {
  return join(projectRoot, '.claude', 'tasks', `${slug}.md`);
}

async function readTaskFile(projectRoot: string, slug: string): Promise<TaskFile> {
  const path = taskFilePath(projectRoot, slug);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFound(`task-file not found: ${path}`);
    }
    throw err;
  }
  return parse(raw);
}

/**
 * Atomic write: render to string, write to temp path, rename onto
 * target. Avoids partial writes if the process crashes mid-flight.
 */
async function writeTaskFile(
  projectRoot: string,
  slug: string,
  file: TaskFile,
): Promise<void> {
  const target = taskFilePath(projectRoot, slug);
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(tmp, render(file), 'utf-8');
  await rename(tmp, target);
}

// ─────────────────────────────────────────────────────────────────────
// task ops
// ─────────────────────────────────────────────────────────────────────

/**
 * Read the full parsed task-file. Throws NotFound if the file
 * doesn't exist.
 */
export async function taskRead(
  projectRoot: string,
  slug: string,
): Promise<TaskFile> {
  return readTaskFile(projectRoot, slug);
}

/**
 * Set task status, enforcing the state-machine.
 * Returns the post-mutation task-file.
 */
export async function taskStatusSet(
  projectRoot: string,
  slug: string,
  newStatus: TaskStatus,
): Promise<TaskFile> {
  const file = await readTaskFile(projectRoot, slug);
  assertTaskTransition(file.frontmatter.status, newStatus);
  file.frontmatter.status = newStatus;
  await writeTaskFile(projectRoot, slug, file);
  return file;
}

// ─────────────────────────────────────────────────────────────────────
// phase ops
// ─────────────────────────────────────────────────────────────────────

/**
 * Return the next phase in declaration order whose status is
 * pending OR in-progress. In-progress phases come BEFORE pending —
 * that's how resume-safety works (an in-progress phase didn't finish,
 * so we pick it up first).
 *
 * Returns null when no such phase exists (all terminal).
 */
export async function phaseNextPending(
  projectRoot: string,
  slug: string,
): Promise<Phase | null> {
  const file = await readTaskFile(projectRoot, slug);
  // Prefer in-progress first
  for (const phase of file.phases) {
    if (phase.status === 'in-progress') return phase;
  }
  for (const phase of file.phases) {
    if (phase.status === 'pending') return phase;
  }
  return null;
}

/**
 * Set phase status, enforcing the per-phase state-machine.
 */
export async function phaseStatusSet(
  projectRoot: string,
  slug: string,
  phaseSlug: string,
  newStatus: PhaseStatus,
): Promise<TaskFile> {
  const file = await readTaskFile(projectRoot, slug);
  const phase = findPhase(file, phaseSlug);
  assertPhaseTransition(phase.status, newStatus);
  phase.status = newStatus;
  await writeTaskFile(projectRoot, slug, file);
  return file;
}

// ─────────────────────────────────────────────────────────────────────
// acceptance criterion ops
// ─────────────────────────────────────────────────────────────────────

/**
 * Return all acceptance criteria for the named phase, in order.
 */
export async function acList(
  projectRoot: string,
  slug: string,
  phaseSlug: string,
): Promise<AcceptanceCriterion[]> {
  const file = await readTaskFile(projectRoot, slug);
  const phase = findPhase(file, phaseSlug);
  return phase.acceptanceCriteria.map((ac) => ({ ...ac }));
}

/**
 * Set the evidence string for one acceptance criterion. Rejects
 * empty/sentinel values — setting evidence signals completion.
 */
export async function acEvidenceSet(
  projectRoot: string,
  slug: string,
  phaseSlug: string,
  acIndex: number,
  evidence: string,
): Promise<TaskFile> {
  assertEvidenceNonEmpty(evidence);
  const file = await readTaskFile(projectRoot, slug);
  const phase = findPhase(file, phaseSlug);
  assertAcIndexInRange(phase.acceptanceCriteria.length, acIndex);
  phase.acceptanceCriteria[acIndex]!.evidence = evidence;
  await writeTaskFile(projectRoot, slug, file);
  return file;
}

// ─────────────────────────────────────────────────────────────────────
// context append (writing to ## Context sub-sections)
// ─────────────────────────────────────────────────────────────────────

export type ContextSection = 'Plan' | 'Build' | 'Wrap';

/**
 * Append content to a ## Context sub-section. If `subsection` is
 * given, content goes under `### <section> → #### <subsection>`
 * (creating the H4 on demand). Otherwise content lands directly
 * under `### <section>`.
 *
 * On-demand: sections are created if they don't yet exist.
 */
export async function contextAppend(
  projectRoot: string,
  slug: string,
  section: ContextSection,
  subsection: string | null,
  content: string,
): Promise<TaskFile> {
  const file = await readTaskFile(projectRoot, slug);
  appendToContext(file, section, subsection, content);
  await writeTaskFile(projectRoot, slug, file);
  return file;
}

function appendToContext(
  file: TaskFile,
  section: ContextSection,
  subsection: string | null,
  content: string,
): void {
  const trimmed = content.trim();
  if (trimmed === '') return; // no-op on empty content

  if (section === 'Plan') {
    if (subsection !== null) {
      throw new Error(
        `Plan section does not support H4 sub-sections (got "${subsection}")`,
      );
    }
    file.context.plan = file.context.plan
      ? `${file.context.plan}\n${trimmed}`
      : trimmed;
    return;
  }

  if (section === 'Build') {
    if (subsection === null) {
      throw new Error(
        `Build section requires an H4 sub-section name ` +
          `(e.g. "Implement", "task-check", "code-check")`,
      );
    }
    const existing = file.context.build[subsection] ?? '';
    file.context.build[subsection] = existing
      ? `${existing}\n${trimmed}`
      : trimmed;
    return;
  }

  if (section === 'Wrap') {
    if (!file.context.wrap) {
      file.context.wrap = { subsections: {} };
    }
    if (subsection === null) {
      const intro = file.context.wrap.intro ?? '';
      file.context.wrap.intro = intro ? `${intro}\n${trimmed}` : trimmed;
    } else {
      const existing = file.context.wrap.subsections[subsection] ?? '';
      file.context.wrap.subsections[subsection] = existing
        ? `${existing}\n${trimmed}`
        : trimmed;
    }
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────

function findPhase(file: TaskFile, phaseSlug: string): Phase {
  const phase = file.phases.find((p) => p.slug === phaseSlug);
  if (!phase) {
    throw new NotFound(
      `phase "${phaseSlug}" not found in task "${file.frontmatter.slug}"`,
    );
  }
  return phase;
}
