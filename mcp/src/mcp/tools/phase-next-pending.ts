import { phaseNextPending as phaseNextPendingOp } from '../../ops/core.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const phaseNextPending: AnchoredTool = {
  name: 'phase_next_pending',
  description:
    'Return the next phase whose status is pending or in-progress (in-progress preferred for resume-safety). Returns null when all phases are terminal — that\'s the signal to transition the task to wrap.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      project_root: strProp('project root (optional)'),
    },
    required: ['slug'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    const phase = await phaseNextPendingOp(root, String(args['slug']));
    return phase; // null is a valid result
  },
};
