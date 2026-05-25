import { phaseFieldGet as phaseFieldGetOp } from '../../ops/field.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const phaseFieldGet: AnchoredTool = {
  name: 'phase_field_get',
  description:
    'Read a phase field value. Returns null if unset. Lenient — does not require the field to be declared in anchored.yml (returns whatever the parser found on disk).',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      phase_slug: strProp('phase slug'),
      field_name: strProp('field name'),
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'phase_slug', 'field_name'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    return await phaseFieldGetOp(
      root,
      String(args['slug']),
      String(args['phase_slug']),
      String(args['field_name']),
    );
  },
};
