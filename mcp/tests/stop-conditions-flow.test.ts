/**
 * Behavioral coverage for the NEW autonomy model:
 *   ephemeral refine walk-style  +  global build.stop conditions.
 *
 * The pre-V0.3.x model persisted a `task.autonomy` field with three
 * levels (`ask_all` / `ask_high_only` / `decide_all`) and branched the
 * build's failures-loop on it. That field is GONE (parser drops it; no
 * MCP op; no schema slot). This file is the durable, executable record
 * that the new model covers EVERY behavior the three old levels covered —
 * the explicit mapping AC2 asks for, exercised through the REAL factory
 * ops, the REAL `classifyStopVerdict` seam, and the REAL shipped
 * `anchored.yml.build.stop` default.
 *
 * The mapping (old behavior → new mechanism):
 *
 *   OLD `ask_all`        →  refine walk-style 'all-together': every open
 *                           question is walked WITH the user (source='user').
 *   OLD `ask_high_only`  →  refine walk-style 'high-together': high-priority
 *                           questions walked with the user; medium+low
 *                           decided by the AI (source='ai', reasoning).
 *   OLD `decide_all`     →  refine walk-style 'AI-all': every open question
 *                           decided by the AI (source='ai', reasoning).
 *
 *   OLD build failure-handling branch (block-on-first / retry-then-ask /
 *   retry-then-continue, keyed on the persisted level)
 *                        →  build is now MAXIMALLY autonomous: it retries
 *                           bounded by build.retry_limit, and only HALTS on
 *                           an emergent decision that matches build.stop —
 *                           routed deterministically by classifyStopVerdict.
 *
 * The walk-style is purely ephemeral, so there's nothing persisted to
 * assert about it — what we CAN pin is the priority-threshold function
 * the SKILL applies (asksThisPriority), which is the load-bearing
 * behavior the old `autonomy` field used to drive. We re-implement that
 * pure predicate here exactly as the refine SKILL specifies and assert
 * it reproduces each old level's question-routing, then drive the
 * RESULTING resolutions through the real question ops.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  classifyStopVerdict,
  isEscalateAction,
  DEFAULT_STOP_RULE,
  type StopCheckVerdict,
} from '../src/core/stop-check.js';
import { parseAnchoredYml } from '../src/schema/anchored-yml.js';
import { parseTaskFileYAML } from '../src/parser/parse.js';
import { createOps } from '../src/core/factory.js';
import { createFixture, type Fixture } from './core/_fixture.js';

let fixture: Fixture | null = null;
afterEach(async () => {
  if (fixture) await fixture.cleanup();
  fixture = null;
});

// ─────────────────────────────────────────────────────────────────────
// The ephemeral walk-style → question-routing predicate.
//
// This is the EXACT predicate the /impl-refine SKILL Stage 3 applies
// (kept in lock-step with the SKILL prose). It replaces the old
// `autonomy`-keyed `asksThisPriority`. We pin it here so the mapping
// from each old level to its replacement walk-style is executable.
// ─────────────────────────────────────────────────────────────────────

type WalkStyle = 'all-together' | 'high-together' | 'AI-all';
type Priority = 'high' | 'medium' | 'low';

function asksUser(walkStyle: WalkStyle, priority: Priority): boolean {
  if (walkStyle === 'all-together') return true;
  if (walkStyle === 'AI-all') return false;
  // high-together
  return priority === 'high';
}

describe('new-model mapping: ephemeral walk-style reproduces the three old autonomy levels (AC2)', () => {
  it("OLD ask_all === walk-style 'all-together': asks the user on every priority", () => {
    expect(asksUser('all-together', 'high')).toBe(true);
    expect(asksUser('all-together', 'medium')).toBe(true);
    expect(asksUser('all-together', 'low')).toBe(true);
  });

  it("OLD decide_all === walk-style 'AI-all': AI decides every priority (never asks)", () => {
    expect(asksUser('AI-all', 'high')).toBe(false);
    expect(asksUser('AI-all', 'medium')).toBe(false);
    expect(asksUser('AI-all', 'low')).toBe(false);
  });

  it("OLD ask_high_only === walk-style 'high-together': asks user on high, AI on medium+low", () => {
    expect(asksUser('high-together', 'high')).toBe(true);
    expect(asksUser('high-together', 'medium')).toBe(false);
    expect(asksUser('high-together', 'low')).toBe(false);
  });
});

// A drafted task with one question per priority — the input the refine
// walk consumes. Each walk-style routes these three differently.
const THREE_PRIORITY_TASK = `schema_version: 2
slug: walk-sample
status: drafted
created: 2026-05-26
title: Walk-style sample
context:
  intro: A drafted task with one open question per priority.
phases:
  - name: Only Phase
    slug: only
    status: pending
    acceptance_criteria:
      - text: ship the thing
        status: pending
questions:
  - id: q1
    text: "High-priority architecture call?"
    priority: high
    origin: plan-agent
    status: open
    created_at: 2026-05-26T00:00:00.000Z
  - id: q2
    text: "Medium-priority shape call?"
    priority: medium
    origin: plan-agent
    status: open
    created_at: 2026-05-26T00:00:00.000Z
  - id: q3
    text: "Low-priority naming call?"
    priority: low
    origin: plan-agent
    status: open
    created_at: 2026-05-26T00:00:00.000Z
`;

describe('new-model mapping: walk-style drives source on real resolutions (AC2)', () => {
  // Helper: walk all open questions under a style, resolving each via the
  // REAL question ops with the source the predicate dictates. Returns the
  // resolved task so the test can assert the source split.
  async function walk(walkStyle: WalkStyle) {
    fixture = await createFixture({ slug: 'walk-sample', taskYml: THREE_PRIORITY_TASK });
    const ops = createOps(fixture.config, fixture.root);
    const open = (await ops.task.read('walk-sample')).questions!.filter((q) => q.status === 'open');
    for (const q of open) {
      if (asksUser(walkStyle, q.priority as Priority)) {
        await ops.task.question.resolve('walk-sample', q.id, {
          answer: `user answer for ${q.id}`,
          source: 'user',
        });
      } else {
        await ops.task.question.resolve('walk-sample', q.id, {
          answer: `ai decision for ${q.id}`,
          source: 'ai',
          reasoning: `Within-plan default for ${q.priority} question — documented.`,
        });
      }
    }
    return ops.task.read('walk-sample');
  }

  it("'all-together' (old ask_all): all three resolved source='user', zero ai", async () => {
    const after = await walk('all-together');
    const qs = after.questions!;
    expect(qs.every((q) => q.status === 'resolved')).toBe(true);
    expect(qs.filter((q) => q.source === 'user')).toHaveLength(3);
    expect(qs.filter((q) => q.source === 'ai')).toHaveLength(0);
  });

  it("'AI-all' (old decide_all): all three resolved source='ai' with reasoning", async () => {
    const after = await walk('AI-all');
    const qs = after.questions!;
    expect(qs.every((q) => q.status === 'resolved')).toBe(true);
    expect(qs.filter((q) => q.source === 'ai')).toHaveLength(3);
    // Every ai resolution carries non-empty reasoning (the invariant).
    expect(qs.every((q) => (q.reasoning ?? '').trim().length > 0)).toBe(true);
  });

  it("'high-together' (old ask_high_only): high=user, medium+low=ai", async () => {
    const after = await walk('high-together');
    const byId = Object.fromEntries(after.questions!.map((q) => [q.id, q]));
    expect(byId.q1!.source).toBe('user'); // high → user
    expect(byId.q2!.source).toBe('ai'); // medium → ai
    expect(byId.q3!.source).toBe('ai'); // low → ai
    // The delegated ones carry reasoning.
    expect((byId.q2!.reasoning ?? '').trim().length).toBeGreaterThan(0);
    expect((byId.q3!.reasoning ?? '').trim().length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The old build-time failure-handling branch (keyed on autonomy) is
// REPLACED by: maximally-autonomous run + halt only on a build.stop
// match, routed by classifyStopVerdict. These pin that replacement.
// ─────────────────────────────────────────────────────────────────────

const BUILD_DECISION_TASK = `schema_version: 2
slug: build-decision
status: build
created: 2026-05-26
title: Build decision sample
context:
  intro: A task mid-build with a pending emergent decision.
  plan: |
    Decisions:
    - storage uses the existing JSON-file pattern from phase 1
phases:
  - name: Build Phase
    slug: build-phase
    status: in-progress
    acceptance_criteria:
      - text: persists state
        status: pending
questions:
  - id: q1
    text: "Build phase — emergent: which persistence detail?"
    priority: medium
    origin: plan-agent
    status: open
    created_at: 2026-05-26T00:00:00.000Z
`;

describe('new-model mapping: build runs autonomous, halts only on a build.stop match (AC2)', () => {
  it('within-plan emergent decision → PROCEED → documented (no halt, replaces decide_all auto-continue)', async () => {
    fixture = await createFixture({
      slug: 'build-decision',
      taskYml: BUILD_DECISION_TASK,
    });
    const ops = createOps(fixture.config, fixture.root);

    // Agent judged the decision as within-plan → proceed.
    const verdict: StopCheckVerdict = {
      verdict: 'proceed',
      reasoning:
        'Uses the existing JSON-file pattern from phase 1, exactly as the ' +
        'plan specifies. No deviation; matches no stop-rule.',
    };
    const action = classifyStopVerdict(verdict);
    expect(action.op).toBe('question_resolve');
    if (action.op !== 'question_resolve') throw new Error('expected resolve');

    // The build documents it autonomously and KEEPS GOING — the
    // equivalent of the old decide_all "decide + continue", but now
    // gated by stop-check rather than a persisted level.
    const after = await ops.task.question.resolve('build-decision', 'q1', {
      answer: 'Use the existing JSON-file pattern from phase 1.',
      source: action.source,
      reasoning: action.reasoning,
    });
    const decision = after.questions!.find((q) => q.id === 'q1')!;
    expect(decision.status).toBe('resolved');
    expect(decision.source).toBe('ai');
    expect(decision.reasoning).toBe(verdict.reasoning);
    // No NEW escalation — the run was not halted.
    expect(after.questions!).toHaveLength(1);
  });

  it('plan-deviating emergent decision → STOP → escalate, decision stays open (replaces ask_all block-on-first)', async () => {
    fixture = await createFixture({
      slug: 'build-decision',
      taskYml: BUILD_DECISION_TASK,
    });
    const ops = createOps(fixture.config, fixture.root);
    const cfg = parseAnchoredYml({}); // shipped default build.stop

    const verdict: StopCheckVerdict = {
      verdict: 'stop',
      matched_rule: cfg.build.stop[0]!,
      reasoning:
        'Worker wants a SQLite dependency; the plan specifies the JSON-file ' +
        'pattern. Net-new direction → deviates from the plan.',
    };
    const action = classifyStopVerdict(verdict);
    expect(isEscalateAction(action)).toBe(true);
    if (!isEscalateAction(action)) throw new Error('expected escalate');
    expect(action.matched_rule).toBe(DEFAULT_STOP_RULE);

    // The build escalates (high-priority, origin stop-check) and HALTS —
    // the user is brought in, just like the old ask_all block-on-decision,
    // but now triggered by a stop-rule MATCH rather than every decision.
    const { id } = await ops.task.question.add('build-decision', {
      text: `Build halted by stop-rule "${action.matched_rule}": ${action.reasoning}`,
      priority: action.priority,
      origin: action.origin,
      phase: 'build-phase',
    });
    const after = await ops.task.read('build-decision');
    const escalation = after.questions!.find((q) => q.id === id)!;
    expect(escalation.status).toBe('open');
    expect(escalation.origin).toBe('stop-check');
    expect(escalation.priority).toBe('high');
    // The original emergent decision was NOT auto-resolved by the halt.
    const original = after.questions!.find((q) => q.id === 'q1')!;
    expect(original.status).toBe('open');
  });

  it('the persisted `autonomy` field no longer exists: an old on-disk value is dropped on parse (AC5/AC6)', () => {
    // A pre-migration task-file carrying the legacy top-level autonomy key
    // must still load — the parser shim drops the field rather than
    // rejecting. Proves no code path reads a persisted autonomy knob.
    const legacy = `schema_version: 2
slug: legacy
status: refined
created: 2026-05-26
title: Legacy autonomy task
autonomy: decide_all
context:
  intro: An old task-file from before the autonomy field was removed.
phases:
  - name: P
    slug: p
    status: pending
    acceptance_criteria:
      - text: do it
        status: pending
`;
    const parsed = parseTaskFileYAML(legacy);
    // The field is gone from the loaded object — never surfaced to callers.
    expect((parsed as Record<string, unknown>).autonomy).toBeUndefined();
    expect(parsed.slug).toBe('legacy');
    expect(parsed.status).toBe('refined');
  });
});
