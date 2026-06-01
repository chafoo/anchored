/**
 * Task-file parser — thin wrapper over `yaml` + Zod.
 *
 * The whole job is:
 *   1. parseYamlSafe(raw) → unknown  (size-cap + alias-guard + no custom tags)
 *   2. Zod TaskFile.parse(...) → typed structure
 *
 * Bug-classes this eliminates by construction:
 *   - Embedded newlines in evidence corrupting subsequent ACs
 *   - Missing H1 / mis-cased section names
 *   - Indentation drift between renderer and parser
 *
 * Schema-version gating refuses any value other than the supported
 * SCHEMA_VERSION with a clear error message.
 */

import { YAMLError } from 'yaml';
import { z } from 'zod';

import { TaskFile, SCHEMA_VERSION, type TaskFile as TaskFileType } from '../schema/task-file.js';
import { parseYamlSafe } from '../core/parser.js';

export { SCHEMA_VERSION };

/**
 * Thrown for any failure to turn raw YAML text into a valid task-file
 * structure. The message always includes enough detail to act on
 * (line + column when available, or the schema mismatch path).
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export function parseTaskFileYAML(raw: string): TaskFileType {
  let yamlObj: unknown;
  try {
    yamlObj = parseYamlSafe(raw);
  } catch (err) {
    if (err instanceof YAMLError) {
      throw new ParseError(
        `YAML parse failed at line ${err.linePos?.[0]?.line ?? '?'}, ` +
          `col ${err.linePos?.[0]?.col ?? '?'}: ${err.message}`,
        err,
      );
    }
    throw new ParseError(`YAML parse failed: ${(err as Error).message}`, err);
  }

  // schema_version gating with a helpful message before generic Zod
  // validation kicks in.
  if (typeof yamlObj === 'object' && yamlObj !== null && 'schema_version' in yamlObj) {
    const sv = (yamlObj as { schema_version: unknown }).schema_version;
    if (sv !== SCHEMA_VERSION) {
      throw new ParseError(
        `Unsupported schema_version: ${JSON.stringify(sv)}. ` +
          `This parser only accepts schema_version: ${SCHEMA_VERSION}. ` +
          `Files with schema_version: ${sv} are not supported.`,
      );
    }
  } else if (typeof yamlObj === 'object' && yamlObj !== null) {
    throw new ParseError(
      `Missing schema_version field. Task-files require ` + `schema_version: ${SCHEMA_VERSION}.`,
    );
  }

  // Legacy-field shim: the persisted `autonomy` field was removed in
  // V0.3 (the three walk-modes survive only as an ephemeral skill
  // prompt, not in the schema). The TaskFile schema is `.passthrough()`,
  // so a stray top-level `autonomy` key on an old on-disk file would
  // otherwise survive parse AND get re-emitted on the next write. Strip
  // it from the raw object before the schema runs so existing artifacts
  // (e.g. `autonomy: ask_all`) load cleanly and the field drops away.
  if (typeof yamlObj === 'object' && yamlObj !== null && 'autonomy' in yamlObj) {
    delete (yamlObj as Record<string, unknown>).autonomy;
  }

  try {
    return TaskFile.parse(yamlObj);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new ParseError(`task-file failed schema validation:\n${issues}`, err);
    }
    throw new ParseError(`Schema validation failed: ${(err as Error).message}`, err);
  }
}
