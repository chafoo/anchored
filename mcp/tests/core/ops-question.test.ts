/**
 * task.question.* op tests — V0.3 structured Q&A.
 *
 * Covers:
 *   - question.add: sequential id assignment, initial open state,
 *     created_at timestamp population, optional phase field
 *   - question.list: returns insertion order, filter by priority /
 *     status / phase
 *   - question.resolve: idempotent, validates source/reasoning
 *     invariants, throws QuestionNotFound + InvalidQuestionResolution
 *   - question.retag: changes priority without touching other fields
 *   - schema invariants: status='resolved' requires answer + source
 *     + resolved_at; source='ai' requires reasoning; duplicate ids
 *     rejected at parse time
 *   - legacy migration: an on-disk task-file carrying the removed
 *     `autonomy` field still loads (key stripped before strict parse)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createOps } from '../../src/core/factory.js';
import { QuestionNotFound, InvalidQuestionResolution } from '../../src/core/errors.js';
import { parseTaskFile } from '../../src/schema/task-file.js';
import { parseTaskFileYAML } from '../../src/parser/parse.js';
import { createFixture, type Fixture } from './_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

describe('task.question.add', () => {
  it('assigns sequential q1, q2, q3 ids and starts at status=open', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);

    const a = await ops.task.question.add('sample', {
      text: 'First question?',
      priority: 'medium',
      origin: 'plan-agent',
    });
    expect(a.id).toBe('q1');

    const b = await ops.task.question.add('sample', {
      text: 'Second question?',
      priority: 'high',
      origin: 'plan-check',
    });
    expect(b.id).toBe('q2');

    const c = await ops.task.question.add('sample', {
      text: 'Third question?',
      priority: 'low',
      origin: 'rules-check',
    });
    expect(c.id).toBe('q3');

    expect(c.file.questions).toHaveLength(3);
    expect(c.file.questions![0]).toMatchObject({
      id: 'q1',
      text: 'First question?',
      priority: 'medium',
      origin: 'plan-agent',
      status: 'open',
    });
    expect(c.file.questions![0]!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.file.questions![0]!.answer).toBeUndefined();
    expect(c.file.questions![0]!.source).toBeUndefined();
    expect(c.file.questions![0]!.resolved_at).toBeUndefined();
  });

  it('persists optional phase context', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { file } = await ops.task.question.add('sample', {
      text: 'Toggle via whole-row click or checkbox?',
      priority: 'medium',
      origin: 'plan-agent',
      phase: 'first',
    });
    expect(file.questions![0]!.phase).toBe('first');
  });
});

describe('task.question.list', () => {
  it('returns insertion order with no filter', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.question.add('sample', { text: 'a', priority: 'low', origin: 'plan-agent' });
    await ops.task.question.add('sample', { text: 'b', priority: 'high', origin: 'plan-check' });
    await ops.task.question.add('sample', { text: 'c', priority: 'medium', origin: 'rules-check' });
    const list = await ops.task.question.list('sample');
    expect(list.map((q) => q.text)).toEqual(['a', 'b', 'c']);
  });

  it('filters by priority', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.question.add('sample', { text: 'a', priority: 'low', origin: 'plan-agent' });
    await ops.task.question.add('sample', { text: 'b', priority: 'high', origin: 'plan-agent' });
    await ops.task.question.add('sample', { text: 'c', priority: 'high', origin: 'plan-agent' });
    const high = await ops.task.question.list('sample', { priority: 'high' });
    expect(high).toHaveLength(2);
    expect(high.every((q) => q.priority === 'high')).toBe(true);
  });

  it('filters by status (open vs resolved)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id: id1 } = await ops.task.question.add('sample', {
      text: 'a',
      priority: 'medium',
      origin: 'plan-agent',
    });
    await ops.task.question.add('sample', { text: 'b', priority: 'medium', origin: 'plan-agent' });
    await ops.task.question.resolve('sample', id1, { answer: 'option A', source: 'user' });

    const open = await ops.task.question.list('sample', { status: 'open' });
    const resolved = await ops.task.question.list('sample', { status: 'resolved' });
    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe(id1);
  });

  it('filters by phase', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await ops.task.question.add('sample', {
      text: 'a',
      priority: 'medium',
      origin: 'plan-agent',
      phase: 'first',
    });
    await ops.task.question.add('sample', {
      text: 'b',
      priority: 'medium',
      origin: 'plan-agent',
      phase: 'second',
    });
    await ops.task.question.add('sample', { text: 'c', priority: 'medium', origin: 'plan-agent' });
    const firstPhase = await ops.task.question.list('sample', { phase: 'first' });
    expect(firstPhase).toHaveLength(1);
    expect(firstPhase[0]!.text).toBe('a');
  });

  it('returns empty array when no questions exist', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const list = await ops.task.question.list('sample');
    expect(list).toEqual([]);
  });
});

describe('task.question.resolve', () => {
  it('resolves with source=user (no reasoning required)', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'Pick A or B?',
      priority: 'high',
      origin: 'plan-agent',
    });
    const file = await ops.task.question.resolve('sample', id, {
      answer: 'A',
      source: 'user',
    });
    const q = file.questions!.find((qq) => qq.id === id)!;
    expect(q.status).toBe('resolved');
    expect(q.answer).toBe('A');
    expect(q.source).toBe('user');
    expect(q.reasoning).toBeUndefined();
    expect(q.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('resolves with source=ai + reasoning', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'Toggle UX?',
      priority: 'medium',
      origin: 'plan-agent',
    });
    const file = await ops.task.question.resolve('sample', id, {
      answer: 'whole-row click',
      source: 'ai',
      reasoning: 'matches CSS scope pattern in style.css',
    });
    const q = file.questions!.find((qq) => qq.id === id)!;
    expect(q.source).toBe('ai');
    expect(q.reasoning).toBe('matches CSS scope pattern in style.css');
  });

  it('is idempotent — re-resolving updates fields + refreshes resolved_at', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'high',
      origin: 'plan-agent',
    });
    const first = await ops.task.question.resolve('sample', id, {
      answer: 'first answer',
      source: 'user',
    });
    const firstTs = first.questions!.find((q) => q.id === id)!.resolved_at!;

    // small delay so the timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    const second = await ops.task.question.resolve('sample', id, {
      answer: 'revised answer',
      source: 'user',
    });
    const secondQ = second.questions!.find((q) => q.id === id)!;
    expect(secondQ.answer).toBe('revised answer');
    expect(secondQ.resolved_at).not.toBe(firstTs);
  });

  it('clears stale AI reasoning when re-resolved by user', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'medium',
      origin: 'plan-agent',
    });
    await ops.task.question.resolve('sample', id, {
      answer: 'ai pick',
      source: 'ai',
      reasoning: 'because reasons',
    });
    const file = await ops.task.question.resolve('sample', id, {
      answer: 'user override',
      source: 'user',
    });
    const q = file.questions!.find((qq) => qq.id === id)!;
    expect(q.source).toBe('user');
    expect(q.reasoning).toBeUndefined();
  });

  it('throws QuestionNotFound for an unknown id', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(
      ops.task.question.resolve('sample', 'q99', { answer: 'x', source: 'user' }),
    ).rejects.toBeInstanceOf(QuestionNotFound);
  });

  it('rejects empty answer string', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'low',
      origin: 'plan-agent',
    });
    await expect(
      ops.task.question.resolve('sample', id, { answer: '   ', source: 'user' }),
    ).rejects.toBeInstanceOf(InvalidQuestionResolution);
  });

  it('rejects source=ai without reasoning', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'medium',
      origin: 'plan-agent',
    });
    await expect(
      ops.task.question.resolve('sample', id, { answer: 'x', source: 'ai' }),
    ).rejects.toBeInstanceOf(InvalidQuestionResolution);
  });

  it('rejects source=user with reasoning', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'medium',
      origin: 'plan-agent',
    });
    await expect(
      ops.task.question.resolve('sample', id, {
        answer: 'x',
        source: 'user',
        reasoning: 'shouldnt have this',
      }),
    ).rejects.toBeInstanceOf(InvalidQuestionResolution);
  });
});

describe('task.question.retag', () => {
  it('changes priority without touching other fields', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    const { id } = await ops.task.question.add('sample', {
      text: 'q?',
      priority: 'low',
      origin: 'plan-agent',
    });
    const file = await ops.task.question.retag('sample', id, 'high');
    const q = file.questions!.find((qq) => qq.id === id)!;
    expect(q.priority).toBe('high');
    expect(q.text).toBe('q?');
    expect(q.origin).toBe('plan-agent');
    expect(q.status).toBe('open');
  });

  it('throws QuestionNotFound for an unknown id', async () => {
    fixture = await createFixture();
    const ops = createOps(fixture.config, fixture.root);
    await expect(ops.task.question.retag('sample', 'q99', 'high')).rejects.toBeInstanceOf(
      QuestionNotFound,
    );
  });
});

describe('schema invariants', () => {
  it('rejects question with status=resolved but no answer', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'bad',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
        questions: [
          {
            id: 'q1',
            text: 'q?',
            priority: 'high',
            origin: 'plan-agent',
            status: 'resolved',
            created_at: '2026-05-27T12:00:00Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects question with source=ai but no reasoning', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'bad',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
        questions: [
          {
            id: 'q1',
            text: 'q?',
            priority: 'high',
            origin: 'plan-agent',
            status: 'resolved',
            answer: 'a',
            source: 'ai',
            created_at: '2026-05-27T12:00:00Z',
            resolved_at: '2026-05-27T12:01:00Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects question with status=open but answer set', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'bad',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
        questions: [
          {
            id: 'q1',
            text: 'q?',
            priority: 'high',
            origin: 'plan-agent',
            status: 'open',
            answer: 'should not be here',
            created_at: '2026-05-27T12:00:00Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects duplicate question ids at parse time', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'bad',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
        questions: [
          {
            id: 'q1',
            text: 'a',
            priority: 'low',
            origin: 'plan-agent',
            status: 'open',
            created_at: '2026-05-27T12:00:00Z',
          },
          {
            id: 'q1',
            text: 'b',
            priority: 'low',
            origin: 'plan-agent',
            status: 'open',
            created_at: '2026-05-27T12:00:00Z',
          },
        ],
      }),
    ).toThrow(/duplicate question id/);
  });

  it('rejects malformed question id (not q<N>)', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'bad',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
        questions: [
          {
            id: 'question-1',
            text: 'a',
            priority: 'low',
            origin: 'plan-agent',
            status: 'open',
            created_at: '2026-05-27T12:00:00Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts task-file with no questions field (V0.2 shape)', () => {
    expect(() =>
      parseTaskFile({
        schema_version: 2,
        slug: 'legacy',
        status: 'plan',
        created: '2026-05-27',
        title: 't',
        context: { intro: 'i' },
        phases: [],
      }),
    ).not.toThrow();
  });
});

describe('legacy autonomy-field migration', () => {
  // The persisted `autonomy` field was removed in V0.3. The on-disk
  // loader strips a stray top-level `autonomy` key before the strict
  // schema runs, so existing artifacts (e.g. dynamic-workflow-executor.yml
  // carrying `autonomy: ask_all`) keep loading and the field drops away.
  const legacyYaml = [
    'schema_version: 2',
    'slug: legacy-autonomy',
    'status: plan',
    'created: 2026-05-27',
    'title: Legacy file with autonomy',
    'context:',
    '  intro: had an autonomy field',
    'phases: []',
    'autonomy: ask_all',
    '',
  ].join('\n');

  it('loads an on-disk task-file carrying a legacy `autonomy: ask_all` key', () => {
    expect(() => parseTaskFileYAML(legacyYaml)).not.toThrow();
  });

  it('drops the legacy `autonomy` key from the parsed structure', () => {
    const parsed = parseTaskFileYAML(legacyYaml);
    expect('autonomy' in parsed).toBe(false);
    expect((parsed as Record<string, unknown>).autonomy).toBeUndefined();
  });
});
