import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

export const readTool: AnchoredTool = {
  name: 'task__read',
  description:
    'Read the full parsed task-file as JSON. Source-of-truth view of phases, ACs, and Context subsections.',
  inputSchema: zodToJsonSchema(BaseSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = BaseSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.read(input.slug);
  },
};
