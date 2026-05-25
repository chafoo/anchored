import { phaseFieldSet as phaseFieldSetOp } from '../../ops/field.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const phaseFieldSet: AnchoredTool = {
  name: 'phase_field_set',
  description:
    'Set a user-declared phase field (e.g. commit SHA, coverage_pct, pr_url). Validates the field is declared in anchored.yml task.phase.fields AND the value matches the declared type (string/number/boolean/enum).',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      phase_slug: strProp('phase slug'),
      field_name: strProp('field name as declared in anchored.yml.task.phase.fields'),
      value: {
        description: 'value to set (coerced to declared type)',
      },
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'phase_slug', 'field_name', 'value'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    await phaseFieldSetOp(
      root,
      String(args['slug']),
      String(args['phase_slug']),
      String(args['field_name']),
      args['value'],
    );
    return { ok: true, field: args['field_name'], value: args['value'] };
  },
};
