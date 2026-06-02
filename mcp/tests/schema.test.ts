/**
 * Tests for the v2 (YAML-native) task-file schema.
 *
 * v2 is a pure-data schema — no markdown parsing, just Zod validation
 * on a parsed YAML structure. It replaces the v1 line-based parser
 * with `yaml.parse(...) → Zod.parse(...)`. Schema is the single
 * source of truth for what's valid.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTaskFile,
  safeParseTaskFile,
  SCHEMA_VERSION,
  TaskStatus,
  AcceptanceCriterion,
} from '../src/schema/task-file.js';
import { renderTaskFileYAML } from '../src/parser/render.js';
import { parseTaskFileYAML } from '../src/parser/parse.js';

// ─────────────────────────────────────────────────────────────────────
// Fixtures — V0.2 AC shape: {text, status, evidence?, failures?}
// ─────────────────────────────────────────────────────────────────────

const minimal = {
  schema_version: 2,
  slug: 'tiny-task',
  status: 'plan' as const,
  created: '2026-05-26',
  title: 'A Tiny Task',
  context: { intro: 'just a small thing.' },
  phases: [
    {
      name: 'Phase One',
      slug: 'phase-one',
      status: 'pending' as const,
      acceptance_criteria: [{ text: 'do the thing', status: 'pending' as const }],
    },
  ],
};

const maximal = {
  schema_version: 2,
  slug: 'comprehensive-task',
  status: 'build' as const,
  created: '2026-05-26',
  title: 'A Comprehensive Task',
  context: {
    intro: 'Full-featured task to exercise every schema knob.',
    plan: '- decision X\n- Q: foo?\n  → resolved: bar',
    build: {
      Implement: '- phase-one / Phase One\n  switched libraries',
      'task-check': '- phase-one / Phase One\n  verdict: pass',
      'code-check': '- phase-one / Phase One\n  verdict: pass',
    },
    wrap: {
      intro: 'Shipped 2 phases.',
      subsections: { review: 'all looks good' },
    },
  },
  phases: [
    {
      name: 'Phase One',
      slug: 'phase-one',
      status: 'done' as const,
      context: 'phase-specific briefing',
      rules: [{ path: '.claude/rules/foo.md', why: 'because' }],
      acceptance_criteria: [
        {
          text: 'first AC',
          status: 'done' as const,
          evidence: ['src/foo.ts:42 — done'],
        },
        {
          text: 'second AC',
          status: 'done' as const,
          evidence: ['src/bar.ts:13 — also done', 'pnpm test src/bar — 4/4 passing'],
        },
      ],
      commit: 'abc1234',
      coverage_pct: 87,
      retry_count: 1,
    },
    {
      name: 'Phase Two',
      slug: 'phase-two',
      status: 'deferred' as const,
      acceptance_criteria: [{ text: 'punt this', status: 'pending' as const }],
    },
  ],
  customSections: {
    'Risk Assessment': 'Some prose about risks.',
  },
};

// ─────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────

describe('TaskFile — valid inputs', () => {
  it('parses a minimal valid task-file', () => {
    const parsed = parseTaskFile(minimal);
    expect(parsed.schema_version).toBe(2);
    expect(parsed.slug).toBe('tiny-task');
    expect(parsed.phases).toHaveLength(1);
  });

  it('parses a maximal task-file with every optional field', () => {
    const parsed = parseTaskFile(maximal);
    expect(parsed.phases).toHaveLength(2);
    expect(parsed.context.plan).toContain('decision X');
    expect(parsed.context.build?.Implement).toContain('switched libraries');
    expect(parsed.context.wrap?.intro).toBe('Shipped 2 phases.');
    // extensions preserved as top-level keys on the phase
    expect(parsed.phases[0]?.commit).toBe('abc1234');
    expect(parsed.phases[0]?.coverage_pct).toBe(87);
    // retry_count is now first-class
    expect(parsed.phases[0]?.retry_count).toBe(1);
    expect(parsed.customSections?.['Risk Assessment']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// TaskStatus 6-state enum
// ─────────────────────────────────────────────────────────────────────

describe('TaskStatus — 6-state enum', () => {
  it.each(['plan', 'drafted', 'refined', 'build', 'wrap', 'done'])('accepts %s', (s) => {
    expect(() => TaskStatus.parse(s)).not.toThrow();
  });

  it('rejects an arbitrary string', () => {
    expect(() => TaskStatus.parse('foo')).toThrow();
  });

  it('rejects the v1 alias "in-progress" (phase-status, not task-status)', () => {
    expect(() => TaskStatus.parse('in-progress')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// AcceptanceCriterion — new shape (text + status + optional evidence/failures)
// ─────────────────────────────────────────────────────────────────────

describe('AcceptanceCriterion — V0.2 shape', () => {
  it('parses a pending AC with no evidence', () => {
    const ac = AcceptanceCriterion.parse({
      text: 'do the thing',
      status: 'pending',
    });
    expect(ac.status).toBe('pending');
    expect(ac.evidence).toBeUndefined();
  });

  it('parses a pending AC with failures (validation captured)', () => {
    const ac = AcceptanceCriterion.parse({
      text: 'do the thing',
      status: 'pending',
      failures: ['type-check failed in src/foo.ts:42'],
    });
    expect(ac.failures).toHaveLength(1);
  });

  it('parses a done AC with non-empty evidence array', () => {
    const ac = AcceptanceCriterion.parse({
      text: 'do the thing',
      status: 'done',
      evidence: ['src/foo.ts:42 — implemented', 'pnpm test src/foo — 4/4 passing'],
    });
    expect(ac.status).toBe('done');
    expect(ac.evidence).toHaveLength(2);
  });

  it("rejects status='done' with no evidence", () => {
    expect(() => AcceptanceCriterion.parse({ text: 'do', status: 'done' })).toThrow(
      /must have non-empty evidence/,
    );
  });

  it("rejects status='done' with empty evidence array", () => {
    expect(() => AcceptanceCriterion.parse({ text: 'do', status: 'done', evidence: [] })).toThrow();
  });

  it('rejects evidence array containing an empty string', () => {
    expect(() =>
      AcceptanceCriterion.parse({
        text: 'do',
        status: 'done',
        evidence: ['src/foo.ts:42', ''],
      }),
    ).toThrow();
  });

  it('rejects evidence array containing the legacy em-dash sentinel', () => {
    expect(() =>
      AcceptanceCriterion.parse({
        text: 'do',
        status: 'done',
        evidence: ['—'],
      }),
    ).toThrow();
  });

  it('rejects evidence array containing whitespace-only string', () => {
    expect(() =>
      AcceptanceCriterion.parse({
        text: 'do',
        status: 'done',
        evidence: ['   '],
      }),
    ).toThrow();
  });

  it('rejects failures array containing an empty string', () => {
    expect(() =>
      AcceptanceCriterion.parse({
        text: 'do',
        status: 'pending',
        failures: [''],
      }),
    ).toThrow();
  });

  it('rejects status with invalid enum value', () => {
    expect(() => AcceptanceCriterion.parse({ text: 'do', status: 'in-progress' })).toThrow();
  });

  it('rejects missing status (required field)', () => {
    expect(() => AcceptanceCriterion.parse({ text: 'do' })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Schema-version gating
// ─────────────────────────────────────────────────────────────────────

describe('TaskFile — schema_version gating', () => {
  it('rejects missing schema_version', () => {
    const { schema_version, ...rest } = minimal;
    void schema_version;
    expect(() => parseTaskFile(rest)).toThrow();
  });

  it('rejects schema_version = 1', () => {
    expect(() => parseTaskFile({ ...minimal, schema_version: 1 })).toThrow();
  });

  it('rejects schema_version = 3', () => {
    expect(() => parseTaskFile({ ...minimal, schema_version: 3 })).toThrow();
  });

  it('exposes SCHEMA_VERSION constant as 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Field validation
// ─────────────────────────────────────────────────────────────────────

describe('TaskFile — field validation', () => {
  it('rejects invalid status enum at task level', () => {
    expect(() => parseTaskFile({ ...minimal, status: 'something-else' })).toThrow();
  });

  it('rejects invalid phase status enum', () => {
    const bad = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, status: 'maybe-done' }],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('rejects non-kebab-case task slug', () => {
    expect(() => parseTaskFile({ ...minimal, slug: 'NotKebab' })).toThrow();
  });

  it('rejects non-kebab-case phase slug', () => {
    const bad = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, slug: 'NotKebab' }],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('rejects ISO-violating created date', () => {
    expect(() => parseTaskFile({ ...minimal, created: '5/26/2026' })).toThrow();
  });

  it('rejects phase with empty acceptance_criteria array', () => {
    const bad = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, acceptance_criteria: [] }],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('rejects phase with no acceptance_criteria field at all', () => {
    const { acceptance_criteria, ...phaseWithoutACs } = minimal.phases[0]!;
    void acceptance_criteria;
    expect(() => parseTaskFile({ ...minimal, phases: [phaseWithoutACs] })).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => parseTaskFile({ ...minimal, title: '' })).toThrow();
  });

  it('rejects empty AC text', () => {
    const bad = {
      ...minimal,
      phases: [
        {
          ...minimal.phases[0]!,
          acceptance_criteria: [{ text: '', status: 'pending' }],
        },
      ],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('rejects negative retry_count', () => {
    const bad = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, retry_count: -1 }],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('accepts retry_count = 0', () => {
    const ok = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, retry_count: 0 }],
    };
    expect(() => parseTaskFile(ok)).not.toThrow();
  });

  it("accepts executor = 'implement'", () => {
    const ok = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, executor: 'implement' }],
    };
    const parsed = parseTaskFile(ok);
    expect(parsed.phases[0]?.executor).toBe('implement');
  });

  it("accepts executor = 'workflow'", () => {
    const ok = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, executor: 'workflow' }],
    };
    const parsed = parseTaskFile(ok);
    expect(parsed.phases[0]?.executor).toBe('workflow');
  });

  it('rejects an out-of-enum executor value', () => {
    const bad = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, executor: 'sequential' }],
    };
    expect(() => parseTaskFile(bad)).toThrow();
  });

  it('treats a phase with no executor key as valid (default behavior unchanged)', () => {
    // minimal.phases[0] has no executor key — the field is optional and
    // the schema injects no default, so absence is valid and resolves to
    // `implement` at the build-skill layer (not in the parsed object).
    const parsed = parseTaskFile(minimal);
    expect(parsed.phases[0]?.executor).toBeUndefined();
    expect('executor' in (parsed.phases[0] as object)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// safe-parse variant
// ─────────────────────────────────────────────────────────────────────

describe('TaskFile — safeParse', () => {
  it('returns { ok: true } for valid input', () => {
    const result = safeParseTaskFile(minimal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe('tiny-task');
    }
  });

  it('returns { ok: false, error } for invalid input', () => {
    const result = safeParseTaskFile({ ...minimal, status: 'bogus' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round-trip safety — preserve unknown fields
// ─────────────────────────────────────────────────────────────────────

describe('TaskFile — extension preservation', () => {
  it('preserves arbitrary phase-level extension fields', () => {
    const withExtensions = {
      ...minimal,
      phases: [
        {
          ...minimal.phases[0]!,
          commit: 'abc1234',
          coverage_pct: 87,
          pr_url: 'https://github.com/x/y/pull/42',
          reviewed: true,
        },
      ],
    };
    const parsed = parseTaskFile(withExtensions);
    expect(parsed.phases[0]?.commit).toBe('abc1234');
    expect(parsed.phases[0]?.coverage_pct).toBe(87);
    expect(parsed.phases[0]?.pr_url).toBe('https://github.com/x/y/pull/42');
    expect(parsed.phases[0]?.reviewed).toBe(true);
  });

  it('round-trips a phase with no executor key byte-identically (non-destructive)', () => {
    // AC4: an existing task-file fixture that never carried `executor`
    // must serialize → parse → serialize stably, with no spurious
    // `executor` key injected by the extended schema.
    const firstRender = renderTaskFileYAML(parseTaskFile(minimal));
    // The serialized YAML must not contain the new key at all.
    expect(firstRender).not.toContain('executor');
    // And a full round-trip through the real parse layer is a fixed point.
    const reparsed = parseTaskFileYAML(firstRender);
    const secondRender = renderTaskFileYAML(reparsed);
    expect(secondRender).toBe(firstRender);
    expect('executor' in (reparsed.phases[0] as object)).toBe(false);
  });

  it('preserves an explicit executor value through a full round-trip', () => {
    const withExecutor = {
      ...minimal,
      phases: [{ ...minimal.phases[0]!, executor: 'workflow' as const }],
    };
    const firstRender = renderTaskFileYAML(parseTaskFile(withExecutor));
    expect(firstRender).toContain('executor: workflow');
    const secondRender = renderTaskFileYAML(parseTaskFileYAML(firstRender));
    expect(secondRender).toBe(firstRender);
  });

  it('preserves customSections as a string-keyed map', () => {
    const withSections = {
      ...minimal,
      customSections: {
        'Risk Assessment': 'risk prose',
        Glossary: 'glossary content',
      },
    };
    const parsed = parseTaskFile(withSections);
    expect(parsed.customSections?.['Risk Assessment']).toBe('risk prose');
    expect(parsed.customSections?.['Glossary']).toBe('glossary content');
  });
});
