import { acEvidenceSet as acEvidenceSetOp } from '../../ops/core.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const acEvidenceSet: AnchoredTool = {
  name: 'ac_evidence_set',
  description:
    'Set the evidence string for one acceptance criterion. Rejects empty/sentinel values — setting evidence signals completion, so it must reference something concrete (file:line, command + outcome, test name + result, or commit SHA).',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      phase_slug: strProp('phase slug'),
      ac_index: {
        type: 'integer',
        description: '0-based index of the criterion within the phase',
        minimum: 0,
      },
      evidence: strProp('concrete evidence string (file:line | command + outcome | test-name)'),
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'phase_slug', 'ac_index', 'evidence'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    await acEvidenceSetOp(
      root,
      String(args['slug']),
      String(args['phase_slug']),
      Number(args['ac_index']),
      String(args['evidence']),
    );
    return { ok: true, ac_index: args['ac_index'] };
  },
};
