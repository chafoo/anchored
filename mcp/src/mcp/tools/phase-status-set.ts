import { phaseStatusSet as phaseStatusSetOp } from '../../ops/core.js';
import { PhaseStatus } from '../../schema/task-file.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const phaseStatusSet: AnchoredTool = {
  name: 'phase_status_set',
  description:
    'Set a phase\'s status, enforcing the per-phase state machine (pending → in-progress → done | blocked | deferred; blocked → pending|in-progress retry).',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      phase_slug: strProp('phase slug (internal id from the <!-- id: ... --> comment)'),
      status: {
        type: 'string',
        enum: ['pending', 'in-progress', 'done', 'blocked', 'deferred'],
        description: 'target phase status',
      },
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'phase_slug', 'status'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    const status = PhaseStatus.parse(args['status']);
    await phaseStatusSetOp(
      root,
      String(args['slug']),
      String(args['phase_slug']),
      status,
    );
    return { ok: true, status };
  },
};
