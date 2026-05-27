import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  content: z.string(),
});

export const setPhaseContextTool: AnchoredTool = {
  name: 'task__set_phase_context',
  description: 'Replace phase.context — the per-phase implementation notes.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.context.set(input.slug, input.phase_slug, input.content);
  },
};
