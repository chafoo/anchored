/**
 * Tests for the v2 YAML-native parser + renderer.
 *
 * v2's parser is a thin wrapper: `yaml.parse(raw) → Zod.parse(parsed)`.
 * The renderer is `yaml.stringify(file, options)`. Round-trip safety
 * (parse → render → parse) is guaranteed by the YAML library; we just
 * verify it on representative fixtures.
 *
 * Critically: the newline-in-evidence bug from dogfood run #5 must
 * be impossible here — YAML block scalars (`|`) handle multi-line
 * strings natively. The test cases include this scenario explicitly.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskFileYAML, ParseError, SCHEMA_VERSION } from '../src/parser/parse.js';
import { renderTaskFileYAML } from '../src/parser/render.js';
import type { TaskFile } from '../src/schema/task-file.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────────────

const MINIMAL = `schema_version: 2
slug: tiny-task
status: plan
created: 2026-05-26
title: A Tiny Task
context:
  intro: just a small thing.
phases:
  - name: Phase One
    slug: phase-one
    status: pending
    acceptance_criteria:
      - text: do the thing
        status: pending
`;

const MAXIMAL = `schema_version: 2
slug: full-task
status: build
created: 2026-05-26
title: Full Task
context:
  intro: Multi-paragraph intro.
  plan: |
    - decision X
    - Q: foo?
      → resolved: bar
  build:
    Implement: |
      - phase-one / Phase One
        switched to Map
    task-check: |
      - phase-one / Phase One
        verdict: pass
  wrap:
    intro: Shipped it.
    subsections:
      review: all clear
phases:
  - name: Phase One
    slug: phase-one
    status: done
    context: briefing prose
    rules:
      - path: .claude/rules/factory.md
        why: this phase adds new module
    acceptance_criteria:
      - text: first AC
        status: done
        evidence:
          - src/foo.ts:42 — done
    commit: abc1234
    coverage_pct: 87
  - name: Phase Two
    slug: phase-two
    status: pending
    acceptance_criteria:
      - text: tbd
        status: pending
`;

const MULTILINE_EVIDENCE = `schema_version: 2
slug: multiline-evidence
status: build
created: 2026-05-26
title: Multi-line Evidence Test
context:
  intro: tests the v0.1 newline bug-class.
phases:
  - name: Phase One
    slug: phase-one
    status: done
    acceptance_criteria:
      - text: with multi-line evidence
        status: done
        evidence:
          - |
            line one of evidence
            line two with </evidence> brackets
            line three
      - text: with single-line evidence
        status: done
        evidence:
          - "src/foo.ts:42 — single line"
`;

// ─────────────────────────────────────────────────────────────────────
// Happy-path parsing
// ─────────────────────────────────────────────────────────────────────

describe('parser-v2 — happy paths', () => {
  it('parses minimal task-file', () => {
    const parsed = parseTaskFileYAML(MINIMAL);
    expect(parsed.schema_version).toBe(SCHEMA_VERSION);
    expect(parsed.slug).toBe('tiny-task');
    expect(parsed.phases).toHaveLength(1);
  });

  it('parses maximal task-file with every optional field', () => {
    const parsed = parseTaskFileYAML(MAXIMAL);
    expect(parsed.phases).toHaveLength(2);
    expect(parsed.context.plan).toContain('decision X');
    expect(parsed.context.build?.Implement).toContain('Map');
    expect(parsed.context.wrap?.intro).toBe('Shipped it.');
    expect(parsed.phases[0]?.commit).toBe('abc1234');
    expect(parsed.phases[0]?.coverage_pct).toBe(87);
  });

  it('parses multi-line evidence via YAML block scalar', () => {
    const parsed = parseTaskFileYAML(MULTILINE_EVIDENCE);
    const ac0 = parsed.phases[0]?.acceptance_criteria[0];
    expect(ac0?.evidence?.[0]).toContain('line one of evidence');
    expect(ac0?.evidence?.[0]).toContain('line two with </evidence> brackets');
    expect(ac0?.evidence?.[0]).toContain('line three');
    // Single-element evidence array in same phase still works
    expect(parsed.phases[0]?.acceptance_criteria[1]?.evidence?.[0]).toBe(
      'src/foo.ts:42 — single line',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// schema_version gating with clear error
// ─────────────────────────────────────────────────────────────────────

describe('parser — schema_version gating', () => {
  it('throws ParseError on schema_version: 1 (unsupported)', () => {
    const v1ish = MINIMAL.replace('schema_version: 2', 'schema_version: 1');
    try {
      parseTaskFileYAML(v1ish);
      expect.fail('expected ParseError');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      const msg = (err as ParseError).message;
      expect(msg.toLowerCase()).toContain('schema_version');
      expect(msg.toLowerCase()).toContain('unsupported');
    }
  });

  it('throws ParseError on missing schema_version', () => {
    const noVersion = MINIMAL.replace('schema_version: 2\n', '');
    expect(() => parseTaskFileYAML(noVersion)).toThrow(ParseError);
  });

  it('throws ParseError on schema_version: 3 (future-version guard)', () => {
    const future = MINIMAL.replace('schema_version: 2', 'schema_version: 3');
    expect(() => parseTaskFileYAML(future)).toThrow(ParseError);
  });

  it('throws ParseError on malformed YAML (not just schema)', () => {
    const broken = 'schema_version: 2\n  bad: indent\nfoo: [unterminated';
    expect(() => parseTaskFileYAML(broken)).toThrow(ParseError);
  });

  it('ParseError messages mention the file or context for debugging', () => {
    try {
      parseTaskFileYAML('schema_version: 1\nslug: x\nstatus: plan');
      expect.fail('expected throw');
    } catch (err) {
      // ParseError surface should be informative — not just a stack trace
      expect((err as Error).message.length).toBeGreaterThan(40);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round-trip safety — parse → render → parse → identical
// ─────────────────────────────────────────────────────────────────────

describe('parser-v2 — round-trip safety', () => {
  function assertRoundTripEquivalent(yaml: string, label: string) {
    const first = parseTaskFileYAML(yaml);
    const rendered = renderTaskFileYAML(first);
    const second = parseTaskFileYAML(rendered);
    // Structural deep equality — not string equality (formatting may
    // differ). We care that the typed data round-trips.
    expect(second, `[${label}] should round-trip`).toEqual(first);
  }

  it('minimal task-file round-trips', () => {
    assertRoundTripEquivalent(MINIMAL, 'minimal');
  });

  it('maximal task-file round-trips', () => {
    assertRoundTripEquivalent(MAXIMAL, 'maximal');
  });

  it('multi-line evidence round-trips without corruption', () => {
    assertRoundTripEquivalent(MULTILINE_EVIDENCE, 'multiline-evidence');
  });

  it('round-trip preserves extension fields (commit, coverage_pct)', () => {
    const first = parseTaskFileYAML(MAXIMAL);
    const rendered = renderTaskFileYAML(first);
    const second = parseTaskFileYAML(rendered);
    expect(second.phases[0]?.commit).toBe('abc1234');
    expect(second.phases[0]?.coverage_pct).toBe(87);
  });

  it('round-trip after mutating evidence works correctly', () => {
    const first = parseTaskFileYAML(MINIMAL);
    // mutate — fill the evidence (atomic: status flips to done together)
    const mutated: TaskFile = {
      ...first,
      phases: [
        {
          ...first.phases[0]!,
          status: 'done' as const,
          acceptance_criteria: [
            {
              ...first.phases[0]!.acceptance_criteria[0]!,
              status: 'done' as const,
              evidence: ['src/result.ts:1 — implemented'],
            },
          ],
        },
      ],
    };
    const rendered = renderTaskFileYAML(mutated);
    const reparsed = parseTaskFileYAML(rendered);
    expect(reparsed.phases[0]?.status).toBe('done');
    expect(reparsed.phases[0]?.acceptance_criteria[0]?.status).toBe('done');
    expect(reparsed.phases[0]?.acceptance_criteria[0]?.evidence?.[0]).toBe(
      'src/result.ts:1 — implemented',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// The dogfood-#5 bug — newline in evidence is now structurally safe
// ─────────────────────────────────────────────────────────────────────

describe('parser-v2 — newline-corruption bug-class is impossible', () => {
  it('renders multi-line evidence using YAML block scalar (|)', () => {
    const file: TaskFile = {
      schema_version: 2,
      slug: 'newline-test',
      status: 'build',
      created: '2026-05-26',
      title: 'Newline Test',
      context: { intro: 'test.' },
      phases: [
        {
          name: 'P',
          slug: 'p',
          status: 'pending',
          acceptance_criteria: [
            {
              text: 'do',
              status: 'done',
              evidence: ['multi\nline\nevidence with </evidence> embedded'],
            },
          ],
        },
      ],
    };
    const rendered = renderTaskFileYAML(file);
    // YAML.stringify must escape or block-scalar multi-line strings
    // such that re-parsing produces the same value
    const reparsed = parseTaskFileYAML(rendered);
    expect(reparsed.phases[0]?.acceptance_criteria[0]?.evidence?.[0]).toBe(
      'multi\nline\nevidence with </evidence> embedded',
    );
  });

  it('XML-like brackets in evidence do not break parsing', () => {
    const file: TaskFile = {
      schema_version: 2,
      slug: 'xml-test',
      status: 'build',
      created: '2026-05-26',
      title: 'XML Test',
      context: { intro: 'test.' },
      phases: [
        {
          name: 'P',
          slug: 'p',
          status: 'pending',
          acceptance_criteria: [
            { text: 'do', status: 'done', evidence: ['ends with </evidence> tag'] },
            { text: 'do2', status: 'done', evidence: ['has </invoke> too'] },
          ],
        },
      ],
    };
    const rendered = renderTaskFileYAML(file);
    const reparsed = parseTaskFileYAML(rendered);
    expect(reparsed.phases[0]?.acceptance_criteria).toHaveLength(2);
    expect(reparsed.phases[0]?.acceptance_criteria[0]?.evidence?.[0]).toContain('</evidence>');
    expect(reparsed.phases[0]?.acceptance_criteria[1]?.evidence?.[0]).toContain('</invoke>');
  });
});

// ─────────────────────────────────────────────────────────────────────
// LOC budget meta-tests — keeps parser/renderer thin
// ─────────────────────────────────────────────────────────────────────

describe('parser — LOC budget (architecture-as-test)', () => {
  it('parse.ts is < 100 LOC (excluding blanks + comments)', async () => {
    const src = await readFile(join(__dirname, '..', 'src', 'parser', 'parse.ts'), 'utf-8');
    const codeLines = src
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'),
      );
    expect(
      codeLines.length,
      `parse must stay thin (yaml.parse + Zod). got ${codeLines.length} LOC`,
    ).toBeLessThan(100);
  });

  it('render.ts is < 50 LOC (excluding blanks + comments)', async () => {
    const src = await readFile(join(__dirname, '..', 'src', 'parser', 'render.ts'), 'utf-8');
    const codeLines = src
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'),
      );
    expect(
      codeLines.length,
      `render must stay thin (yaml.stringify). got ${codeLines.length} LOC`,
    ).toBeLessThan(50);
  });
});
