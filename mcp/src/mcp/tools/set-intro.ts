import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  content: z.string(),
});

export const setIntroTool: AnchoredTool = {
  name: 'task__set_intro',
  description:
    'Replace context.intro — the opening prose of the task. Used in plan stage to record the task summary.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.intro.set(input.slug, input.content);
  },
};
