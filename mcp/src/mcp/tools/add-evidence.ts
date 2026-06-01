import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = AcSchema.extend({
  line: z.string().min(1),
});

export const addEvidenceTool: AnchoredTool = {
  name: 'task__add_evidence',
  description:
    'Append a single evidence line to an AC. Atomically: sets status → "done" (evidence is proof the AC is met) and clears any failures field. Useful for incremental capture.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.evidence.add(input.slug, input.phase_slug, input.ac_index, input.line);
  },
};
