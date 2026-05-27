import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseStatus } from '../../schema/task-file.js';
import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  status: PhaseStatus,
});

export const setPhaseStatusTool: AnchoredTool = {
  name: 'task__set_phase_status',
  description:
    'Transition a phase status, enforcing the state machine. status="done" requires every AC to already be status="done" — call ac.evidence.set first.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.status.set(input.slug, input.phase_slug, input.status);
  },
};
