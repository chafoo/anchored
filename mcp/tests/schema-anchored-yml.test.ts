/**
 * Tests for the V0.2 anchored.yml schema shape.
 *
 * Verifies:
 *   - per-stage typed configs (plan, refine, build, wrap)
 *   - strict reserved-slot shape (instructions-only, no `enabled` flag)
 *   - build.retry_limit positive-integer guard
 *   - rejection of removed slots (build.commit)
 *   - rejection of renamed config keys (legacy task_check / code_check)
 *   - top-level strict rejects unknown root keys
 */

import { describe, it, expect } from 'vitest';
import { parseAnchoredYml, safeParseAnchoredYml } from '../src/schema/anchored-yml.js';

// ─────────────────────────────────────────────────────────────────────
// Happy-path: defaults + minimal config
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — defaults', () => {
  it('parses an empty config with all defaults applied', () => {
    const parsed = parseAnchoredYml({});
    expect(parsed.plan.steps).toEqual([]);
    expect(parsed.refine.steps).toEqual([]);
    expect(parsed.refine.plan_check).toEqual({});
    expect(parsed.refine.rules_check).toEqual({});
    expect(parsed.build.steps).toEqual([]);
    expect(parsed.build.retry_limit).toBe(3);
    expect(parsed.build.task_validate).toEqual({});
    expect(parsed.build.code_validate).toEqual({});
    expect(parsed.build.stop_check).toEqual({});
    expect(parsed.wrap.steps).toEqual([]);
    expect(parsed.task.phase.fields).toEqual([]);
  });

  it('parses null / undefined as defaults', () => {
    expect(() => parseAnchoredYml(null)).not.toThrow();
    expect(() => parseAnchoredYml(undefined)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Step shape (run | use)
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — step shape', () => {
  it('accepts a step with `run` (prose)', () => {
    const parsed = parseAnchoredYml({
      plan: { steps: [{ name: 'explore', run: 'open the codebase and read entrypoints' }] },
    });
    expect(parsed.plan.steps).toHaveLength(1);
    expect(parsed.plan.steps[0]!.run).toContain('open');
  });

  it('accepts a step with `use` (named tool)', () => {
    const parsed = parseAnchoredYml({
      build: { steps: [{ name: 'implement', use: 'anchored/implement' }] },
    });
    expect(parsed.build.steps[0]!.use).toBe('anchored/implement');
  });

  it('rejects a step with BOTH run and use', () => {
    expect(() =>
      parseAnchoredYml({
        plan: { steps: [{ name: 'x', run: 'do thing', use: 'some/tool' }] },
      }),
    ).toThrow();
  });

  it('rejects a step with NEITHER run nor use', () => {
    expect(() =>
      parseAnchoredYml({
        plan: { steps: [{ name: 'x' }] },
      }),
    ).toThrow();
  });

  it('rejects a step with empty name', () => {
    expect(() =>
      parseAnchoredYml({
        plan: { steps: [{ name: '', run: 'do' }] },
      }),
    ).toThrow();
  });

  it('accepts a `use` step with type: skill', () => {
    const parsed = parseAnchoredYml({
      wrap: { steps: [{ name: 'docu-scan', use: 'docu-scan', type: 'skill' }] },
    });
    expect(parsed.wrap.steps[0]!.type).toBe('skill');
  });

  it('accepts a `use` step with type: agent', () => {
    const parsed = parseAnchoredYml({
      wrap: { steps: [{ name: 'review', use: 'pr-reviewer', type: 'agent' }] },
    });
    expect(parsed.wrap.steps[0]!.type).toBe('agent');
  });

  it('leaves type undefined when omitted (consumer defaults to agent)', () => {
    const parsed = parseAnchoredYml({
      build: { steps: [{ name: 'implement', use: 'anchored/implement' }] },
    });
    expect(parsed.build.steps[0]!.type).toBeUndefined();
  });

  it('accepts a `use` step with instructions (per-step prose)', () => {
    const parsed = parseAnchoredYml({
      wrap: {
        steps: [
          { name: 'docu-scan', use: 'docu-scan', type: 'skill', instructions: 'extra context' },
        ],
      },
    });
    expect(parsed.wrap.steps[0]!.instructions).toBe('extra context');
  });

  it('rejects an invalid type value', () => {
    expect(() =>
      parseAnchoredYml({
        wrap: { steps: [{ name: 'x', use: 'some-tool', type: 'mcp' }] },
      }),
    ).toThrow();
  });

  it('rejects type on a `run` step (no worker to type)', () => {
    expect(() =>
      parseAnchoredYml({
        build: { steps: [{ name: 'lint', run: 'bun run check', type: 'agent' }] },
      }),
    ).toThrow();
  });

  it('accepts instructions on a `run` step (universal self-documentation)', () => {
    const parsed = parseAnchoredYml({
      build: {
        steps: [
          {
            name: 'commit',
            run: 'git commit -am phase',
            instructions: 'Phase = one commit; captures the SHA into the commit phase field.',
          },
        ],
      },
    });
    expect(parsed.build.steps[0]!.run).toContain('git');
    expect(parsed.build.steps[0]!.instructions).toContain('Phase = one commit');
    expect(parsed.build.steps[0]!.type).toBeUndefined();
  });

  it('rejects empty-string instructions', () => {
    expect(() =>
      parseAnchoredYml({
        wrap: { steps: [{ name: 'x', use: 'some-tool', instructions: '' }] },
      }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// refine: steps + plan_check + rules_check
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — refine stage', () => {
  it('accepts refine.steps', () => {
    const parsed = parseAnchoredYml({
      refine: { steps: [{ name: 'custom-refine-step', run: 'do refinement' }] },
    });
    expect(parsed.refine.steps).toHaveLength(1);
  });

  it('accepts refine.plan_check.instructions', () => {
    const parsed = parseAnchoredYml({
      refine: { plan_check: { instructions: 'audit phases for coverage' } },
    });
    expect(parsed.refine.plan_check.instructions).toContain('audit');
  });

  it('accepts refine.rules_check.instructions', () => {
    const parsed = parseAnchoredYml({
      refine: { rules_check: { instructions: 'audit applicable rules' } },
    });
    expect(parsed.refine.rules_check.instructions).toContain('audit');
  });

  it('rejects refine.plan_check.enabled (legacy field — schema is strict)', () => {
    expect(() =>
      parseAnchoredYml({
        refine: { plan_check: { enabled: false } },
      }),
    ).toThrow();
  });

  it('rejects refine.rules_check.enabled (legacy field — schema is strict)', () => {
    expect(() =>
      parseAnchoredYml({
        refine: { rules_check: { enabled: true } },
      }),
    ).toThrow();
  });

  it('rejects unknown reserved slot inside refine', () => {
    expect(() =>
      parseAnchoredYml({
        refine: { spell_check: { instructions: 'oops' } },
      }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// build: steps + retry_limit + task_validate + code_validate
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — build stage', () => {
  it('accepts build.retry_limit = 5', () => {
    const parsed = parseAnchoredYml({ build: { retry_limit: 5 } });
    expect(parsed.build.retry_limit).toBe(5);
  });

  it('accepts build.retry_limit = 1 (boundary)', () => {
    const parsed = parseAnchoredYml({ build: { retry_limit: 1 } });
    expect(parsed.build.retry_limit).toBe(1);
  });

  it('rejects build.retry_limit = 0', () => {
    expect(() => parseAnchoredYml({ build: { retry_limit: 0 } })).toThrow();
  });

  it('rejects build.retry_limit = -1', () => {
    expect(() => parseAnchoredYml({ build: { retry_limit: -1 } })).toThrow();
  });

  it('rejects build.retry_limit = 1.5 (must be integer)', () => {
    expect(() => parseAnchoredYml({ build: { retry_limit: 1.5 } })).toThrow();
  });

  it('accepts build.task_validate.instructions', () => {
    const parsed = parseAnchoredYml({
      build: { task_validate: { instructions: 'verify ACs proven' } },
    });
    expect(parsed.build.task_validate.instructions).toContain('verify');
  });

  it('accepts build.code_validate.instructions', () => {
    const parsed = parseAnchoredYml({
      build: { code_validate: { instructions: 'check rules adherence' } },
    });
    expect(parsed.build.code_validate.instructions).toContain('rules');
  });

  it('rejects legacy build.commit slot (VCS-agnostic — no commit handling in V0.2)', () => {
    expect(() => parseAnchoredYml({ build: { commit: { enabled: true } } })).toThrow();
  });

  it('rejects renamed slot build.task_check (was task_check, now task_validate)', () => {
    expect(() => parseAnchoredYml({ build: { task_check: { instructions: 'x' } } })).toThrow();
  });

  it('rejects renamed slot build.code_check (was code_check, now code_validate)', () => {
    expect(() => parseAnchoredYml({ build: { code_check: { instructions: 'x' } } })).toThrow();
  });

  it('rejects build.task_validate.enabled (instructions-only slot)', () => {
    expect(() => parseAnchoredYml({ build: { task_validate: { enabled: true } } })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// build: implement reserved slot + global stop-conditions
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — build.implement slot', () => {
  it('accepts build.implement.instructions (resolves SKILL.md:138 latent bug)', () => {
    const parsed = parseAnchoredYml({
      build: { implement: { instructions: 'always TDD: red → green → refactor' } },
    });
    expect(parsed.build.implement.instructions).toContain('TDD');
  });

  it('applies an empty implement slot by default', () => {
    const parsed = parseAnchoredYml({});
    expect(parsed.build.implement).toEqual({});
  });

  it('rejects build.implement.enabled (instructions-only reserved slot)', () => {
    expect(() => parseAnchoredYml({ build: { implement: { enabled: true } } })).toThrow();
  });
});

describe('anchored.yml — build.stop_check slot', () => {
  it('accepts build.stop_check.instructions (enriches the stop-check evaluator)', () => {
    const parsed = parseAnchoredYml({
      build: {
        stop_check: { instructions: 'also halt if a new external dependency is introduced' },
      },
    });
    expect(parsed.build.stop_check.instructions).toContain('external dependency');
  });

  it('applies an empty stop_check slot by default', () => {
    const parsed = parseAnchoredYml({});
    expect(parsed.build.stop_check).toEqual({});
  });

  it('rejects build.stop_check.enabled (instructions-only reserved slot — strict)', () => {
    expect(() => parseAnchoredYml({ build: { stop_check: { enabled: true } } })).toThrow();
  });
});

describe('anchored.yml — build.stop (global stop-conditions)', () => {
  it('ships the default ON with the single plan-deviation rule', () => {
    const parsed = parseAnchoredYml({});
    expect(parsed.build.stop).toEqual(['a decision deviates from the plan']);
  });

  it('accepts a custom build.stop array of natural-language strings', () => {
    const parsed = parseAnchoredYml({
      build: { stop: ['a decision deviates from the plan', 'a test is deleted to pass a gate'] },
    });
    expect(parsed.build.stop).toHaveLength(2);
    expect(parsed.build.stop[1]).toContain('test is deleted');
  });

  it('accepts an empty build.stop array (valid fully-autonomous state)', () => {
    const parsed = parseAnchoredYml({ build: { stop: [] } });
    expect(parsed.build.stop).toEqual([]);
  });

  it('rejects an empty-string stop rule (each rule must be non-empty)', () => {
    expect(() => parseAnchoredYml({ build: { stop: [''] } })).toThrow();
  });

  it('rejects a non-array build.stop', () => {
    expect(() => parseAnchoredYml({ build: { stop: 'stop on everything' } })).toThrow();
  });

  it('still .strict()-rejects an unknown key under build alongside valid stop', () => {
    expect(() => parseAnchoredYml({ build: { stop: ['x'], bogus_slot: true } })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Top-level strictness
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — top-level strictness', () => {
  it('rejects unknown top-level keys', () => {
    expect(() =>
      parseAnchoredYml({
        plan: {},
        refine: {},
        build: {},
        wrap: {},
        unknown_stage: {},
      }),
    ).toThrow();
  });

  it('safeParse returns ok=false on invalid input', () => {
    const result = safeParseAnchoredYml({ build: { retry_limit: 0 } });
    expect(result.ok).toBe(false);
  });

  it('safeParse returns ok=true on valid input', () => {
    const result = safeParseAnchoredYml({
      build: { retry_limit: 3 },
    });
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// task.phase.fields — extension declarations (unchanged from prior tests)
// ─────────────────────────────────────────────────────────────────────

describe('anchored.yml — task.phase.fields', () => {
  it('accepts a string-typed phase field decl', () => {
    const parsed = parseAnchoredYml({
      task: { phase: { fields: [{ name: 'commit', type: 'string' }] } },
    });
    expect(parsed.task.phase.fields).toHaveLength(1);
    expect(parsed.task.phase.fields[0]!.name).toBe('commit');
  });

  it('rejects non-snake_case field name', () => {
    expect(() =>
      parseAnchoredYml({
        task: { phase: { fields: [{ name: 'BadName', type: 'string' }] } },
      }),
    ).toThrow();
  });

  it('rejects enum field without values', () => {
    expect(() =>
      parseAnchoredYml({
        task: { phase: { fields: [{ name: 'kind', type: 'enum' }] } },
      }),
    ).toThrow();
  });
});
