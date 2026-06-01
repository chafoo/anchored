import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  text: z.string().min(1).describe('The question prose — what is ambiguous?'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .describe(
      'low=cosmetic/tweakable; medium=UX or structure; high=product direction/scope. Tag by impact, not difficulty.',
    ),
  origin: z
    .enum([
      'plan-agent',
      'plan-check',
      'rules-check',
      'task-validate',
      'code-validate',
      'stop-check',
      'user',
    ])
    .describe('Which agent/role surfaced this question.'),
  phase: z.string().min(1).optional().describe('Optional phase slug the question pertains to.'),
});

export const questionAddTool: AnchoredTool = {
  name: 'task__question_add',
  description:
    'Add a structured Q&A item to the task. Each call assigns a sequential id (q1, q2, q3, ...). Status starts as `open`. Used by plan-agent, plan-check, rules-check, task-validate, code-validate, and the build-time stop-check (to escalate a STOP-verdict decision) whenever they surface ambiguity.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.question.add(input.slug, {
      text: input.text,
      priority: input.priority,
      origin: input.origin,
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
    });
  },
};
