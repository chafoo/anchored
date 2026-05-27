/**
 * Shared CLI helpers — keep individual command action functions under
 * 15 LOC by hiding config-load + factory-build boilerplate here.
 *
 * Every CLI subcommand is a thin transport over the V0.2 ops factory
 * (`createOps` at src/core/factory.ts). The factory needs the parsed
 * anchored.yml AND the project root; this module bundles the two reads
 * + the factory call into a single `loadOps(root)` helper.
 *
 * Output helpers (`printResult`, `printUpdated`, etc.) standardize the
 * shape of mutation responses so scripts piping stdout get a stable
 * surface across commands.
 */

import { stringify as yamlStringify } from 'yaml';
import { createOps, type TaskOps } from '../core/factory.js';
import { readConfig } from '../core/config.js';
import type { TaskFile } from '../schema/task-file.js';

/**
 * Load anchored.yml + build the ops factory rooted at `root`. Returns
 * the same TaskOps surface MCP tools use — different transport, same
 * code path.
 */
export async function loadOps(root: string): Promise<TaskOps> {
  const config = await readConfig(root);
  return createOps(config, root);
}

/**
 * Print a one-line "Updated: <slug>" confirmation for a mutation that
 * returned the new task-file. Used as the default for actions that
 * don't have a custom rendering.
 */
export function printUpdated(file: TaskFile): void {
  process.stdout.write(`Updated: ${file.slug}\n`);
}

/**
 * Pretty-print a TaskFile as YAML for the `task read` command. YAML
 * keeps multi-line strings legible (block scalars) and round-trips
 * cleanly through the v2 parser.
 */
export function printTaskFile(file: TaskFile): void {
  process.stdout.write(yamlStringify(file));
}

/**
 * Print a list of phases as a 3-column plain-text table. Columns:
 * name | slug | status. Used by `phase list`.
 */
export function printPhaseList(
  phases: { name: string; slug: string; status: string }[],
): void {
  if (phases.length === 0) {
    process.stdout.write('(no phases)\n');
    return;
  }
  const nameW = Math.max(...phases.map((p) => p.name.length), 'name'.length);
  const slugW = Math.max(...phases.map((p) => p.slug.length), 'slug'.length);
  const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - s.length));
  process.stdout.write(`${pad('name', nameW)}  ${pad('slug', slugW)}  status\n`);
  for (const p of phases) {
    process.stdout.write(`${pad(p.name, nameW)}  ${pad(p.slug, slugW)}  ${p.status}\n`);
  }
}

/**
 * Parse a string into an integer or throw. Used for `<idx>` args so
 * the error message names the field rather than NaN-propagating.
 */
export function parseIntArg(arg: string, fieldName: string): number {
  const n = parseInt(arg, 10);
  if (!Number.isInteger(n)) {
    throw new Error(`${fieldName} must be an integer (got "${arg}")`);
  }
  return n;
}

/**
 * Parse the `--after | --before | --to` option triple used by
 * `phase add` and `phase move`. Returns undefined if none set, so
 * callers can fall back to `phase.add`'s default ({ to: 'end' }).
 *
 * Exactly one position option is allowed; if the caller passes more,
 * the higher-precedence one wins (after > before > to).
 */
export function parsePhasePosition(opts: {
  after?: string;
  before?: string;
  to?: string;
}):
  | { after: string }
  | { before: string }
  | { to: 'start' | 'end' }
  | undefined {
  if (opts.after !== undefined) return { after: opts.after };
  if (opts.before !== undefined) return { before: opts.before };
  if (opts.to !== undefined) {
    if (opts.to !== 'start' && opts.to !== 'end') {
      throw new Error(`--to must be "start" or "end" (got "${opts.to}")`);
    }
    return { to: opts.to };
  }
  return undefined;
}
