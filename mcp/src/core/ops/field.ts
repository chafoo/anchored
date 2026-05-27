/**
 * Per-phase extension field ops — schema-driven, declared in
 * anchored.yml.task.phase.fields.
 *
 * field.set validates against:
 *   1. Reserved-name list — built-in keys (status, name, context, etc.)
 *      MUST go through their own typed ops; field.set rejects them.
 *   2. Declared-name list — fields must be declared in anchored.yml.
 *   3. Declared type — coerces via the shared `coerceFieldValue`
 *      helper from validate.ts (handles string/number/boolean/enum).
 *
 * field.get is purely a read with the same name-validation gate.
 * field.list is config-only — no IO.
 */

import { readTask, writeTask, type Deps as TaskDeps } from './task.js';
import type { TaskFile } from '../../schema/task-file.js';
import type { AnchoredYml, PhaseFieldDecl } from '../../schema/anchored-yml.js';
import { coerceFieldValue } from '../../ops/validate.js';
import { InvalidFieldValue, NotFound } from '../errors.js';

// ─────────────────────────────────────────────────────────────────────
// reserved names
// ─────────────────────────────────────────────────────────────────────

/**
 * Built-in phase keys with their own typed ops — field.set / get
 * MUST refuse to touch these. Lifting them through the generic field
 * surface would bypass state-machine + completeness gates.
 */
const RESERVED_FIELD_NAMES = new Set([
  'name',
  'slug',
  'status',
  'context',
  'rules',
  'acceptance_criteria',
  'retry_count',
]);

// ─────────────────────────────────────────────────────────────────────
// deps
// ─────────────────────────────────────────────────────────────────────

export interface FieldDeps extends TaskDeps {
  config: AnchoredYml;
}

function findDecl(config: AnchoredYml, name: string): PhaseFieldDecl {
  const decl = config.task.phase.fields.find((f) => f.name === name);
  if (!decl) {
    const known = config.task.phase.fields.map((f) => f.name);
    throw new InvalidFieldValue(
      `field "${name}" not declared in anchored.yml task.phase.fields. ` +
        `Known fields: [${known.join(', ') || 'none'}]`,
      [
        known.length > 0
          ? `Pass one of the declared field names: ${known.join(', ')}.`
          : `Edit anchored.yml and add a declaration under task.phase.fields, e.g. \`{ name: ${name}, type: string }\`.`,
        `Field declarations live in anchored.yml. The decl shape is { name, type } where type is one of string/number/boolean/enum.`,
      ],
    );
  }
  return decl;
}

function assertNotReserved(name: string): void {
  if (RESERVED_FIELD_NAMES.has(name)) {
    throw new InvalidFieldValue(
      `field "${name}" is a built-in phase key with its own typed op — ` +
        `use \`phase.${name}.set\` instead of \`phase.field.set\`.`,
      [
        `Reserved names: ${[...RESERVED_FIELD_NAMES].join(', ')}.`,
        name === 'status'
          ? `Use \`phase.status.set(slug, phase_slug, status)\` to change phase status.`
          : `The reserved op enforces state-machine + completeness gates that field.set would bypass.`,
      ],
    );
  }
}

function findPhase(file: TaskFile, phase_slug: string) {
  const phase = file.phases.find((p) => p.slug === phase_slug);
  if (!phase) {
    throw new NotFound(
      `phase "${phase_slug}" not found in task "${file.slug}"`,
      [
        `Run \`anchored task read ${file.slug}\` to see the phase slugs in this task.`,
      ],
    );
  }
  return phase;
}

// ─────────────────────────────────────────────────────────────────────
// list / set / get
// ─────────────────────────────────────────────────────────────────────

export function makeFieldList({ config }: FieldDeps) {
  return (): { name: string; type: string }[] => {
    return config.task.phase.fields.map((f) => ({
      name: f.name,
      type: f.type,
    }));
  };
}

export function makeFieldSet({ config, root }: FieldDeps) {
  return async (
    slug: string,
    phase_slug: string,
    name: string,
    value: unknown,
  ): Promise<TaskFile> => {
    assertNotReserved(name);
    const decl = findDecl(config, name);
    const coerced = coerceFieldValue(decl, value);

    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    (phase as Record<string, unknown>)[name] = coerced;
    return writeTask(root, slug, file);
  };
}

export function makeFieldGet({ config, root }: FieldDeps) {
  return async (
    slug: string,
    phase_slug: string,
    name: string,
  ): Promise<unknown> => {
    assertNotReserved(name);
    // Throws InvalidFieldValue if undeclared — same surface as set.
    findDecl(config, name);
    const file = await readTask(root, slug);
    const phase = findPhase(file, phase_slug);
    const value = (phase as Record<string, unknown>)[name];
    return value;
  };
}
