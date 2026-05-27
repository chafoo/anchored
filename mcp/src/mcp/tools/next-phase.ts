import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

export const nextPhaseTool: AnchoredTool = {
  name: 'task__next_phase',
  description:
    'Return the next phase to work on. Resume-safety: in-progress wins over pending; null when all phases are terminal (signal to transition the task to wrap).',
  inputSchema: zodToJsonSchema(BaseSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = BaseSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.next(input.slug);
  },
};
