import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  content: z.string(),
});

export const appendPlanTool: AnchoredTool = {
  name: 'task__append_plan',
  description:
    'Append markdown to context.plan. Used by the plan agent to grow the plan section incrementally; empty/whitespace content is a no-op.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.plan.append(input.slug, input.content);
  },
};
