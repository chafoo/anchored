import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  q_index: z.number().int().nonnegative(),
  resolution: z.string().min(1),
});

export const resolveQuestionTool: AnchoredTool = {
  name: 'task__resolve_question',
  description:
    'Replace the q_index-th `→ ?` refinement marker in context.plan with `→ <resolution>`. Throws RefinementMarkerNotFound when the index is out of range.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.plan.refinement.resolve(input.slug, input.q_index, input.resolution);
  },
};
