/**
 * Shared helpers for the per-tool shims in this directory.
 *
 * Each tool file picks an InputSchema, wires `createOps(...)`, and
 * delegates to the matching factory method. The shared bits live here
 * so each shim stays under 25 LOC.
 */

import { z } from 'zod';

import { readConfig } from '../../core/config.js';
import { createOps, type TaskOps } from '../../core/factory.js';

/**
 * The MCP tool shape registered with the SDK in server.ts.
 *
 * `inputSchema` is a JSON Schema (produced via `zodToJsonSchema`).
 * `handler` is the dispatcher: takes already-validated args, performs
 * the side-effect via the factory, and returns the new TaskFile (or
 * other op-specific shape — server.ts JSON-stringifies the result).
 */
export interface AnchoredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * Resolve project_root → load config → build the TaskOps factory.
 *
 * Every tool starts by calling this to get a ready-to-use `ops` object.
 * The per-call config load is cheap (one fs.readFile + zod.parse) and
 * ensures field declarations stay in sync if anchored.yml changes
 * during a session.
 */
export async function withOps(project_root: string): Promise<TaskOps> {
  const config = await readConfig(project_root);
  return createOps(config, project_root);
}

/** Required project_root + slug. The two args every tool needs. */
export const BaseSchema = z.object({
  project_root: z.string().min(1),
  slug: z.string().min(1),
});

/** Required project_root + slug + phase_slug. Used by phase-level ops. */
export const PhaseSchema = BaseSchema.extend({
  phase_slug: z.string().min(1),
});

/** Required project_root + slug + phase_slug + ac_index. AC-level ops. */
export const AcSchema = PhaseSchema.extend({
  ac_index: z.number().int().nonnegative(),
});
