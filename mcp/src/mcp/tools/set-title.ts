import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  title: z.string().min(1),
});

export const setTitleTool: AnchoredTool = {
  name: 'task__set_title',
  description: 'Rename the task — overwrites task.title with the provided string.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.title.set(input.slug, input.title);
  },
};
