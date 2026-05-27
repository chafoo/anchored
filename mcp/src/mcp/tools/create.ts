import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  title: z.string().min(1),
  created: z.string().optional(),
  intro: z.string().optional(),
  phases: z.array(z.unknown()).optional(),
});

export const createTool: AnchoredTool = {
  name: 'task__create',
  description:
    'Create a new task-file at .claude/tasks/<slug>.yml. Refuses to clobber an existing file. Only `title` is required; other fields default sensibly.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    const { project_root: _p, slug, ...initial } = input;
    return ops.task.create(slug, initial as never);
  },
};
