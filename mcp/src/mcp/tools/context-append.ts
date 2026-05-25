import { contextAppend as contextAppendOp, type ContextSection } from '../../ops/core.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const contextAppend: AnchoredTool = {
  name: 'context_append',
  description:
    'Append content to a ## Context sub-section. Use section="Plan" with no subsection for plan-agent decisions/Q&A; section="Build" with subsection="Implement"/"task-check"/"code-check" for per-phase audit entries; section="Wrap" with optional subsection (use subsection="review" for /review findings, null for TL;DR prose). On-demand: H4 sub-sections are created if they don\'t yet exist.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      section: {
        type: 'string',
        enum: ['Plan', 'Build', 'Wrap'],
        description: 'which ## Context sub-section to target',
      },
      subsection: {
        type: ['string', 'null'],
        description:
          'H4 sub-section name (required for Build; optional for Wrap; null for Plan)',
      },
      content: strProp('markdown content to append'),
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'section', 'content'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    const subsection = args['subsection'];
    await contextAppendOp(
      root,
      String(args['slug']),
      String(args['section']) as ContextSection,
      typeof subsection === 'string' && subsection.length > 0 ? subsection : null,
      String(args['content']),
    );
    return { ok: true };
  },
};
