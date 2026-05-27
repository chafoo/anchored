import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  target: z.union([
    z.object({ after: z.string().min(1) }),
    z.object({ before: z.string().min(1) }),
    z.object({ to: z.enum(['start', 'end']) }),
  ]),
});

export const movePhaseTool: AnchoredTool = {
  name: 'task__move_phase',
  description:
    'Reorder a phase. `target` is one of {after: slug} | {before: slug} | {to: "start"|"end"}. The insert index resolves AFTER the removal, so `after: foo` means "after foo\'s current position".',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.move(input.slug, input.phase_slug, input.target);
  },
};
