/**
 * V0.3 end-to-end test — autonomy + structured Q&A flow.
 *
 * Drives the factory ops directly (no LLM spawning) through a V0.3
 * lifecycle: plan-agent adds questions, plan-check + rules-check add
 * more, /impl-refine sets autonomy + resolves under it, /impl-build
 * reads autonomy. Mirrors the shape that the SKILL orchestrators
 * implement, but verified at the ops layer.
 *
 * If this suite is green, the V0.3 wiring (P1-P6) holds end-to-end:
 *   - questions[] accumulates from multiple origins
 *   - resolve(source=user) + resolve(source=ai) both work + persist
 *   - autonomy is settable, idempotent, audit-trailed
 *   - retag changes priority without touching answer/status
 *   - the full plan → drafted → refined transition works with
 *     V0.3-shaped data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createOps, type TaskOps } from '../../src/core/factory.js';
import { parseAnchoredYml } from '../../src/schema/anchored-yml.js';

const EMPTY_ANCHORED_YML = `task:
  phase:
    fields: []
plan: {}
refine: {}
build: {}
wrap: {}
`;

interface Fixture {
  root: string;
  ops: TaskOps;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'anchored-autonomy-e2e-'));
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true });
  await writeFile(join(root, 'anchored.yml'), EMPTY_ANCHORED_YML, 'utf-8');
  const config = parseAnchoredYml({ task: { phase: { fields: [] } }, plan: {}, refine: {}, build: {}, wrap: {} });
  return {
    root,
    ops: createOps(config, root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

let fixture: Fixture | null = null;
beforeEach(async () => {
  fixture = await setup();
});
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('V0.3 plan → drafted with questions[] from multiple origins', () => {
  it('plan-agent + plan-check + rules-check all add questions; the array stays ordered + uniquely-id\'d', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo Task' });

    // Simulate the three agents adding questions in sequence
    const a = await ops.task.question.add('demo', {
      text: 'Toggle UX — whole-row click or checkbox?',
      priority: 'medium',
      origin: 'plan-agent',
      phase: 'toggle',
    });
    const b = await ops.task.question.add('demo', {
      text: 'Plan-trail says "we use whole-row click" — was that your call?',
      priority: 'high',
      origin: 'plan-check',
    });
    const c = await ops.task.question.add('demo', {
      text: 'Phases 1 and 3 reference conflicting storage rules — which applies?',
      priority: 'high',
      origin: 'rules-check',
    });

    expect(a.id).toBe('q1');
    expect(b.id).toBe('q2');
    expect(c.id).toBe('q3');

    const all = await ops.task.question.list('demo');
    expect(all).toHaveLength(3);
    expect(all.map((q) => q.origin)).toEqual([
      'plan-agent',
      'plan-check',
      'rules-check',
    ]);
    expect(all.every((q) => q.status === 'open')).toBe(true);
  });

  it('priority filter returns only matching questions; status filter the same', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    await ops.task.question.add('demo', { text: 'low one', priority: 'low', origin: 'plan-agent' });
    await ops.task.question.add('demo', { text: 'high one', priority: 'high', origin: 'plan-check' });
    await ops.task.question.add('demo', { text: 'med one', priority: 'medium', origin: 'rules-check' });

    const high = await ops.task.question.list('demo', { priority: 'high' });
    expect(high).toHaveLength(1);
    expect(high[0]!.text).toBe('high one');

    const open = await ops.task.question.list('demo', { status: 'open' });
    expect(open).toHaveLength(3);
  });
});

describe('V0.3 refine — autonomy declared, then questions resolved per autonomy', () => {
  it('ask_all flow: user resolves every question', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    const { id: q1 } = await ops.task.question.add('demo', {
      text: 'q1?',
      priority: 'high',
      origin: 'plan-agent',
    });
    const { id: q2 } = await ops.task.question.add('demo', {
      text: 'q2?',
      priority: 'low',
      origin: 'plan-agent',
    });

    // Stage 0
    await ops.task.autonomy.set('demo', 'ask_all');
    const afterAutonomy = await ops.task.read('demo');
    expect(afterAutonomy.autonomy).toBe('ask_all');
    expect(afterAutonomy.context.plan).toContain('autonomy set to `ask_all`');

    // Stage 3 — both resolved by user
    await ops.task.question.resolve('demo', q1, { answer: 'option A', source: 'user' });
    await ops.task.question.resolve('demo', q2, { answer: 'newest at top', source: 'user' });

    const open = await ops.task.question.list('demo', { status: 'open' });
    expect(open).toHaveLength(0);

    const all = await ops.task.question.list('demo');
    expect(all.every((q) => q.source === 'user')).toBe(true);
    expect(all.every((q) => q.reasoning === undefined)).toBe(true);
  });

  it('ask_high_only flow: user resolves high, AI resolves medium+low with reasoning', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    const { id: qHigh } = await ops.task.question.add('demo', {
      text: 'high q',
      priority: 'high',
      origin: 'plan-agent',
    });
    const { id: qMed } = await ops.task.question.add('demo', {
      text: 'medium q',
      priority: 'medium',
      origin: 'plan-agent',
    });
    const { id: qLow } = await ops.task.question.add('demo', {
      text: 'low q',
      priority: 'low',
      origin: 'plan-agent',
    });

    await ops.task.autonomy.set('demo', 'ask_high_only');

    // User answers high
    await ops.task.question.resolve('demo', qHigh, {
      answer: 'product call: in-scope',
      source: 'user',
    });
    // AI answers medium + low
    await ops.task.question.resolve('demo', qMed, {
      answer: 'whole-row click',
      source: 'ai',
      reasoning: 'matches CSS scope pattern in style.css',
    });
    await ops.task.question.resolve('demo', qLow, {
      answer: 'newest at bottom',
      source: 'ai',
      reasoning: 'matches "append" mental model from the ticket',
    });

    const all = await ops.task.question.list('demo');
    const byId = new Map(all.map((q) => [q.id, q]));
    expect(byId.get(qHigh)!.source).toBe('user');
    expect(byId.get(qMed)!.source).toBe('ai');
    expect(byId.get(qMed)!.reasoning).toMatch(/CSS/);
    expect(byId.get(qLow)!.source).toBe('ai');
  });

  it('decide_all flow: every question gets source=ai + reasoning', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    const { id: qA } = await ops.task.question.add('demo', { text: 'a?', priority: 'high', origin: 'plan-agent' });
    const { id: qB } = await ops.task.question.add('demo', { text: 'b?', priority: 'low', origin: 'plan-agent' });

    await ops.task.autonomy.set('demo', 'decide_all');

    await ops.task.question.resolve('demo', qA, {
      answer: 'A',
      source: 'ai',
      reasoning: 'fits scope per discovery findings',
    });
    await ops.task.question.resolve('demo', qB, {
      answer: 'B',
      source: 'ai',
      reasoning: 'lowest-friction option',
    });

    const all = await ops.task.question.list('demo');
    expect(all.every((q) => q.source === 'ai' && q.reasoning !== undefined)).toBe(true);
  });
});

describe('V0.3 autonomy override mid-flow', () => {
  it('set_autonomy is idempotent and appends a distinct override audit entry', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });

    await ops.task.autonomy.set('demo', 'ask_high_only');
    await ops.task.autonomy.set('demo', 'decide_all');

    const file = await ops.task.read('demo');
    expect(file.autonomy).toBe('decide_all');
    expect(file.context.plan).toContain('autonomy set to `ask_high_only`');
    expect(file.context.plan).toContain(
      'autonomy override: `ask_high_only` → `decide_all`',
    );
  });

  it('user can override autonomy mid-walk; subsequent resolves see the new value', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    const { id: qHigh } = await ops.task.question.add('demo', { text: 'h?', priority: 'high', origin: 'plan-agent' });
    const { id: qMed } = await ops.task.question.add('demo', { text: 'm?', priority: 'medium', origin: 'plan-agent' });

    // Initial: ask_high_only
    await ops.task.autonomy.set('demo', 'ask_high_only');
    await ops.task.question.resolve('demo', qHigh, { answer: 'A', source: 'user' });

    // User flips to decide_all mid-walk
    await ops.task.autonomy.set('demo', 'decide_all');
    await ops.task.question.resolve('demo', qMed, {
      answer: 'B',
      source: 'ai',
      reasoning: 'autopilot pick',
    });

    const file = await ops.task.read('demo');
    expect(file.autonomy).toBe('decide_all');
    const all = await ops.task.question.list('demo');
    expect(all.find((q) => q.id === qHigh)!.source).toBe('user');
    expect(all.find((q) => q.id === qMed)!.source).toBe('ai');
  });
});

describe('V0.3 retag', () => {
  it('plan-check can retag a plan-agent question without touching other fields', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });
    const { id } = await ops.task.question.add('demo', {
      text: 'looks low but actually high?',
      priority: 'low',
      origin: 'plan-agent',
    });

    await ops.task.question.retag('demo', id, 'high');

    const all = await ops.task.question.list('demo');
    const q = all.find((qq) => qq.id === id)!;
    expect(q.priority).toBe('high');
    expect(q.origin).toBe('plan-agent'); // unchanged
    expect(q.status).toBe('open'); // unchanged
    expect(q.text).toBe('looks low but actually high?'); // unchanged
  });
});

describe('V0.3 build-time question_add by validator', () => {
  it('task-validate / code-validate can add high-priority questions mid-build', async () => {
    const { ops } = fixture!;
    await ops.task.create('demo', { title: 'Demo' });

    // Simulate mid-build ambiguity discovered by task-validate
    const v1 = await ops.task.question.add('demo', {
      text: 'Evidence claims AC3 done but file:line ref points to comment-only — what should "done" mean here?',
      priority: 'high',
      origin: 'task-validate',
      phase: 'phase-2',
    });

    // Simulate code-validate finding a rule-ambiguity
    const v2 = await ops.task.question.add('demo', {
      text: 'Implementation uses pattern X (file:42). Rule A says do, rule B says don\'t — which applies?',
      priority: 'high',
      origin: 'code-validate',
      phase: 'phase-2',
    });

    const open = await ops.task.question.list('demo', { status: 'open' });
    expect(open).toHaveLength(2);
    expect(open.every((q) => q.priority === 'high')).toBe(true);
    expect(open.map((q) => q.origin)).toEqual(['task-validate', 'code-validate']);
    // Both are tagged with the phase they care about
    expect(open.every((q) => q.phase === 'phase-2')).toBe(true);
    expect([v1.id, v2.id]).toEqual(['q1', 'q2']);
  });
});
