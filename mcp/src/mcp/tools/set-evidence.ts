import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = AcSchema.extend({
  evidence: z.array(z.string().min(1)).min(1),
});

export const setEvidenceTool: AnchoredTool = {
  name: 'task__set_evidence',
  description:
    'Set evidence (string[]) for an acceptance criterion. Atomically: flips status to "done" and clears any existing failures field. Single write.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.evidence.set(
      input.slug,
      input.phase_slug,
      input.ac_index,
      input.evidence,
    );
  },
};
