/**
 * Build-time stop-condition evaluator — contract + plumbing tests.
 *
 * The `stop-check` mini-agent (plugin/agents/stop-check.md) is a
 * natural-language judge; we can't drive its LLM verdict in a unit test.
 * What we CAN (and must) test deterministically is the CONTRACT seam it
 * feeds: `classifyStopVerdict` (mcp/src/core/stop-check.ts) and the
 * resulting MCP ops the /impl-build SKILL applies. These tests pin the
 * evaluator's behavior end-to-end through the REAL factory ops and the
 * REAL shipped `anchored.yml.build.stop` default.
 *
 * Coverage maps to the phase acceptance criteria:
 *   - AC0: the mechanism takes a pending decision + the global build.stop
 *          rules and returns a stop-or-proceed result (classifyStopVerdict
 *          + the agent's {verdict, matched_rule?, reasoning} payload).
 *   - AC1: a PROCEED routes to question_resolve(source='ai', reasoning),
 *          satisfying the source='ai'-requires-non-empty-reasoning
 *          invariant (task-file question.resolve guard).
 *   - AC2: a STOP escalates via question_add WITHOUT auto-resolving.
 *   - AC3: the shipped default rule 'a decision deviates from the plan'
 *          is exercised — a plan-deviating decision triggers a stop.
 *   - AC4: a decision matching NO stop-clause proceeds autonomously and
 *          is documented in the decisions log (resolved question, ai).
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  classifyStopVerdict,
  isEscalateAction,
  InvalidStopVerdict,
  DEFAULT_STOP_RULE,
  STOP_CHECK_ORIGIN,
  STOP_ESCALATION_PRIORITY,
  SECOND_EYE_RULE,
  type StopCheckVerdict,
} from '../src/core/stop-check.js';
import { parseAnchoredYml } from '../src/schema/anchored-yml.js';
import { createOps } from '../src/core/factory.js';
import { createFixture, type Fixture } from './core/_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

// A task-file seeded with an OPEN build-time decision question, the way
// the orchestrator records a pending decision point before invoking
// stop-check. The decision is then either resolved (proceed) or joined
// by an escalation question (stop).
const BUILD_TASK_YML = `schema_version: 2
slug: build-sample
status: build
created: 2026-05-26
title: Build-time decision sample
context:
  intro: A task mid-build with a pending decision point.
  plan: |
    Decisions:
    - storage layer uses the existing JSON-file pattern from phase 1
phases:
  - name: Storage Phase
    slug: storage
    status: in-progress
    acceptance_criteria:
      - text: store persists tasks
        status: pending
questions:
  - id: q1
    text: "Storage phase — which persistence approach for the task list?"
    priority: medium
    origin: plan-agent
    status: open
    created_at: 2026-05-26T00:00:00.000Z
`;

// ─────────────────────────────────────────────────────────────────────
// AC0 + AC3 — the shipped default rule fires on a plan deviation → stop
// ─────────────────────────────────────────────────────────────────────

describe('stop-check: shipped default rule "a decision deviates from the plan" (AC0, AC3)', () => {
  it('the default build.stop config carries exactly the deviation rule', () => {
    // Parse an empty anchored.yml — the schema default must populate
    // build.stop with the single shipped rule the evaluator keys off.
    const cfg = parseAnchoredYml({});
    expect(cfg.build.stop).toEqual([DEFAULT_STOP_RULE]);
    expect(DEFAULT_STOP_RULE).toBe('a decision deviates from the plan');
  });

  it('a plan-deviating build-time decision routes to a STOP escalation', () => {
    // The agent (judging against the default rule) returns a stop verdict
    // for a decision that deviates from the plan. classifyStopVerdict is
    // the deterministic seam the SKILL routes on.
    const cfg = parseAnchoredYml({});
    const stopRules = cfg.build.stop;

    const verdict: StopCheckVerdict = {
      verdict: 'stop',
      matched_rule: stopRules[0]!, // 'a decision deviates from the plan'
      reasoning:
        'Plan specifies the existing JSON-file storage pattern; the ' +
        'worker is about to introduce a SQLite dependency instead — a ' +
        'direction the plan never sanctioned. Deviation.',
    };

    const action = classifyStopVerdict(verdict);

    // STOP → escalate via question_add, NOT resolve.
    expect(isEscalateAction(action)).toBe(true);
    if (!isEscalateAction(action)) throw new Error('expected escalate action');
    expect(action.op).toBe('question_add');
    expect(action.priority).toBe(STOP_ESCALATION_PRIORITY);
    expect(action.priority).toBe('high');
    expect(action.origin).toBe(STOP_CHECK_ORIGIN);
    expect(action.origin).toBe('stop-check');
    expect(action.matched_rule).toBe(DEFAULT_STOP_RULE);
    expect(action.reasoning).toContain('Deviation');
  });

  it('end-to-end: a STOP adds a NEW open question and never resolves the decision (AC2, AC3)', async () => {
    fixture = await createFixture({ slug: 'build-sample', taskYml: BUILD_TASK_YML });
    const ops = createOps(fixture.config, fixture.root);
    const cfg = parseAnchoredYml({}); // shipped default build.stop

    // Agent verdict on a plan-deviating decision.
    const verdict: StopCheckVerdict = {
      verdict: 'stop',
      matched_rule: cfg.build.stop[0]!,
      reasoning:
        'Worker wants exponential retry-backoff; the plan is silent on ' +
        'retry policy. Net-new direction → deviates from the plan.',
    };
    const action = classifyStopVerdict(verdict);
    if (!isEscalateAction(action)) throw new Error('expected escalate action');

    // The SKILL applies the escalation via question_add (origin=stop-check,
    // priority=high). The original pending decision (q1) stays OPEN.
    const { id } = await ops.task.question.add('build-sample', {
      text: `Build halted by stop-rule "${action.matched_rule}": ${action.reasoning}`,
      priority: action.priority,
      origin: action.origin,
      phase: 'storage',
    });

    const after = await ops.task.read('build-sample');
    const escalation = after.questions!.find((q) => q.id === id)!;

    // A NEW open question now exists, attributed to stop-check, high prio.
    expect(escalation.status).toBe('open');
    expect(escalation.origin).toBe('stop-check');
    expect(escalation.priority).toBe('high');
    expect(escalation.text).toContain('a decision deviates from the plan');

    // Crucially: the original decision was NOT auto-resolved by the stop.
    const original = after.questions!.find((q) => q.id === 'q1')!;
    expect(original.status).toBe('open');
    expect(original.answer).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// AC0 + AC1 + AC4 — no-match → proceed → documented (ai resolution)
// ─────────────────────────────────────────────────────────────────────

describe('stop-check: no rule matches → proceed autonomously (AC0, AC1, AC4)', () => {
  it('a non-matching decision routes to a PROCEED resolution carrying reasoning', () => {
    const cfg = parseAnchoredYml({});

    const verdict: StopCheckVerdict = {
      verdict: 'proceed',
      reasoning:
        'Worker uses the existing JSON-file storage pattern from phase 1 — ' +
        'exactly what the plan specifies. No deviation; matches no stop-rule.',
    };

    const action = classifyStopVerdict(verdict);

    expect(isEscalateAction(action)).toBe(false);
    expect(action.op).toBe('question_resolve');
    if (action.op !== 'question_resolve') throw new Error('expected resolve');
    expect(action.source).toBe('ai');
    // Reasoning is carried through non-empty so the source='ai' invariant holds.
    expect(action.reasoning.trim().length).toBeGreaterThan(0);
    expect(action.reasoning).toContain('No deviation');
    // Sanity: the decision genuinely matched none of the stop-rules.
    expect(cfg.build.stop).toEqual([DEFAULT_STOP_RULE]);
  });

  it('end-to-end: a PROCEED documents the decision via question_resolve(source=ai, reasoning) (AC1, AC4)', async () => {
    fixture = await createFixture({ slug: 'build-sample', taskYml: BUILD_TASK_YML });
    const ops = createOps(fixture.config, fixture.root);

    const verdict: StopCheckVerdict = {
      verdict: 'proceed',
      reasoning:
        'Chose the existing JSON-file storage pattern from phase 1, as the ' +
        'plan specifies. Autonomous decision, no deviation.',
    };
    const action = classifyStopVerdict(verdict);
    if (action.op !== 'question_resolve') throw new Error('expected resolve action');

    // The SKILL applies the proceed via question_resolve on the pending
    // decision (q1), source='ai', carrying the agent's reasoning.
    const after = await ops.task.question.resolve('build-sample', 'q1', {
      answer: 'Use the existing JSON-file storage pattern from phase 1.',
      source: action.source,
      reasoning: action.reasoning,
    });

    const decision = after.questions!.find((q) => q.id === 'q1')!;

    // Decision is now resolved + documented in the decisions log.
    expect(decision.status).toBe('resolved');
    expect(decision.source).toBe('ai');
    // The reasoning is the audit trail /impl-wrap reads — non-empty, verbatim.
    expect(decision.reasoning).toBe(action.reasoning);
    expect(decision.reasoning!.trim().length).toBeGreaterThan(0);
    expect(decision.answer).toContain('JSON-file storage');

    // No NEW escalation question was added — proceed is autonomous.
    expect(after.questions!.length).toBe(1);
  });

  it('PROCEED routing always yields non-empty reasoning so question_resolve(ai) cannot throw the invariant error (AC1)', async () => {
    // Guard the contract directly: classifyStopVerdict refuses to produce
    // a proceed action with empty reasoning, so the downstream
    // source='ai' question_resolve invariant can never be violated by it.
    fixture = await createFixture({ slug: 'build-sample', taskYml: BUILD_TASK_YML });
    const ops = createOps(fixture.config, fixture.root);

    const action = classifyStopVerdict({
      verdict: 'proceed',
      reasoning: 'Within-plan execution; no stop-rule match.',
    });
    if (action.op !== 'question_resolve') throw new Error('expected resolve');

    // This resolve would THROW InvalidQuestionResolution if reasoning were
    // empty — it doesn't, proving the seam upholds the invariant.
    await expect(
      ops.task.question.resolve('build-sample', 'q1', {
        answer: 'proceed',
        source: 'ai',
        reasoning: action.reasoning,
      }),
    ).resolves.toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Contract invariants — classifyStopVerdict fails loud on malformed input
// ─────────────────────────────────────────────────────────────────────

describe('stop-check: classifyStopVerdict invariants (AC0)', () => {
  it('rejects a proceed verdict with empty reasoning', () => {
    expect(() => classifyStopVerdict({ verdict: 'proceed', reasoning: '   ' })).toThrow(
      InvalidStopVerdict,
    );
  });

  it('rejects a stop verdict missing matched_rule', () => {
    expect(() => classifyStopVerdict({ verdict: 'stop', reasoning: 'something is off' })).toThrow(
      InvalidStopVerdict,
    );
  });

  it('rejects a stop verdict with a blank matched_rule', () => {
    expect(() =>
      classifyStopVerdict({
        verdict: 'stop',
        matched_rule: '  ',
        reasoning: 'deviation',
      }),
    ).toThrow(InvalidStopVerdict);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Second eye — a worker-self-reported deviation forces a stop
// deterministically, even when the evaluator returned proceed.
// ─────────────────────────────────────────────────────────────────────

describe('stop-check: deterministic second-eye override (workerFlaggedDeviation)', () => {
  const proceed: StopCheckVerdict = {
    verdict: 'proceed',
    reasoning: 'Within the plan — reuses the phase-1 JSON-file pattern.',
  };

  it('proceed + workerFlaggedDeviation=true → FORCED stop under the synthetic second-eye rule', () => {
    const action = classifyStopVerdict(proceed, { workerFlaggedDeviation: true });
    expect(isEscalateAction(action)).toBe(true);
    if (!isEscalateAction(action)) throw new Error('expected escalate action');
    expect(action.op).toBe('question_add');
    expect(action.priority).toBe('high');
    expect(action.origin).toBe(STOP_CHECK_ORIGIN);
    expect(action.matched_rule).toBe(SECOND_EYE_RULE);
    // the proceed reasoning is carried into the escalation
    expect(action.reasoning).toBe(proceed.reasoning);
  });

  it('proceed without the flag still resolves autonomously (no override)', () => {
    expect(classifyStopVerdict(proceed).op).toBe('question_resolve');
    expect(classifyStopVerdict(proceed, {}).op).toBe('question_resolve');
    expect(classifyStopVerdict(proceed, { workerFlaggedDeviation: false }).op).toBe(
      'question_resolve',
    );
  });

  it('the override never weakens a stop — a stop verdict still escalates on the AGENT matched_rule', () => {
    const stop: StopCheckVerdict = {
      verdict: 'stop',
      matched_rule: DEFAULT_STOP_RULE,
      reasoning: 'Deviation from the plan.',
    };
    const action = classifyStopVerdict(stop, { workerFlaggedDeviation: true });
    if (!isEscalateAction(action)) throw new Error('expected escalate action');
    // the agent's own matched_rule wins, not the synthetic second-eye rule
    expect(action.matched_rule).toBe(DEFAULT_STOP_RULE);
  });
});

// ─────────────────────────────────────────────────────────────────────
// partner_voice_summary is communication, not routing
// ─────────────────────────────────────────────────────────────────────

describe('stop-check: partner_voice_summary is relay-only (ignored by the router)', () => {
  it('carries on the verdict type but does not affect the routed action', () => {
    const withVoice: StopCheckVerdict = {
      verdict: 'proceed',
      reasoning: 'Within plan.',
      partner_voice_summary: 'Proceed — reuses the phase-1 pattern, no deviation.',
    };
    const action = classifyStopVerdict(withVoice);
    // routing is identical to the same verdict without the summary
    expect(action).toEqual({ op: 'question_resolve', source: 'ai', reasoning: 'Within plan.' });
    // and the field is readable off the verdict for the SKILL to relay
    expect(withVoice.partner_voice_summary).toContain('Proceed');
  });
});
