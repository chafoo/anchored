import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseStatus, PhaseRule } from '../../schema/task-file.js';
import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  name: z.string().min(1),
  phase_slug: z.string().min(1),
  status: PhaseStatus.optional(),
  context: z.string().optional(),
  rules: z.array(PhaseRule).optional(),
  acceptance_criteria: z.array(z.unknown()).optional(),
  position: z
    .union([
      z.object({ after: z.string().min(1) }),
      z.object({ before: z.string().min(1) }),
      z.object({ to: z.enum(['start', 'end']) }),
    ])
    .optional(),
});

export const addPhaseTool: AnchoredTool = {
  name: 'task__add_phase',
  description:
    'Add a new phase. `position` defaults to {to: "end"}; pass {after|before|to} to insert elsewhere. Refuses duplicate slugs.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const { project_root, slug, phase_slug, position, ...rest } = InputSchema.parse(args);
    const ops = await withOps(project_root);
    return ops.task.phase.add(slug, { slug: phase_slug, ...rest } as never, position);
  },
};
