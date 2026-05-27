/**
 * Task-level ops: create / read / status.set / title.set.
 *
 * Builds the `taskOps` sub-tree of the TaskOps surface. Each op
 * follows the read → validate → mutate → re-validate → atomicWrite
 * pattern. State transitions go through `assertTaskTransition`; the
 * `wrap` gate uses the existing IncompletePhases enforcement.
 */

import { readFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';

import { parseTaskFileYAML } from '../../parser/parse.js';
import { renderTaskFileYAML } from '../../parser/render.js';
import { TaskFile } from '../../schema/task-file.js';
import type { TaskFile as TaskFileType, TaskStatus } from '../../schema/task-file.js';
import {
  assertTaskTransition,
  IncompletePhases,
} from '../../ops/validate.js';
import { DuplicateSlug, NotFound } from '../errors.js';
import { atomicWrite } from '../io.js';

// ─────────────────────────────────────────────────────────────────────
// shared deps + helpers
// ─────────────────────────────────────────────────────────────────────

export interface Deps {
  root: string;
}

/**
 * Path on disk for a task-file: `.claude/tasks/<slug>.yml`.
 */
export function taskPath(root: string, slug: string): string {
  return join(root, '.claude', 'tasks', `${slug}.yml`);
}

export async function readTask(root: string, slug: string): Promise<TaskFileType> {
  const path = taskPath(root, slug);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFound(`task-file not found: ${path}`, [
        `If this task doesn't exist yet, create it via \`/impl-plan <description>\`.`,
        `If you expected a file here, check the slug matches the filename (kebab-case, .yml extension).`,
      ]);
    }
    throw err;
  }
  return parseTaskFileYAML(raw);
}

export async function writeTask(
  root: string,
  slug: string,
  file: TaskFileType,
): Promise<TaskFileType> {
  // Re-validate the full file before persisting — catches any
  // mutation that drifted from the schema.
  const validated = TaskFile.parse(file);
  await atomicWrite(taskPath(root, slug), renderTaskFileYAML(validated));
  return validated;
}

// ─────────────────────────────────────────────────────────────────────
// task.create
// ─────────────────────────────────────────────────────────────────────

/**
 * Initial fields the caller supplies to `task.create`. Sensible
 * defaults are filled in below — only `title` is strictly required;
 * `context.intro` is required by the schema but defaults to a stub.
 */
export interface TaskCreateInput {
  title: string;
  /** ISO date YYYY-MM-DD — defaults to today (UTC). */
  created?: string;
  /** Initial intro markdown for context. Defaults to a one-line stub. */
  intro?: string;
  /**
   * Optional initial phases. If omitted, the task is created with
   * zero phases; callers add them via `phase.add` once planning
   * crystallizes the breakdown.
   */
  phases?: TaskFileType['phases'];
}

function todayISO(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeTaskCreate({ root }: Deps) {
  return async (slug: string, initial: TaskCreateInput): Promise<TaskFileType> => {
    const path = taskPath(root, slug);
    // Refuse to clobber an existing file — task.create is meant for
    // brand-new tasks. Use task.read + dedicated ops to mutate
    // existing files.
    try {
      await access(path, constants.F_OK);
      throw new DuplicateSlug(
        `task-file already exists at ${path}`,
        [
          `Pick a different slug, or read the existing task with \`anchored task read ${slug}\`.`,
          `If you want to overwrite, delete the file first (this op never clobbers).`,
        ],
      );
    } catch (err: unknown) {
      // ENOENT is the happy path — anything else is real.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (err instanceof DuplicateSlug) throw err;
        throw err;
      }
    }

    const file: TaskFileType = {
      schema_version: 2,
      slug,
      status: 'plan',
      created: initial.created ?? todayISO(),
      title: initial.title,
      context: {
        intro: initial.intro ?? 'TBD — fill in during plan stage.',
      },
      phases: initial.phases ?? [],
    };

    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// task.read
// ─────────────────────────────────────────────────────────────────────

export function makeTaskRead({ root }: Deps) {
  return (slug: string): Promise<TaskFileType> => readTask(root, slug);
}

// ─────────────────────────────────────────────────────────────────────
// task.status.set
// ─────────────────────────────────────────────────────────────────────

export function makeTaskStatusSet({ root }: Deps) {
  return async (slug: string, status: TaskStatus): Promise<TaskFileType> => {
    const file = await readTask(root, slug);
    assertTaskTransition(file.status, status);

    if (status === 'wrap') {
      const nonTerminal = file.phases.filter(
        (p) => p.status === 'pending' || p.status === 'in-progress',
      );
      if (nonTerminal.length > 0) {
        const suggestions = [
          `Drive each non-terminal phase to done | blocked | deferred before retrying.`,
          `For phases you've started: \`anchored phase status set ${slug} <phase-slug> blocked\` (or deferred).`,
          nonTerminal.length === 1
            ? `Only "${nonTerminal[0]!.name}" is blocking — focus there.`
            : `${nonTerminal.length} phases still active — \`anchored task read ${slug}\` to see all phase statuses.`,
        ];
        throw new IncompletePhases(
          `cannot transition task to wrap: ${nonTerminal.length} phase(s) ` +
            `not yet terminal: ` +
            nonTerminal.map((p) => `"${p.name}" (${p.status})`).join(', '),
          suggestions,
        );
      }
    }

    file.status = status;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// task.title.set
// ─────────────────────────────────────────────────────────────────────

export function makeTaskTitleSet({ root }: Deps) {
  return async (slug: string, title: string): Promise<TaskFileType> => {
    const file = await readTask(root, slug);
    file.title = title;
    return writeTask(root, slug, file);
  };
}
