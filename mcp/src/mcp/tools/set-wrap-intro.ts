import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  content: z.string(),
});

export const setWrapIntroTool: AnchoredTool = {
  name: 'task__set_wrap_intro',
  description:
    'Set context.wrap.intro — the opening prose of the wrap stage. Used by the wrap agent to record the rollup summary.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.wrap.intro.set(input.slug, input.content);
  },
};
