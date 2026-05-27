import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  section: z.string().min(1),
  content: z.string(),
});

export const setBuildSectionTool: AnchoredTool = {
  name: 'task__set_build_section',
  description:
    'Replace (or create) a named subsection under context.build with the provided content. Used when wholesale-rewriting a build subsection.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.build
      .subsection(input.section)
      .set(input.slug, input.content);
  },
};
