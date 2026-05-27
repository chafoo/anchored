import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Filter to a single priority. Omit to return all.'),
  status: z
    .enum(['open', 'resolved'])
    .optional()
    .describe('Filter by status. Omit to return both.'),
  phase: z
    .string()
    .min(1)
    .optional()
    .describe('Filter to questions attached to a specific phase slug.'),
});

export const questionListTool: AnchoredTool = {
  name: 'task__question_list',
  description:
    'List structured questions on a task, optionally filtered by priority / status / phase. Returns in insertion order (stable for Q&A loops). Used by /impl-refine stage 0 (count by priority) + stage 3 (drive the loop) + /impl-build pre-flight gate.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    const filter: Record<string, string> = {};
    if (input.priority !== undefined) filter['priority'] = input.priority;
    if (input.status !== undefined) filter['status'] = input.status;
    if (input.phase !== undefined) filter['phase'] = input.phase;
    return ops.task.question.list(
      input.slug,
      Object.keys(filter).length === 0
        ? undefined
        : (filter as Parameters<typeof ops.task.question.list>[1]),
    );
  },
};
