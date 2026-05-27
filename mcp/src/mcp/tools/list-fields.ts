import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { withOps, type AnchoredTool } from './_shared.js';

const InputSchema = z.object({
  project_root: z.string().min(1),
});

export const listFieldsTool: AnchoredTool = {
  name: 'task__list_fields',
  description:
    'List the declared phase fields from anchored.yml.task.phase.fields. Returns [{name, type}, ...]. Pure introspection — no IO on task-files.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.field.list();
  },
};
