import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  id: z.string().regex(/^q[0-9]+$/, 'must be q<N> (e.g. q1, q2, q3)'),
  answer: z.string().min(1).describe('The decision/answer. Non-empty.'),
  source: z
    .enum(['user', 'ai'])
    .describe(
      "`user` = answer came from interactive Q&A; `ai` = autonomous decision under the current autonomy level. `ai` requires `reasoning`.",
    ),
  reasoning: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required when source='ai'. Forbidden when source='user'. Explains WHY the AI picked this answer — read by /impl-wrap reviewer.",
    ),
});

export const questionResolveTool: AnchoredTool = {
  name: 'task__question_resolve',
  description:
    'Resolve a structured question by id. Idempotent — re-resolving updates the fields and refreshes resolved_at. Validates source/reasoning invariants before writing. NOT the same as `task__resolve_question` (which manipulates V0.2 free-text `→ ?` markers in context.plan and will be removed in a future phase).',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.question.resolve(input.slug, input.id, {
      answer: input.answer,
      source: input.source,
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
    });
  },
};
