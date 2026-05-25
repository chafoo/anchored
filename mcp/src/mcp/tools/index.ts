/**
 * Tool registry — assembles the 9 MCP tools anchored exposes.
 *
 * Each tool is { name, description, inputSchema (JSON Schema),
 * handler (args → result) }. The server.ts iterates these to register
 * with the MCP SDK.
 */

import { taskRead } from './task-read.js';
import { taskStatusSet } from './task-status-set.js';
import { phaseNextPending } from './phase-next-pending.js';
import { phaseStatusSet } from './phase-status-set.js';
import { phaseFieldSet } from './phase-field-set.js';
import { phaseFieldGet } from './phase-field-get.js';
import { acList } from './ac-list.js';
import { acEvidenceSet } from './ac-evidence-set.js';
import { contextAppend } from './context-append.js';

export interface AnchoredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export const ALL_TOOLS: AnchoredTool[] = [
  taskRead,
  taskStatusSet,
  phaseNextPending,
  phaseStatusSet,
  phaseFieldSet,
  phaseFieldGet,
  acList,
  acEvidenceSet,
  contextAppend,
];

// ─────────────────────────────────────────────────────────────────────
// shared helper — resolve project root from args or env
// ─────────────────────────────────────────────────────────────────────

/**
 * MCP tools accept an optional `project_root` arg; if absent, fall
 * back to `ANCHORED_PROJECT_ROOT` env var (set by the orchestrator),
 * then `process.cwd()`. The orchestrator typically passes the user's
 * project root explicitly so the server can operate on any project.
 */
export function resolveProjectRoot(args: Record<string, unknown>): string {
  if (typeof args['project_root'] === 'string' && args['project_root'].length > 0) {
    return args['project_root'];
  }
  const envRoot = process.env['ANCHORED_PROJECT_ROOT'];
  if (envRoot && envRoot.length > 0) return envRoot;
  return process.cwd();
}

/** Common required string arg with description. */
export function strProp(description: string): Record<string, unknown> {
  return { type: 'string', description };
}
