/**
 * Tool registry — assembles the 37 MCP tools anchored exposes.
 *
 * Each tool is { name, description, inputSchema (JSON Schema), handler }.
 * server.ts iterates ALL_TOOLS to register handlers with the MCP SDK.
 *
 * Tools are thin shims over the factory at src/core/factory.ts. Same
 * code path as the CLI; different transport.
 */

import { type AnchoredTool } from './_shared.js';

// task-lifecycle (4)
import { createTool } from './create.js';
import { readTool } from './read.js';
import { setTaskStatusTool } from './set-task-status.js';
import { setTitleTool } from './set-title.js';

// question — V0.3 structured Q&A (4)
import { questionAddTool } from './question-add.js';
import { questionListTool } from './question-list.js';
import { questionResolveTool } from './question-resolve.js';
import { questionRetagTool } from './question-retag.js';

// context (8)
import { setIntroTool } from './set-intro.js';
import { appendPlanTool } from './append-plan.js';
import { resolveQuestionTool } from './resolve-question.js';
import { appendBuildSectionTool } from './append-build-section.js';
import { setBuildSectionTool } from './set-build-section.js';
import { setWrapIntroTool } from './set-wrap-intro.js';
import { appendWrapSectionTool } from './append-wrap-section.js';
import { setWrapSectionTool } from './set-wrap-section.js';

// phase (10)
import { listPhasesTool } from './list-phases.js';
import { nextPhaseTool } from './next-phase.js';
import { addPhaseTool } from './add-phase.js';
import { removePhaseTool } from './remove-phase.js';
import { movePhaseTool } from './move-phase.js';
import { setPhaseStatusTool } from './set-phase-status.js';
import { setPhaseNameTool } from './set-phase-name.js';
import { setPhaseContextTool } from './set-phase-context.js';
import { setPhaseRulesTool } from './set-phase-rules.js';
import { incrementRetryTool } from './increment-retry.js';

// ac (8)
import { addAcTool } from './add-ac.js';
import { removeAcTool } from './remove-ac.js';
import { setAcTextTool } from './set-ac-text.js';
import { setEvidenceTool } from './set-evidence.js';
import { addEvidenceTool } from './add-evidence.js';
import { setFailuresTool } from './set-failures.js';
import { clearFailuresTool } from './clear-failures.js';
import { setAcStatusTool } from './set-ac-status.js';

// field (3)
import { listFieldsTool } from './list-fields.js';
import { setFieldTool } from './set-field.js';
import { getFieldTool } from './get-field.js';

export { type AnchoredTool } from './_shared.js';

export const ALL_TOOLS: AnchoredTool[] = [
  // task-lifecycle
  createTool,
  readTool,
  setTaskStatusTool,
  setTitleTool,
  // question (V0.3 structured Q&A)
  questionAddTool,
  questionListTool,
  questionResolveTool,
  questionRetagTool,
  // context
  setIntroTool,
  appendPlanTool,
  resolveQuestionTool,
  appendBuildSectionTool,
  setBuildSectionTool,
  setWrapIntroTool,
  appendWrapSectionTool,
  setWrapSectionTool,
  // phase
  listPhasesTool,
  nextPhaseTool,
  addPhaseTool,
  removePhaseTool,
  movePhaseTool,
  setPhaseStatusTool,
  setPhaseNameTool,
  setPhaseContextTool,
  setPhaseRulesTool,
  incrementRetryTool,
  // ac
  addAcTool,
  removeAcTool,
  setAcTextTool,
  setEvidenceTool,
  addEvidenceTool,
  setFailuresTool,
  clearFailuresTool,
  setAcStatusTool,
  // field
  listFieldsTool,
  setFieldTool,
  getFieldTool,
];

// ─────────────────────────────────────────────────────────────────────
// shared helper — resolve project root from args or env (kept for any
// transport/test code that still imports it; tool files no longer need
// it since `_shared.ts:withOps` accepts the project_root arg directly)
// ─────────────────────────────────────────────────────────────────────

export function resolveProjectRoot(args: Record<string, unknown>): string {
  if (typeof args['project_root'] === 'string' && args['project_root'].length > 0) {
    return args['project_root'];
  }
  const envRoot = process.env['ANCHORED_PROJECT_ROOT'];
  if (envRoot && envRoot.length > 0) return envRoot;
  return process.cwd();
}

export function strProp(description: string): Record<string, unknown> {
  return { type: 'string', description };
}
