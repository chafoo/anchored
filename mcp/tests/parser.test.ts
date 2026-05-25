/**
 * Sanity tests for parser + renderer.
 *
 * Primary property: round-trip safety — parse(render(parse(x)))
 * should equal parse(x) for valid task-files. We don't aim for
 * byte-identical render(parse(x)) === x (whitespace conventions
 * may normalize), but the semantic content must survive.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/parse.js';
import { render } from '../src/parser/render.js';

const SAMPLE_TASK = `---
slug: oauth-device-flow
status: build
created: 2026-05-25
---

# OAuth 2.0 Device Flow for Fastify API

## Context
Device-flow OAuth so CLI tools can authenticate without browser.
Existing auth lives in src/auth/.

### Plan
- Decision: use oauth4webapi lib (already in tree)
- Q: [blocking] Token storage — Redis or in-memory?
  → resolved: in-memory for V1

### Build

#### Implement
- token-storage-layer / Token Storage Layer
  Decided Map over Object for TTL eviction

#### task-check
- token-storage-layer / Token Storage Layer
  verdict: pass — all 3 ACs have evidence

## Phases

### Token Storage Layer
<!-- id: token-storage-layer -->
- status: done
- commit: abc1234
- context: Storage layer at src/auth/. Use Fastify hooks pattern from auth.ts.
- rules:
  - path: .claude/rules/_pattern/factory.md
    why: this phase adds new module in src/auth/
- acceptance_criteria:
  - token-store interface defined in src/auth/store.ts
    evidence: src/auth/store.ts:8 — TokenStore interface
  - in-memory impl with TTL eviction
    evidence: src/auth/store-memory.ts:42 — MemoryStore factory
  - unit tests cover expiry + concurrent access
    evidence: src/auth/store-memory.test.ts (12 tests passing)

### Device Flow Endpoints
<!-- id: device-flow-endpoints -->
- status: pending
- acceptance_criteria:
  - POST /oauth/device/code returns user_code + device_code
    evidence: —
  - POST /oauth/token polls and returns access_token on grant
    evidence: —
`;

describe('parse', () => {
  it('parses frontmatter correctly', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.frontmatter.slug).toBe('oauth-device-flow');
    expect(file.frontmatter.status).toBe('build');
    expect(file.frontmatter.created).toBe('2026-05-25');
  });

  it('extracts the H1 title', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.title).toBe('OAuth 2.0 Device Flow for Fastify API');
  });

  it('parses ## Context intro', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.context.intro).toContain('Device-flow OAuth');
    expect(file.context.intro).toContain('src/auth/');
  });

  it('parses ### Plan content with Q&A', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.context.plan).toBeDefined();
    expect(file.context.plan).toContain('oauth4webapi lib');
    expect(file.context.plan).toContain('[blocking]');
    expect(file.context.plan).toContain('resolved: in-memory');
  });

  it('parses ### Build → H4 sub-sections', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.context.build['Implement']).toContain('Decided Map over Object');
    expect(file.context.build['task-check']).toContain('verdict: pass');
  });

  it('parses both phases', () => {
    const file = parse(SAMPLE_TASK);
    expect(file.phases).toHaveLength(2);
    expect(file.phases[0]!.name).toBe('Token Storage Layer');
    expect(file.phases[0]!.slug).toBe('token-storage-layer');
    expect(file.phases[0]!.status).toBe('done');
    expect(file.phases[1]!.name).toBe('Device Flow Endpoints');
    expect(file.phases[1]!.status).toBe('pending');
  });

  it('parses phase context + rules + acceptance_criteria', () => {
    const file = parse(SAMPLE_TASK);
    const phase = file.phases[0]!;
    expect(phase.context).toContain('Storage layer at src/auth/');
    expect(phase.rules).toHaveLength(1);
    expect(phase.rules![0]!.path).toBe('.claude/rules/_pattern/factory.md');
    expect(phase.rules![0]!.why).toContain('new module');
    expect(phase.acceptanceCriteria).toHaveLength(3);
    expect(phase.acceptanceCriteria[0]!.text).toContain('token-store interface');
    expect(phase.acceptanceCriteria[0]!.evidence).toContain('src/auth/store.ts:8');
    expect(phase.acceptanceCriteria[2]!.evidence).toContain('12 tests passing');
  });

  it('parses user-extension phase fields', () => {
    const file = parse(SAMPLE_TASK);
    const phase = file.phases[0]!;
    expect(phase.extensions['commit']).toBe('abc1234');
  });

  it('handles empty evidence as the em-dash sentinel', () => {
    const file = parse(SAMPLE_TASK);
    const pending = file.phases[1]!;
    expect(pending.acceptanceCriteria[0]!.evidence).toBe('—');
    expect(pending.acceptanceCriteria[1]!.evidence).toBe('—');
  });
});

describe('render', () => {
  it('produces a non-empty string with frontmatter', () => {
    const file = parse(SAMPLE_TASK);
    const output = render(file);
    expect(output).toMatch(/^---\n/);
    expect(output).toContain('slug: oauth-device-flow');
    expect(output).toContain('# OAuth 2.0 Device Flow');
  });

  it('round-trips phase structure', () => {
    const file = parse(SAMPLE_TASK);
    const output = render(file);
    const reparsed = parse(output);
    expect(reparsed.phases).toHaveLength(file.phases.length);
    expect(reparsed.phases[0]!.slug).toBe(file.phases[0]!.slug);
    expect(reparsed.phases[0]!.status).toBe(file.phases[0]!.status);
    expect(reparsed.phases[0]!.acceptanceCriteria).toEqual(
      file.phases[0]!.acceptanceCriteria,
    );
  });

  it('preserves user-extension phase fields on round-trip', () => {
    const file = parse(SAMPLE_TASK);
    const reparsed = parse(render(file));
    expect(reparsed.phases[0]!.extensions['commit']).toBe('abc1234');
  });

  it('preserves Context sub-sections on round-trip', () => {
    const file = parse(SAMPLE_TASK);
    const reparsed = parse(render(file));
    expect(reparsed.context.plan).toContain('oauth4webapi');
    expect(reparsed.context.build['Implement']).toContain('Map over Object');
    expect(reparsed.context.build['task-check']).toContain('verdict: pass');
  });

  it('preserves rules on round-trip', () => {
    const file = parse(SAMPLE_TASK);
    const reparsed = parse(render(file));
    expect(reparsed.phases[0]!.rules).toEqual(file.phases[0]!.rules);
  });
});
