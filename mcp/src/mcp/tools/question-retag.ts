import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  id: z.string().regex(/^q[0-9]+$/, 'must be q<N> (e.g. q1, q2, q3)'),
  priority: z.enum(['low', 'medium', 'high']),
});

export const questionRetagTool: AnchoredTool = {
  name: 'task__question_retag',
  description:
    'Change the priority of an existing question. Used by plan-check / rules-check when they disagree with the priority the plan-agent originally assigned (e.g. plan-agent tagged a UX decision as low; plan-check upgrades to medium). Text + answer + status are unchanged.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.question.retag(input.slug, input.id, input.priority);
  },
};
