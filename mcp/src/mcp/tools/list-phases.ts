import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

export const listPhasesTool: AnchoredTool = {
  name: 'task__list_phases',
  description:
    'Return [{name, slug, status}] for every phase in the task — a flat overview without the AC + context detail.',
  inputSchema: zodToJsonSchema(BaseSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = BaseSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.list(input.slug);
  },
};
