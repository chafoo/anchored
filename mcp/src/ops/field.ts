/**
 * Generic field ops — schema-driven mutations for user-declared phase
 * fields (the `task.phase.fields` extensions in anchored.yml).
 *
 * Reads the user's anchored.yml at op-time to know which fields are
 * declared and what their types are; validates values against the
 * declarations; persists via the same atomic-write path as core ops.
 *
 * Example: with `anchored.yml.task.phase.fields = [{ name: commit,
 * type: string }]`, callers can do `phaseFieldSet(slug, phase, "commit",
 * "abc1234")` and the field lands at `- commit: abc1234` on the
 * phase block.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { parse } from '../parser/parse.js';
import { render } from '../parser/render.js';
import {
  parseAnchoredYml,
  type AnchoredYml,
  type PhaseFieldDecl,
} from '../schema/anchored-yml.js';
import type { TaskFile, Phase } from '../schema/task-file.js';
import { coerceFieldValue, NotFound } from './validate.js';
import { taskFilePath } from './core.js';

// ─────────────────────────────────────────────────────────────────────
// anchored.yml loading
// ─────────────────────────────────────────────────────────────────────

export function anchoredYmlPath(projectRoot: string): string {
  return join(projectRoot, 'anchored.yml');
}

/**
 * Read + parse the project's anchored.yml. Throws NotFound if the
 * file doesn't exist — field ops require it (need to know declared
 * field types to validate values).
 */
export async function readAnchoredYml(projectRoot: string): Promise<AnchoredYml> {
  const path = anchoredYmlPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFound(
        `anchored.yml not found at ${path}. Run /impl-plan to bootstrap.`,
      );
    }
    throw err;
  }
  const obj = parseYaml(raw);
  return parseAnchoredYml(obj);
}

function findFieldDecl(
  config: AnchoredYml,
  fieldName: string,
): PhaseFieldDecl {
  const decl = config.task.phase.fields.find((f) => f.name === fieldName);
  if (!decl) {
    const known = config.task.phase.fields.map((f) => f.name);
    throw new UnknownField(
      `field "${fieldName}" not declared in anchored.yml task.phase.fields. ` +
        `Known fields: [${known.join(', ') || 'none'}]`,
    );
  }
  return decl;
}

// ─────────────────────────────────────────────────────────────────────
// phase.field.set / get
// ─────────────────────────────────────────────────────────────────────

/**
 * Set a user-declared phase field. Validates:
 *   1. Field name is declared in anchored.yml
 *   2. Value matches the declared type (coerce when sensible)
 *
 * The phase block on disk gets the field as `- <name>: <value>`
 * (rendered by the renderer; alphabetical among extensions).
 */
export async function phaseFieldSet(
  projectRoot: string,
  taskSlug: string,
  phaseSlug: string,
  fieldName: string,
  value: unknown,
): Promise<TaskFile> {
  const config = await readAnchoredYml(projectRoot);
  const decl = findFieldDecl(config, fieldName);
  const coerced = coerceFieldValue(decl, value);

  const file = await readTaskFileAtomic(projectRoot, taskSlug);
  const phase = findPhase(file, phaseSlug);
  phase.extensions[fieldName] = coerced;
  await writeTaskFileAtomic(projectRoot, taskSlug, file);
  return file;
}

/**
 * Read a user-declared phase field's current value (or null if unset).
 * Doesn't require the field to be declared in anchored.yml — read is
 * lenient (returns whatever the parser found on the phase block).
 */
export async function phaseFieldGet(
  projectRoot: string,
  taskSlug: string,
  phaseSlug: string,
  fieldName: string,
): Promise<unknown> {
  const file = await readTaskFileAtomic(projectRoot, taskSlug);
  const phase = findPhase(file, phaseSlug);
  const value = phase.extensions[fieldName];
  return value === undefined ? null : value;
}

// ─────────────────────────────────────────────────────────────────────
// I/O helpers (duplicated from core.ts to avoid circular imports;
// could be lifted to a shared io.ts in a refactor)
// ─────────────────────────────────────────────────────────────────────

async function readTaskFileAtomic(
  projectRoot: string,
  slug: string,
): Promise<TaskFile> {
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

async function writeTaskFileAtomic(
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

function findPhase(file: TaskFile, phaseSlug: string): Phase {
  const phase = file.phases.find((p) => p.slug === phaseSlug);
  if (!phase) {
    throw new NotFound(
      `phase "${phaseSlug}" not found in task "${file.frontmatter.slug}"`,
    );
  }
  return phase;
}

// ─────────────────────────────────────────────────────────────────────
// errors
// ─────────────────────────────────────────────────────────────────────

export class UnknownField extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownField';
  }
}
