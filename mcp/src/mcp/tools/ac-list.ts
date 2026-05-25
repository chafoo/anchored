import { acList as acListOp } from '../../ops/core.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const acList: AnchoredTool = {
  name: 'ac_list',
  description:
    'List all acceptance criteria for a phase with their current evidence strings. Useful for the implement agent\'s resume-safety check ("which ACs already have evidence?").',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      phase_slug: strProp('phase slug'),
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'phase_slug'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    return await acListOp(
      root,
      String(args['slug']),
      String(args['phase_slug']),
    );
  },
};
