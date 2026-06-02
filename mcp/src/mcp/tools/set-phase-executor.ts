import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseExecutor } from '../../schema/task-file.js';
import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  executor: PhaseExecutor,
});

export const setPhaseExecutorTool: AnchoredTool = {
  name: 'task__set_phase_executor',
  description:
    'Set which worker runs this phase during build: executor="implement" (default sequential implement worker) or "workflow" (nested sub-workflow). Plan/refine-time write-path — does NOT change phase status or trigger a state-machine transition.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.executor.set(input.slug, input.phase_slug, input.executor);
  },
};
