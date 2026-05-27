import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  text: z.string().min(1),
  status: z.enum(['pending', 'done']).optional(),
  evidence: z.array(z.string()).optional(),
  failures: z.array(z.string()).optional(),
});

export const addAcTool: AnchoredTool = {
  name: 'task__add_ac',
  description:
    'Append a new acceptance criterion to phase.acceptance_criteria. Status defaults to "pending"; status="done" requires non-empty evidence.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const { project_root, slug, phase_slug, ...rest } = InputSchema.parse(args);
    const ops = await withOps(project_root);
    return ops.task.phase.ac.add(slug, phase_slug, rest as never);
  },
};
